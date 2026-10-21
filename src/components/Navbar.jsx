import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { haptics } from '../lib/haptics'
import { useAuth } from '../hooks/useAuth'
import LoginSheet from './LoginSheet'
import { CLUB, COMPETITION_LABEL } from '../config/club'
import PlayerAvatar from './PlayerAvatar'
import TeamCrest from './TeamCrest'

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

  const auth = useAuth()
  const logged = auth.isLogged
  const jugadorActivo = auth.jugadorId ? jugadores.find(j => j.id === auth.jugadorId) || null : null
  const [showModal, setShowModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  // Swipe desde borde izquierdo
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)

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
    setShowMenu(false)
    setShowModal(true)
  }

  const handleLogout = async () => {
    setShowMenu(false)
    await auth.signOut()
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
          <TeamCrest src={CLUB.crest} name={CLUB.name} alt="Escudo" size={42}
            onClick={() => navigate('/')} imgStyle={{ cursor: 'pointer' }} />

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
              <PlayerAvatar jugador={jugadorActivo} size={22} ring={false} />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: logged ? 14 : 0 }}>
                <TeamCrest src={CLUB.crest} name={CLUB.name} alt="" size={36} />
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

              {/* Cuenta sin ficha de jugador (p. ej. administrador) */}
              {logged && !jugadorActivo && (
                <div style={{ background: 'rgba(41,90,152,0.3)', borderRadius: 12, padding: '10px 12px', color: 'white', fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>{auth.profile?.nombre || auth.session?.user?.email}</div>
                  <div style={{ fontSize: 11, color: '#9fc2ec' }}>Rol: {auth.role}</div>
                </div>
              )}
              {/* Info jugador activo */}
              {logged && jugadorActivo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(41,90,152,0.3)', borderRadius: 12, padding: '10px 12px' }}>
                  <PlayerAvatar jugador={jugadorActivo} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {jugadorActivo.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: '#9fc2ec' }}>#{jugadorActivo.dorsal} · {jugadorActivo.posicion} · {auth.role}</div>
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

              {/* Panel Admin: solo con rol admin/superadmin (la base de datos lo exige igualmente) */}
              {auth.isAdmin && (
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

      {/* ── Login ── */}
      {showModal && (
        <LoginSheet
          jugadores={jugadores}
          onClose={() => setShowModal(false)}
          onSuccess={(st) => { setShowModal(false); navigate(st.role === 'admin' || st.role === 'superadmin' ? '/admin' : '/') }}
        />
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
