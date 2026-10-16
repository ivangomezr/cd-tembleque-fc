/**
 * Lightweight client-side session.
 *
 * - Admin: password checked against VITE_ADMIN_PASSWORD_HASH (SHA-256, hex).
 * - Player: password checked server-side with the `validar_clave` RPC.
 *
 * ⚠️ This only gates the UI. Real protection must come from Supabase Auth + RLS
 * (see README › Security). In development, if no hash is configured, the admin
 * password is "admin".
 */
import { STORAGE_PREFIX } from '../config/club'

const DEV_FALLBACK_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918' // "admin"
const ADMIN_PASSWORD_HASH =
  (import.meta.env.VITE_ADMIN_PASSWORD_HASH || (import.meta.env.DEV ? DEV_FALLBACK_HASH : '')).toLowerCase()

const KEY_AUTH = `${STORAGE_PREFIX}auth`
const KEY_JUGADOR = `${STORAGE_PREFIX}jugador_activo`
const SESSION_MS = 8 * 60 * 60 * 1000

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function readToken() {
  try {
    const token = JSON.parse(localStorage.getItem(KEY_AUTH))
    if (!token?.ts || Date.now() - token.ts > SESSION_MS) {
      localStorage.removeItem(KEY_AUTH)
      return null
    }
    return token
  } catch {
    return null
  }
}

const writeToken = (role) => {
  try { localStorage.setItem(KEY_AUTH, JSON.stringify({ role, ts: Date.now() })) } catch { /* ignore */ }
}

export const adminAuth = {
  /** Returns true when the password is the admin password. */
  async login(password) {
    if (!ADMIN_PASSWORD_HASH) return false
    if ((await sha256(password)) !== ADMIN_PASSWORD_HASH) return false
    writeToken('admin')
    return true
  },
  loginAsPlayer: () => writeToken('player'),
  isLogged: () => !!readToken(),
  isSuperAdmin: () => readToken()?.role === 'admin',
  logout() {
    try {
      localStorage.removeItem(KEY_AUTH)
      localStorage.removeItem(KEY_JUGADOR)
    } catch { /* ignore */ }
  },
  getJugador() {
    try { return JSON.parse(localStorage.getItem(KEY_JUGADOR)) } catch { return null }
  },
  setJugador(jugador) {
    try { localStorage.setItem(KEY_JUGADOR, JSON.stringify(jugador)) } catch { /* ignore */ }
  },
  /** Re-checks a password as admin without logging in (used for destructive actions). */
  async verifyAdmin(password) {
    return !!ADMIN_PASSWORD_HASH && (await sha256(password)) === ADMIN_PASSWORD_HASH
  },
}
