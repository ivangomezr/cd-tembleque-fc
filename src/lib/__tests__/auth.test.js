import { describe, it, expect } from 'vitest'
import {
  createAuthService, roleFromProfile, can, hasRole, playerEmail, isSessionExpired,
  authErrorMessage, purgeLegacyAuth, LEGACY_STORAGE_KEYS, ROLES,
} from '../auth'
import { playerEmail as scriptPlayerEmail } from '../../../scripts/auth-admin.mjs'

// ── Test doubles ─────────────────────────────────────────────────────────────
const now = () => Math.floor(Date.now() / 1000)
const session = (userId, { expiresIn = 3600, token = `at-${userId}-${Math.random()}` } = {}) =>
  ({ user: { id: userId }, access_token: token, refresh_token: `rt-${userId}`, expires_at: now() + expiresIn })

function memoryStorage(initial = {}) {
  const data = { ...initial }
  const writes = []
  return {
    data, writes,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { writes.push(k); data[k] = String(v) },
    removeItem: (k) => { delete data[k] },
  }
}

/**
 * Minimal fake of the parts of supabase-js the service uses.
 * accounts: { email: { password, userId } }   profiles: { userId: { rol, jugador_id } }
 */
function fakeClient({ accounts = {}, profiles = {}, initialSession = null, refreshOk = true } = {}) {
  let listener = null
  const calls = { signOut: [], signIn: [] }
  let current = initialSession
  return {
    calls,
    emit: (event, s) => listener?.(event, s),
    auth: {
      getSession: async () => ({ data: { session: current } }),
      onAuthStateChange: (fn) => { listener = fn; return { data: { subscription: { unsubscribe() { listener = null } } } } },
      signInWithPassword: async ({ email, password }) => {
        calls.signIn.push(email)
        const acc = accounts[email]
        if (!acc || acc.password !== password) return { data: { session: null }, error: { status: 400, message: 'Invalid login credentials' } }
        current = session(acc.userId)
        return { data: { session: current }, error: null }
      },
      signOut: async (opts) => { calls.signOut.push(opts); current = null; return { error: null } },
      refreshSession: async () => {
        if (!refreshOk || !current) return { data: { session: null }, error: { message: 'Invalid Refresh Token' } }
        current = session(current.user.id)
        return { data: { session: current }, error: null }
      },
    },
    from: (table) => {
      let uid = null
      const q = {
        select: () => q,
        eq: (_col, v) => { uid = v; return q },
        maybeSingle: async () => ({ data: table === 'perfiles' ? profiles[uid] ?? null : null, error: null }),
      }
      return q
    },
  }
}

const tick = () => new Promise((r) => setTimeout(r, 5))
const DOMAIN = 'jugadores.test'

