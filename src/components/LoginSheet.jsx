import { useState } from 'react'
import Sheet from './Sheet'
import { useAuth } from '../hooks/useAuth'
import { CLUB } from '../config/club'

/**
 * Login with Supabase Auth.
 *  - "Jugador": choose your name + personal PIN (same experience as before).
 *  - "Administración": email + password.
 * Rate limiting and lockouts are enforced by Supabase Auth on the server.
 */
export default function LoginSheet({ jugadores, onClose, onSuccess }) {
  const { signInPlayer, signInWithEmail, enabled } = useAuth()
  const [modo, setModo] = useState('jugador')
  const [jugadorSel, setJugadorSel] = useState('')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (modo === 'jugador' && !jugadorSel) return setError('Elige tu nombre.')
    setEnviando(true)
    try {
      const st = modo === 'jugador'
        ? await signInPlayer(Number(jugadorSel), pin)
        : await signInWithEmail(email, password)
      setPin(''); setPassword('')
      onSuccess?.(st)
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.')
    } finally {
      setEnviando(false)
    }
  }

  const eye = (
    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar' : 'Mostrar'}
      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 20, color: 'var(--gris-mid)', padding: 4 }}>
      {show ? '🙈' : '👁️'}
    </button>
  )

  return (
    <Sheet title="Acceso al equipo" onClose={onClose}>
      {!enabled ? (
        <div className="alert-error">El acceso no está disponible: falta configurar Supabase.</div>
      ) : (
        <>
          <div className="segmented" style={{ marginBottom: 16 }}>
            <button type="button" className={modo === 'jugador' ? 'active' : ''} onClick={() => { setModo('jugador'); setError('') }}>👕 Jugador</button>
            <button type="button" className={modo === 'admin' ? 'active' : ''} onClick={() => { setModo('admin'); setError('') }}>⚙️ Administración</button>
          </div>

          {error && <div className="alert-error" role="alert">{error}</div>}

          <form onSubmit={submit} autoComplete="on">
            {modo === 'jugador' ? (
              <>
                <div className="form-group">
                  <label className="label" htmlFor="login-jugador">Tu nombre</label>
                  <select id="login-jugador" className="select" value={jugadorSel} onChange={(e) => { setJugadorSel(e.target.value); setError('') }}>
                    <option value="">Selecciona tu nombre…</option>
                    {[...jugadores].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((j) => (
                      <option key={j.id} value={j.id}>{j.nombre}{j.dorsal ? ` — #${j.dorsal}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="login-pin">PIN personal</label>
                  <div style={{ position: 'relative' }}>
                    <input id="login-pin" className="input" type={show ? 'text' : 'password'} inputMode="numeric" autoComplete="current-password"
                      value={pin} onChange={(e) => { setPin(e.target.value); setError('') }} placeholder="Tu PIN" required style={{ paddingRight: 48 }} />
                    {eye}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="label" htmlFor="login-email">Email</label>
                  <input id="login-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} required />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="login-password">Contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <input id="login-password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password"
                      value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} required style={{ paddingRight: 48 }} />
                    {eye}
                  </div>
                </div>
              </>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={enviando} style={{ fontSize: 16 }}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--gris-mid)', marginTop: '1rem' }}>
            {modo === 'jugador' ? `¿No tienes PIN o lo has olvidado? Pídeselo a un administrador del ${CLUB.shortName}.` : 'Las cuentas de administración las crea el superadministrador.'}
          </p>
        </>
      )}
    </Sheet>
  )
}
