import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, SUPABASE_READY } from '../lib/supabase'
import { createAuthService, createDevAuthService, can, hasRole, ROLES } from '../lib/auth'

const playerDomain = import.meta.env.VITE_PLAYER_LOGIN_DOMAIN || undefined

/** One auth service per app. In production without Supabase, login is disabled. */
export const authService = SUPABASE_READY
  ? createAuthService(supabase, { playerDomain })
  : import.meta.env.DEV
    ? createDevAuthService()
    : null

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => authService?.getState() ?? { status: 'ready', role: ROLES.VISITANTE })

  useEffect(() => {
    if (!authService) return
    const off = authService.subscribe(setState)
    authService.init()
    return off
  }, [])

  const value = useMemo(() => ({
    ...state,
    enabled: !!authService,
    loading: state.status === 'loading',
    isLogged: !!state.session,
    isPlayer: !!state.jugadorId,
    isAdmin: hasRole(state.role, ROLES.ADMIN),
    isSuperAdmin: hasRole(state.role, ROLES.SUPERADMIN),
    can: (permission) => can(state.role, permission),
    signInPlayer: (id, pin) => authService.signInPlayer(id, pin),
    signInWithEmail: (email, pwd) => authService.signInWithEmail(email, pwd),
    signOut: () => authService?.signOut(),
    dismissExpired: () => authService?.dismissExpired(),
  }), [state])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
