import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { adminAuth } from '../lib/adminAuth'
import { useStore } from '../hooks/useStore'
import { haptics } from '../lib/haptics'
import { supabase } from '../lib/supabase'
import { CLUB, COMPETITION_LABEL } from '../config/club'

const tabs = [
  { to: '/', label: 'Inicio', icon: '🏠' },
  { to: '/clasificacion', label: 'Tabla', icon: '🏆' },
  { to: '/jugadores', label: 'Plantilla', icon: '👕' },
  { to: '/partidos', label: 'Partidos', icon: '⚽' },
  { to: '/estadisticas', label: 'Stats', icon: '📊' },
]

const menuLinks = [
  { to: '/', label: 'Inicio', icon: '🏠' },
  { to: '/clasificacion', label: 'Clasificación', icon: '🏆' },
  { to: '/jugadores', label: 'Plantilla', icon: '👕' },
  { to: '/partidos', label: 'Partidos', icon: '⚽' },
  { to: '/estadisticas', label: 'Estadísticas', icon: '📊' },
  { to: '/patrocinadores', label: 'Patrocinadores', icon: '🤝' },
  { to: '/historial', label: 'Temporadas', icon: '📚' },
]

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { jugadores } = useStore()

  const [logged, setLogged] = useState(adminAuth.isLogged())
  const [jugadorActivo, setJugadorActivo] = useState(adminAuth.getJugador())
  const [showModal, setShowModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [pwd, setPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [jugadorSel, setJugadorSel] = useState('')
  const [error, setError] = useState('')
  const [intentos, setIntentos] = useState(0)
  const [bloqueado, setBloqueado] = useState(false)

  // Swipe desde borde izquierdo
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)

  useEffect(() => {
    const check = () => {
      setLogged(adminAuth.isLogged())
      setJugadorActivo(adminAuth.getJugador())
    }
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [])

  // Cerrar menú al cambiar de página
  useEffect(() => { setShowMenu(false) }, [location.pathname])

  // Swipe handlers — abrir con swipe derecha desde borde izquierdo
  useEffect(() => {
    const onTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
    }
    const onTouchEnd = (e) => {
      if (touchStartX.current === null) return
      const dx = e.changedTouches[0].clientX - touchStartX.current
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
      // Swipe derecha desde borde izquierdo (primeros 30px)
      if (touchStartX.current < 30 && dx > 60 && dy < 80) setShowMenu(true)
      // Swipe izquierda para cerrar
      if (showMenu && dx < -60 && dy < 80) setShowMenu(false)
      touchStartX.current = null
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [showMenu])

  const openModal = () => {
    setPwd(''); setJugadorSel(''); setError(''); setShowPwd(false)
    setShowMenu(false)
    setShowModal(true)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (bloqueado) return
    if (!jugadorSel) { setError('Elige tu nombre'); return }

    // 1. Intentamos login como Admin general (la contraseña larga que ya tenías)
    const isAdminLogin = await adminAuth.login(pwd)
    let isValidPlayer = false

    // 2. Si no es la de admin, comprobamos si es su PIN numérico en Supabase
    if (!isAdminLogin) {
      try {
        const { data: esValido, error: rpcError } = await supabase.rpc('validar_clave', {
          p_jugador_id: Number(jugadorSel),
          p_clave: pwd
        });
        if (!rpcError && esValido) {
          isValidPlayer = true
          adminAuth.loginAsPlayer()
        }
      } catch (err) {
        console.error("Error comprobando el PIN en Supabase:", err)
      }
    }

    // 3. Si fallan las dos cosas, bloqueamos
    if (!isAdminLogin && !isValidPlayer) {
      const nuevosIntentos = intentos + 1
      setIntentos(nuevosIntentos)
      if (nuevosIntentos >= 5) {
        setBloqueado(true)
        setError('Demasiados intentos. Espera 5 minutos.')
        setTimeout(() => { setBloqueado(false); setIntentos(0); setError('') }, 5 * 60 * 1000)
      } else {
        setError(`Contraseña o PIN incorrecto (${nuevosIntentos}/5 intentos)`)
      }
      return
    }

    // 4. Login exitoso (como admin o como jugador)
    const jugador = jugadores.find(j => j.id === Number(jugadorSel))
    if (jugador) {
      adminAuth.setJugador(jugador)
      setJugadorActivo(jugador)
    }

    setIntentos(0)
    setLogged(true)
    setShowModal(false)
    navigate('/')
  }

  const handleLogout = () => {
    adminAuth.logout()
    setLogged(false)
    setJugadorActivo(null)
    setShowMenu(false)
    navigate('/')
  }

  const navegar = (to) => {
    setShowMenu(false)
    navigate(to)
  }

  return (
    <>
      {/* ── Header ── */}
      <header className="top-header">
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px' }}>

          {/* Escudo — va a home */}
          <img
            src={"/escudo.png"} alt="Escudo"
            onClick={() => navigate('/')}
            style={{ width: 42, height: 42, objectFit: 'contain', flexShrink: 0, cursor: 'pointer' }}
          />

          {/* Título */}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 17, color: '#ffffff', letterSpacing: '0.06em', lineHeight: 1.1 }}>
              {CLUB.name}
            </div>
            <div style={{ fontSize: 10, color: '#6f8db8', letterSpacing: '0.07em' }}>
              {COMPETITION_LABEL.toUpperCase()}
            </div>
          </div>

          {/* Jugador activo (solo si logged) */}
          {logged && jugadorActivo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(159,194,236,0.1)', borderRadius: 20, padding: '4px 10px' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0, overflow: 'hidden' }}>
                {jugadorActivo.foto_url
                  ? <img src={jugadorActivo.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : jugadorActivo.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                }
              </div>
              <span style={{ fontSize: 12, color: '#9fc2ec', fontWeight: 600, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {jugadorActivo.nombre.split(' ')[0]}
              </span>
            </div>
          )}

          {/* Botón hamburguesa */}
          <button
            onClick={() => { haptics.tap(); setShowMenu(true) }}
            style={{ background: 'transparent', border: '1px solid #1d3a66', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}
            aria-label="Abrir menú"
          >
            <span style={{ display: 'block', width: 18, height: 2, background: '#9fc2ec', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 14, height: 2, background: '#9fc2ec', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 18, height: 2, background: '#9fc2ec', borderRadius: 2 }} />
          </button>
        </div>
      </header>

      {/* ── Bottom nav ── */}
      <nav className="bottom-nav">
        {tabs.map(t => (
          <button
            key={t.to}
            className={`bottom-nav-btn ${location.pathname === t.to || (t.to !== '/' && location.pathname.startsWith(t.to)) ? 'active' : ''}`}
            onClick={() => navigate(t.to)}
          >
            <span className="nav-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Menú lateral ── */}
      {showMenu && (
        <>
          {/* Overlay */}
          <div
            onClick={() => setShowMenu(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 800, backdropFilter: 'blur(2px)' }}
          />

          {/* Panel lateral */}
          <div style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 900,
            width: 280, background: '#01153A',
            display: 'flex', flexDirection: 'column',
            boxShadow: '4px 0 30px rgba(0,0,0,0.4)',
            animation: 'slideInLeft 0.22s ease',
            paddingTop: 'env(safe-area-inset-top)',
          }}>

            {/* Cabecera del menú */}
            <div style={{ padding: '1rem 1.25rem 1rem', borderBottom: '1px solid #0f2a5c' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: logged && jugadorActivo ? 14 : 0 }}>
                <img src={"/escudo.png"} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
                <div>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: '#ffffff', letterSpacing: '0.06em', lineHeight: 1 }}>
                    {CLUB.name}
                  </div>
                  <div style={{ fontSize: 9, color: '#6f8db8', letterSpacing: '0.07em' }}>
                    {COMPETITION_LABEL.toUpperCase()}
                  </div>
                </div>
                <button
                  onClick={() => setShowMenu(false)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6f8db8', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
                >✕</button>
              </div>

              {/* Info jugador activo */}
              {logged && jugadorActivo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(41,90,152,0.3)', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0, overflow: 'hidden' }}>
                    {jugadorActivo.foto_url
                      ? <img src={jugadorActivo.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : jugadorActivo.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {jugadorActivo.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: '#9fc2ec' }}>#{jugadorActivo.dorsal} · {jugadorActivo.posicion}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Links de navegación */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0' }}>
              {menuLinks.map(link => {
                const activo = location.pathname === link.to || (link.to !== '/' && location.pathname.startsWith(link.to))
                return (
                  <button
                    key={link.to}
                    onClick={() => { haptics.tap(); navegar(link.to) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      width: '100%', padding: '12px 20px',
                      background: activo ? 'rgba(41,90,152,0.4)' : 'transparent',
                      border: 'none', borderLeft: activo ? '3px solid var(--primary)' : '3px solid transparent',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 20, width: 24, textAlign: 'center' }}>{link.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: activo ? 700 : 400, color: activo ? 'white' : '#6b7c96', fontFamily: 'DM Sans, sans-serif' }}>
                      {link.label}
                    </span>
                    {activo && <span style={{ marginLeft: 'auto', color: 'var(--primary-light)', fontSize: 12 }}>●</span>}
                  </button>
                )
              })}

              {/* Separador */}
              <div style={{ margin: '8px 20px', height: 1, background: '#0f2a5c' }} />

              {/* Admin (solo si logged) */}
              {logged && (
                <button
                  onClick={() => navegar('/admin')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    width: '100%', padding: '12px 20px',
                    background: location.pathname === '/admin' ? 'rgba(41,90,152,0.4)' : 'transparent',
                    border: 'none', borderLeft: location.pathname === '/admin' ? '3px solid var(--primary-light)' : '3px solid transparent',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 20, width: 24, textAlign: 'center' }}>⚙️</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#ffffff', fontFamily: 'DM Sans, sans-serif' }}>
                    Panel Admin
                  </span>
                </button>
              )}
            </div>

            {/* Pie del menú — login/logout */}
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #0f2a5c' }}>
              {logged ? (
                <button
                  onClick={handleLogout}
                  style={{ width: '100%', padding: '11px', background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, color: '#e07070', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                >
                  🚪 Cerrar sesión
                </button>
              ) : (
                <button
                  onClick={openModal}
                  className="btn btn-primary btn-block"
                >
                  🔒 Acceso al equipo
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Modal login ── */}
      {showModal && (
        <>
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 900 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: 'white', borderRadius: '20px 20px 0 0', padding: '1.5rem', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))', boxShadow: '0 -4px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '-0.5rem auto 1.25rem' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.25rem' }}>
              <div style={{ background: 'linear-gradient(135deg,#01153A,#1b4580)', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <img src={"/escudo.png"} alt="" style={{ width: 42, height: 42, objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--primary)', lineHeight: 1 }}>
                  Acceso al equipo
                </div>
                <div style={{ fontSize: 12, color: 'var(--gris-mid)', marginTop: 2 }}>
                  Introduce la contraseña del vestuario
                </div>
              </div>
            </div>

            {error && (
              <div style={{ background: '#fde8e8', border: '1px solid #f5c0c0', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#c0392b' }}>
                {error}
              </div>
            )}

            <form
              onSubmit={handleLogin}
              autoComplete="on"
            >
              <div className="form-group">
                <label className="label">Tu nombre</label>
                <select
                  className="select"
                  value={jugadorSel}
                  onChange={e => { setJugadorSel(e.target.value); setError('') }}
                  autoComplete="username"
                >
                  <option value="">Selecciona tu nombre...</option>
                  {[...jugadores].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(j => (
                    <option key={j.id} value={j.id}>{j.nombre} — #{j.dorsal}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Contraseña personal (o Admin)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Tu contraseña..."
                    value={pwd}
                    onChange={e => { setPwd(e.target.value); setError('') }}
                    autoComplete="current-password"
                    required
                    style={{ paddingRight: 48 }} // Eliminamos el letter-spacing raro
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--gris-mid)', padding: 4 }}>
                    {showPwd ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={bloqueado}
                className="btn btn-primary btn-block"
                style={{ fontSize: 16, opacity: bloqueado ? 0.5 : 1 }}
              >
                {bloqueado ? '🔒 Bloqueado temporalmente' : 'Entrar al panel'}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--gris-mid)', marginTop: '1rem' }}>
              La contraseña la tiene el organizador
            </p>
          </div>
        </>
      )}

      {/* Animación slide-in */}
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0.5; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}
