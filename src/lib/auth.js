/**
 * Authentication & authorisation on top of Supabase Auth.
 *
 * - Identity: Supabase Auth sessions (short-lived JWT + rotating refresh token),
 *   refreshed automatically by supabase-js. We never store passwords, hashes or
 *   home-made tokens in the browser.
 * - Roles: read from `public.perfiles` (RLS: own row only). The UI uses them to
 *   decide what to show, but the real enforcement is in the database policies.
 * - Players keep the "pick your name + PIN" login: each player has a Supabase
 *   Auth account with a synthetic email `jugador-<id>@<domain>` and the PIN as
 *   password. Accounts are created from a trusted environment only
 *   (scripts/auth-admin.mjs).
 */

export const ROLES = Object.freeze({
  VISITANTE: 'visitante',
  JUGADOR: 'jugador',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
})

const RANK = { visitante: 0, jugador: 1, admin: 2, superadmin: 3 }

/** Minimum role needed for each capability. Mirrors the RLS policies. */
export const PERMISSIONS = Object.freeze({
  vote: ROLES.JUGADOR,
  manage: ROLES.ADMIN, // matches, squad, stats, league, sponsors, season settings
  closeSeason: ROLES.SUPERADMIN,
  viewLog: ROLES.SUPERADMIN,
})

export const hasRole = (role, minimum) => (RANK[role] ?? 0) >= (RANK[minimum] ?? Infinity)
export const can = (role, permission) => hasRole(role, PERMISSIONS[permission])

/** Role for a session + profile. Authenticated users without a profile are visitors. */
export function roleFromProfile(session, profile) {
  if (!session) return ROLES.VISITANTE
  const r = profile?.rol
  return r === ROLES.JUGADOR || r === ROLES.ADMIN || r === ROLES.SUPERADMIN ? r : ROLES.VISITANTE
}

export const DEFAULT_PLAYER_DOMAIN = 'jugadores.cdtembleque.app'

/** Synthetic login email of a player account. Must match scripts/auth-admin.mjs. */
export function playerEmail(jugadorId, domain = DEFAULT_PLAYER_DOMAIN) {
  const id = Number(jugadorId)
  if (!Number.isInteger(id) || id <= 0) throw new Error('Jugador no válido')
  return `jugador-${id}@${domain}`
}

/** True when the access token is expired or about to (within `skewSeconds`). */
export function isSessionExpired(session, now = Date.now(), skewSeconds = 30) {
  if (!session?.expires_at) return true
  return session.expires_at * 1000 <= now + skewSeconds * 1000
}

/** Keys used by the previous client-side auth. Removed on startup. */
export const LEGACY_STORAGE_KEYS = ['cdt_auth', 'cdt_jugador_activo', 'tj_admin_auth', 'tj_jugador_activo']

export function purgeLegacyAuth(storage = globalThis.localStorage) {
  if (!storage) return
  for (const k of LEGACY_STORAGE_KEYS) {
    try { storage.removeItem(k) } catch { /* ignore */ }
  }
}

/** Human message for an auth error (never reveals whether the account exists). */
export function authErrorMessage(error) {
  if (!error) return ''
  const status = error.status ?? error.code
  const msg = String(error.message || '').toLowerCase()
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
    return 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
  }
  if (msg.includes('invalid login') || msg.includes('invalid credentials') || status === 400) {
    return 'Datos de acceso incorrectos.'
  }
  if (msg.includes('fetch') || msg.includes('network')) return 'Sin conexión. Inténtalo de nuevo.'
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.'
}

const EMPTY = Object.freeze({
  status: 'loading', // 'loading' | 'ready'
  session: null,
  profile: null,
  role: ROLES.VISITANTE,
  jugadorId: null,
  expired: false, // true when the session ended without the user signing out
})

/**
 * Framework-agnostic auth service. `client` is a supabase-js client (or a test double).
 */