// ── Roles ────────────────────────────────────────────────────────────────────
describe('roles', () => {
  it('maps sessions and profiles to roles', () => {
    expect(roleFromProfile(null, { rol: 'admin' })).toBe(ROLES.VISITANTE)
    expect(roleFromProfile(session('u'), null)).toBe(ROLES.VISITANTE)
    expect(roleFromProfile(session('u'), { rol: 'jugador' })).toBe(ROLES.JUGADOR)
    expect(roleFromProfile(session('u'), { rol: 'superadmin' })).toBe(ROLES.SUPERADMIN)
    expect(roleFromProfile(session('u'), { rol: 'god-mode' })).toBe(ROLES.VISITANTE)
  })

  it('applies the permission matrix', () => {
    expect(can('visitante', 'vote')).toBe(false)
    expect(can('jugador', 'vote')).toBe(true)
    expect(can('jugador', 'manage')).toBe(false)
    expect(can('admin', 'manage')).toBe(true)
    expect(can('admin', 'closeSeason')).toBe(false)
    expect(can('admin', 'viewLog')).toBe(false)
    expect(can('superadmin', 'closeSeason')).toBe(true)
    expect(hasRole('superadmin', 'admin')).toBe(true)
    expect(hasRole('unknown', 'jugador')).toBe(false)
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────
describe('helpers', () => {
  it('builds the same synthetic player email as the provisioning script', () => {
    expect(playerEmail(7, DOMAIN)).toBe('jugador-7@jugadores.test')
    expect(playerEmail(7)).toBe(scriptPlayerEmail(7))
    expect(() => playerEmail('abc')).toThrow()
  })

  it('detects expired sessions with clock skew', () => {
    expect(isSessionExpired(null)).toBe(true)
    expect(isSessionExpired(session('u', { expiresIn: 3600 }))).toBe(false)
    expect(isSessionExpired(session('u', { expiresIn: 10 }))).toBe(true) // inside 30s skew
    expect(isSessionExpired(session('u', { expiresIn: -5 }), Date.now(), 0)).toBe(true)
  })

  it('maps auth errors without revealing whether an account exists', () => {
    expect(authErrorMessage({ status: 400, message: 'Invalid login credentials' })).toBe('Datos de acceso incorrectos.')
    expect(authErrorMessage({ status: 429, message: 'Request rate limit reached' })).toMatch(/Demasiados intentos/)
  })

  it('removes the legacy client-side tokens', () => {
    const st = memoryStorage({ cdt_auth: '{"role":"admin"}', cdt_jugador_activo: '{"id":1}', other: 'keep' })
    purgeLegacyAuth(st)
    LEGACY_STORAGE_KEYS.forEach((k) => expect(st.getItem(k)).toBeNull())
    expect(st.getItem('other')).toBe('keep')
  })
})

// ── Authentication ───────────────────────────────────────────────────────────
describe('authentication', () => {
  const accounts = {
    'jugador-7@jugadores.test': { password: '12345678', userId: 'u-player' },
    'jugador-8@jugadores.test': { password: '87654321', userId: 'u-unlinked' },
    'boss@club.es': { password: 'correct horse', userId: 'u-admin' },
  }
  const profiles = {
    'u-player': { rol: 'jugador', jugador_id: 7 },
    'u-unlinked': { rol: 'jugador', jugador_id: 99 },
    'u-admin': { rol: 'superadmin', jugador_id: null },
  }

  it('starts as visitor when there is no session', async () => {
    const svc = createAuthService(fakeClient(), { playerDomain: DOMAIN, storage: memoryStorage() })
    const st = await svc.init()
    expect(st).toMatchObject({ status: 'ready', role: 'visitante', session: null })
  })

  it('logs a player in with name + PIN and links the player row', async () => {
    const c = fakeClient({ accounts, profiles })
    const svc = createAuthService(c, { playerDomain: DOMAIN, storage: memoryStorage() })
    await svc.init()
    const st = await svc.signInPlayer(7, '12345678')
    expect(c.calls.signIn).toEqual(['jugador-7@jugadores.test'])
    expect(st).toMatchObject({ role: 'jugador', jugadorId: 7 })
  })

  it('rejects a wrong PIN and stays visitor', async () => {
    const svc = createAuthService(fakeClient({ accounts, profiles }), { playerDomain: DOMAIN, storage: memoryStorage() })
    await svc.init()
    let msg = ''
    try { await svc.signInPlayer(7, '0000') } catch (e) { msg = e.message }
    expect(msg).toBe('Datos de acceso incorrectos.')
    expect(svc.getState().role).toBe('visitante')
  })

  it('refuses an account linked to a different player and signs it out', async () => {
    const c = fakeClient({ accounts, profiles })
    const svc = createAuthService(c, { playerDomain: DOMAIN, storage: memoryStorage() })
    await svc.init()
    let msg = ''
    try { await svc.signInPlayer(8, '87654321') } catch (e) { msg = e.message }
    expect(msg).toMatch(/no está vinculada/)
    expect(c.calls.signOut).toHaveLength(1)
    expect(svc.getState().session).toBeNull()
  })

  it('logs an admin in with email and password and reads the role from the profile', async () => {
    const svc = createAuthService(fakeClient({ accounts, profiles }), { playerDomain: DOMAIN, storage: memoryStorage() })
    await svc.init()
    const st = await svc.signInWithEmail('boss@club.es', 'correct horse')
    expect(st.role).toBe('superadmin')
    expect(can(st.role, 'closeSeason')).toBe(true)
  })

  it('treats an authenticated user without profile as a visitor', async () => {
    const c = fakeClient({ accounts: { 'x@y.z': { password: 'pw123456', userId: 'u-x' } } })
    const svc = createAuthService(c, { playerDomain: DOMAIN, storage: memoryStorage() })
    await svc.init()
    const st = await svc.signInWithEmail('x@y.z', 'pw123456')
    expect(st.session).not.toBeNull()
    expect(st.role).toBe('visitante')
  })

  it('never writes its own tokens or credentials to storage', async () => {
    const st = memoryStorage()
    const svc = createAuthService(fakeClient({ accounts, profiles }), { playerDomain: DOMAIN, storage: st })
    await svc.init()
    await svc.signInPlayer(7, '12345678')
    await svc.signOut()
    expect(st.writes).toEqual([])
  })
})

// ── Session expiry & refresh ─────────────────────────────────────────────────
describe('session lifecycle', () => {
  const profiles = { 'u-admin': { rol: 'admin', jugador_id: null } }

  it('ignores a stored session whose access token is already expired', async () => {
    const svc = createAuthService(fakeClient({ profiles, initialSession: session('u-admin', { expiresIn: -60 }) }), { storage: memoryStorage() })
    const st = await svc.init()
    expect(st.role).toBe('visitante')
  })

  it('keeps the role when the access token is refreshed', async () => {
    const c = fakeClient({ profiles, initialSession: session('u-admin') })
    const svc = createAuthService(c, { storage: memoryStorage() })
    await svc.init()
    const fresh = session('u-admin', { token: 'new-token' })
    c.emit('TOKEN_REFRESHED', fresh)
    await tick()
    expect(svc.getState()).toMatchObject({ role: 'admin' })
    expect(svc.getState().session.access_token).toBe('new-token')
  })

  it('flags "expired" when the session ends without the user signing out', async () => {
    const c = fakeClient({ profiles, initialSession: session('u-admin') })
    const svc = createAuthService(c, { storage: memoryStorage() })
    await svc.init()
    c.emit('SIGNED_OUT', null) // e.g. refresh token revoked or expired
    await tick()
    expect(svc.getState()).toMatchObject({ role: 'visitante', session: null, expired: true })
    svc.dismissExpired()
    expect(svc.getState().expired).toBe(false)
  })

  it('ensureFreshSession refreshes a token close to expiry', async () => {
    const c = fakeClient({ profiles, initialSession: session('u-admin', { expiresIn: 3600 }) })
    const svc = createAuthService(c, { storage: memoryStorage() })
    await svc.init()
    // pretend the token is about to expire
    svc._handleAuthEvent('TOKEN_REFRESHED', session('u-admin', { expiresIn: 5, token: 'old' }))
    await tick()
    const s = await svc.ensureFreshSession()
    expect(s.access_token).not.toBe('old')
    expect(svc.getState().role).toBe('admin')
  })

  it('ends the session when the refresh token is rejected', async () => {
    const c = fakeClient({ profiles, initialSession: session('u-admin', { expiresIn: 3600 }), refreshOk: false })
    const svc = createAuthService(c, { storage: memoryStorage() })
    await svc.init()
    svc._handleAuthEvent('TOKEN_REFRESHED', session('u-admin', { expiresIn: 5 }))
    await tick()
    expect(await svc.ensureFreshSession()).toBeNull()
    expect(svc.getState()).toMatchObject({ role: 'visitante', expired: true })
  })
})

// ── Sign-out ─────────────────────────────────────────────────────────────────
describe('sign-out', () => {
  it('revokes this device session and clears role and player', async () => {
    const c = fakeClient({
      accounts: { 'jugador-7@jugadores.test': { password: '12345678', userId: 'u-player' } },
      profiles: { 'u-player': { rol: 'jugador', jugador_id: 7 } },
    })
    const svc = createAuthService(c, { playerDomain: DOMAIN, storage: memoryStorage() })
    await svc.init()
    await svc.signInPlayer(7, '12345678')
    await svc.signOut()
    expect(c.calls.signOut).toEqual([{ scope: 'local' }])
    expect(svc.getState()).toMatchObject({ role: 'visitante', jugadorId: null, session: null, expired: false })
  })

  it('clears local state even if the server call fails', async () => {
    const c = fakeClient({ profiles: { 'u-admin': { rol: 'admin' } }, initialSession: session('u-admin') })
    c.auth.signOut = async () => { throw new Error('offline') }
    const svc = createAuthService(c, { storage: memoryStorage() })
    await svc.init()
    await svc.signOut()
    expect(svc.getState().role).toBe('visitante')
  })

  it('does not show "expired" after a voluntary sign-out', async () => {
    const c = fakeClient({ profiles: { 'u-admin': { rol: 'admin' } }, initialSession: session('u-admin') })
    const svc = createAuthService(c, { storage: memoryStorage() })
    await svc.init()
    await svc.signOut()
    c.emit('SIGNED_OUT', null)
    await tick()
    expect(svc.getState().expired).toBe(false)
  })
})
