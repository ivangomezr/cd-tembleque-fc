import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import ErrorToast from './components/ErrorToast'
import { PullIndicator } from './components/PullIndicator'
import { store } from './lib/store'
import Inicio from './pages/Inicio'
import Clasificacion from './pages/Clasificacion'
import Jugadores from './pages/Jugadores'
import Partidos from './pages/Partidos'
import DetallePartido from './pages/DetallePartido'
import Estadisticas from './pages/Estadisticas'
import Admin from './pages/Admin'
import Historial from './pages/Historial'
import { CLUB, COMPETITION_LABEL, COMPETITION } from './config/club'
import Patrocinadores from './pages/Patrocinadores'

// ── Splash Screen ──
function SplashScreen({ onDone }) {
  const [fase, setFase] = useState('entrada')

  useEffect(() => {
    const t1 = setTimeout(() => setFase('espera'), 400)
    const t2 = setTimeout(() => setFase('salida'), 1800)
    const t3 = setTimeout(() => onDone(), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(160deg, #01153A 0%, #0f2a5c 55%, #01153A 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 24,
      opacity: fase === 'salida' ? 0 : 1,
      transition: fase === 'salida' ? 'opacity 0.4s ease' : 'none',
      pointerEvents: fase === 'salida' ? 'none' : 'all',
    }}>
      {/* Escudo con pulso */}
      <div style={{
        opacity: fase === 'entrada' ? 0 : 1,
        transform: fase === 'entrada' ? 'scale(0.7)' : 'scale(1)',
        transition: 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <div style={{ position: 'relative', width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '2px solid rgba(159,194,236,0.35)', animation: 'splashPing 1.8s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', inset: -18, borderRadius: '50%', border: '1px solid rgba(159,194,236,0.15)', animation: 'splashPing 1.8s ease-in-out 0.35s infinite' }} />
          <div style={{
            width: 120, height: 120, borderRadius: '50%',
            background: 'radial-gradient(circle, #0f2a5c 0%, #010d26 100%)',
            border: '2px solid rgba(159,194,236,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 50px rgba(41,90,152,0.6), inset 0 0 20px rgba(0,0,0,0.4)',
          }}>
            <img src={CLUB.crest} alt={CLUB.name} style={{ width: 88, height: 88, objectFit: 'contain' }} />
          </div>
        </div>
      </div>

      {/* Texto */}
      <div style={{
        textAlign: 'center',
        opacity: fase === 'entrada' ? 0 : 1,
        transform: fase === 'entrada' ? 'translateY(12px)' : 'translateY(0)',
        transition: 'opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s',
      }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 34, color: 'white', letterSpacing: '0.08em', lineHeight: 1 }}>
          {CLUB.name}
        </div>
        <div style={{ fontSize: 10, color: '#6f8db8', letterSpacing: '0.16em', marginTop: 6, textTransform: 'uppercase' }}>
          {COMPETITION_LABEL} · {COMPETITION.season}
        </div>
      </div>

      {/* Barra de carga */}
      <div style={{
        width: 110, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden',
        opacity: fase === 'entrada' ? 0 : 1,
        transition: 'opacity 0.4s ease 0.3s',
      }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, #295A98, #ffffff, #295A98)',
          backgroundSize: '200% 100%',
          animation: 'splashShimmer 1.2s ease-in-out infinite',
          borderRadius: 2,
        }} />
      </div>

      <style>{`
        @keyframes splashPing {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50%       { transform: scale(1.1); opacity: 0.15; }
        }
        @keyframes splashShimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
    </div>
  )
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('Service Worker registrado con éxito:', reg.scope);
        })
        .catch(err => {
          console.error('Fallo al registrar Service Worker:', err);
        });
    }
  }, [])

  const handleRefresh = async () => {
    await store.init()
  }

  return (
    <BrowserRouter>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <PullIndicator onRefresh={handleRefresh} />
      <Navbar />
      <ErrorToast />
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/clasificacion" element={<Clasificacion />} />
        <Route path="/jugadores" element={<Jugadores />} />
        <Route path="/partidos" element={<Partidos />} />
        <Route path="/partido/:id" element={<DetallePartido />} />
        <Route path="/estadisticas" element={<Estadisticas />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/patrocinadores" element={<Patrocinadores />} />
        <Route path="/historial" element={<Historial />} />
      </Routes>
    </BrowserRouter>
  )
}