export function createAuthService(client, { playerDomain = DEFAULT_PLAYER_DOMAIN, storage } = {}) {
  let state = { ...EMPTY }
  let listeners = []
  let unsubscribe = null
  let signingOut = false
  let generation = 0 // discards stale profile loads after sign-out / user switch

  const set = (patch) => {
    state = { ...state, ...patch }
    listeners.forEach((fn) => fn(state))
  }

  async function loadProfile(userId) {
    const { data, error } = await client
      .from('perfiles')
      .select('rol, jugador_id, nombre')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data || null
  }

  async function applySession(session, { expired = false } = {}) {
    const gen = ++generation
    if (!session || isSessionExpired(session, Date.now(), 0)) {
      set({ ...EMPTY, status: 'ready', expired })
      return
    }
    let profile = null
    try {
      profile = await loadProfile(session.user.id)
    } catch (e) {
      console.error('[auth] could not load profile', e)
    }
    if (gen !== generation) return
    set({
      status: 'ready',
      session,
      profile,
      role: roleFromProfile(session, profile),
      jugadorId: profile?.jugador_id ?? null,
      expired: false,
    })
  }

  async function handleAuthEvent(event, session) {
    switch (event) {
      case 'SIGNED_OUT': {
        // Either the user signed out, or the refresh token was rejected/expired.
        const wasLoggedIn = !!state.session
        await applySession(null, { expired: wasLoggedIn && !signingOut })
        break
      }
      case 'TOKEN_REFRESHED':
        if (session && state.session?.user?.id === session.user.id) {
          set({ session }) // same user, just a new access token
          break
        }
        await applySession(session)
        break
      case 'INITIAL_SESSION':
        break // handled by init()
      case 'SIGNED_IN':
      case 'USER_UPDATED':
        // Skip the echo of a sign-in we already applied ourselves
        if (session?.access_token && session.access_token === state.session?.access_token) break
        await applySession(session)
        break
      default:
        break
    }
  }

  async function finishSignIn(data, error) {
    if (error) throw new Error(authErrorMessage(error))
    await applySession(data.session)
    return state
  }

  return {
    getState: () => state,

    subscribe(fn) {
      listeners.push(fn)
      return () => { listeners = listeners.filter((l) => l !== fn) }
    },

    async init() {
      purgeLegacyAuth(storage)
      const { data } = await client.auth.getSession() // refreshes an expired access token if possible
      await applySession(data?.session ?? null)
      if (!unsubscribe) {
        const { data: sub } = client.auth.onAuthStateChange((event, session) => {
          // Run outside the auth lock (supabase-js recommendation)
          setTimeout(() => handleAuthEvent(event, session), 0)
        })
        unsubscribe = () => sub?.subscription?.unsubscribe()
      }
      return state
    },

    /** Player login with the classic "name + PIN" form. */
    async signInPlayer(jugadorId, pin) {
      if (!pin) throw new Error('Introduce tu PIN.')
      const email = playerEmail(jugadorId, playerDomain)
      const { data, error } = await client.auth.signInWithPassword({ email, password: String(pin) })
      await finishSignIn(data, error)
      if (state.jugadorId !== Number(jugadorId)) {
        // Account exists but is not linked to that player: refuse and clean up.
        await this.signOut()
        throw new Error('Tu cuenta no está vinculada a este jugador. Habla con el administrador.')
      }
      return state
    },

    /** Email + password login (admins, or players with their own email). */
    async signInWithEmail(email, password) {
      if (!email || !password) throw new Error('Introduce email y contraseña.')
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
      return finishSignIn(data, error)
    },

    /** Ends this device's session (revokes its refresh token) and clears local state. */
    async signOut() {
      signingOut = true
      try {
        await client.auth.signOut({ scope: 'local' })
      } catch (e) {
        console.warn('[auth] signOut failed, clearing local state anyway', e)
      } finally {
        await applySession(null)
        signingOut = false
      }
    },

    /** Returns a valid session or null, refreshing the access token if needed. */
    async ensureFreshSession() {
      if (state.session && !isSessionExpired(state.session)) return state.session
      const { data, error } = await client.auth.refreshSession()
      if (error || !data?.session) {
        await applySession(null, { expired: !!state.session })
        return null
      }
      await applySession(data.session)
      return data.session
    },

    dismissExpired() { set({ expired: false }) },

    destroy() { unsubscribe?.(); unsubscribe = null; listeners = [] },

    // exposed for tests
    _handleAuthEvent: handleAuthEvent,
  }
}

/**
 * Development-only stand-in when Supabase is not configured. Everything lives in
 * memory (nothing persisted), so a reload logs you out.
 *   admin@local / admin  → superadmin       any player + PIN 123456 → jugador
 */
export function createDevAuthService() {
  const devProfiles = {}
  return createAuthService({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
      refreshSession: async () => ({ data: { session: null }, error: { message: 'dev' } }),
      signInWithPassword: async ({ email, password }) => {
        const m = /^jugador-(\d+)@/.exec(email)
        const ok = (email === 'admin@local' && password === 'admin') || (m && password === '123456')
        if (!ok) return { data: {}, error: { status: 400, message: 'Invalid login credentials' } }
        const user = { id: m ? `dev-player-${m[1]}` : 'dev-admin', email }
        devProfiles[user.id] = m ? { rol: 'jugador', jugador_id: Number(m[1]), nombre: null } : { rol: 'superadmin', jugador_id: null, nombre: 'Admin local' }
        return { data: { session: { user, access_token: 'dev', expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null }
      },
    },
    from: () => {
      let id = null
      const q = { select: () => q, eq: (_k, v) => { id = v; return q }, maybeSingle: async () => ({ data: devProfiles[id] || null, error: null }) }
      return q
    },
  })
}
