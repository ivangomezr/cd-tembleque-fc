import { useAuth } from '../hooks/useAuth'

/** Tells the user when their session ended on its own (expired / revoked). */
export default function SessionNotice() {
  const { expired, dismissExpired } = useAuth()
  if (!expired) return null
  return (
    <div role="status" onClick={dismissExpired} style={{
      position: 'fixed', left: 12, right: 12, top: 'calc(70px + env(safe-area-inset-top))', zIndex: 1900, maxWidth: 656, margin: '0 auto',
      background: 'var(--navy)', color: 'white', borderRadius: 12, padding: '10px 14px', fontSize: 13, boxShadow: '0 6px 24px rgba(0,0,0,.25)', cursor: 'pointer',
    }}>
      🔒 Tu sesión ha caducado. Vuelve a entrar desde el menú para seguir editando. <u>Cerrar</u>
    </div>
  )
}
