import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { CLUB, COMPETITION_LABEL, COMPETITION } from '../config/club'
import { useStandings } from '../hooks/useStandings'
import { matchResult, matchSides } from '../lib/match'
import TeamCrest from '../components/TeamCrest'

function initials(nombre = '') {
  return nombre
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'
}

function Avatar({ jugador, size = 'sm' }) {
  const dim = size === 'sm' ? 32 : size === 'md' ? 42 : 64
  const fs = size === 'sm' ? 12 : size === 'md' ? 15 : 22

  return (
    <div
      className={`avatar avatar-${size}`}
      style={{ overflow: 'hidden', padding: 0, width: dim, height: dim, flexShrink: 0 }}
    >
      {jugador?.foto_url ? (
        <img
          src={jugador.foto_url}
          alt={jugador.nombre || 'Jugador'}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
        />
      ) : (
        <span style={{ fontSize: fs }}>{initials(jugador?.nombre)}</span>
      )}
    </div>
  )
}

function formatFecha(fecha) {
  if (!fecha) return '-'
  const d = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const resultadoPartido = (p) => matchResult(p) || 'empate'

function getCountdownLabel(fecha, hora, now) {
  const matchDate = new Date(`${fecha}T${hora}:00`);
  const diffMs = matchDate - now;

  if (Number.isNaN(matchDate.getTime())) {
    return { label: 'Fecha pendiente', dias: 0, horas: 0, pasado: false };
  }

  const pasado = diffMs < 0;

  // Horas absolutas para calcular cuándo mostrar "Faltan 23h" en la etiqueta pequeña
  const horasTotales = Math.floor(diffMs / (1000 * 60 * 60));
  const diasRestantes = Math.floor(horasTotales / 24);

  // Horas sueltas (0-23) para que el contador grande muestre "1 día y 6h"
  const horasSueltas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  let label = 'Próximamente';

  if (pasado) {
    label = 'En juego / Finalizado';
  } else if (horasTotales <= 24) {
    const esHoy = matchDate.toDateString() === now.toDateString();
    label = esHoy ? `Hoy · faltan ${horasTotales}h` : `Faltan ${horasTotales}h`;
  } else {
    label = diasRestantes === 1 ? 'Falta 1 día' : `Faltan ${diasRestantes} días`;
  }

  // IMPORTANTE: Devolvemos horasSueltas en la variable "horas" para el componente
  return { label, dias: diasRestantes, horas: horasSueltas, pasado };
}

export default function Inicio() {
  const nav = useNavigate()
  const { jugadores = [], partidos = [], stats = [], loading, store } = useStore()
  const { ownRow } = useStandings()
  const [ahora, setAhora] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const data = useMemo(() => {
    const nuestro = ownRow ? { pts: ownRow.pts, posCalculada: ownRow.pj ? ownRow.pos : '-' } : null

    const idsAmistosos = new Set(
      partidos.filter((p) => p.amistoso).map((p) => p.id)
    )

    const statsCompeticion = stats.filter((s) => !idsAmistosos.has(s.partido_id))
    const totalGoles = statsCompeticion.reduce((acc, s) => acc + (s.goles || 0), 0)

    const totales = jugadores.map((j) => {
      const ss = statsCompeticion.filter((s) => s.jugador_id === j.id)
      return {
        ...j,
        goles: ss.reduce((a, s) => a + (s.goles || 0), 0),
        asistencias: ss.reduce((a, s) => a + (s.asistencias || 0), 0),
      }
    })

    const goleador = [...totales].sort((a, b) => b.goles - a.goles)[0]
    const asistente = [...totales].sort((a, b) => b.asistencias - a.asistencias)[0]

    const nuestrosPartidos = partidos

    // Calcular resultados reales desde partidos (no desde clasificación manual)
    const jugados = nuestrosPartidos.filter(p => p.jugado && !p.amistoso)
    const resPartidos = jugados.map(p => resultadoPartido(p))
    const pgReal = resPartidos.filter(r => r === 'victoria').length
    const peReal = resPartidos.filter(r => r === 'empate').length
    const ppReal = resPartidos.filter(r => r === 'derrota').length
    const pjReal = jugados.length

    const ultimos = [...nuestrosPartidos]
      .filter((p) => p.jugado)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 3)

    const proximos = [...nuestrosPartidos]
      .filter((p) => !p.jugado)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))

    const proximo = proximos[0] || null

    return {
      nuestro,
      totalGoles,
      totales,
      goleador,
      asistente,
      ultimos,
      proximo,
      pgReal, peReal, ppReal, pjReal,
    }
  }, [jugadores, partidos, stats, ownRow])

  if (loading) {
    return (
      <div className="page">
        <div className="empty" style={{ marginTop: '3rem' }}>
          Cargando datos...
        </div>
      </div>
    )
  }

  const { nuestro, totalGoles, totales, goleador, asistente, ultimos, proximo, pgReal, peReal, ppReal, pjReal } = data
  const topGoleadores = [...totales].sort((a, b) => b.goles - a.goles).filter((j) => j.goles > 0).slice(0, 4)
  const maxGoles = Math.max(...totales.map((x) => x.goles || 0), 1)

  return (
    <div className="page">
      {/* Hero principal */}
      <section
        className="anim-scale"
        style={{
          background: 'linear-gradient(135deg,#01153A 0%,#163a72 60%,#295A98 100%)',
          borderRadius: 20,
          padding: '1.2rem',
          marginBottom: '1rem',
          border: '1px solid rgba(159,194,236,.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <img
            src="/escudo.png"
            alt={`Escudo ${CLUB.name}`}
            style={{ width: 78, height: 78, objectFit: 'contain', flexShrink: 0 }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontFamily: 'Bebas Neue',
                fontSize: 30,
                color: '#fff',
                letterSpacing: '.04em',
                lineHeight: 1,
              }}
            >
              {CLUB.name}
            </div>
            <div
              style={{
                color: '#b5cbe6',
                fontSize: 10,
                letterSpacing: '.10em',
                textTransform: 'uppercase',
                marginTop: 4,
              }}
            >
              {COMPETITION_LABEL} · {COMPETITION.season}
            </div>
          </div>
        </div>

        <div className="grid-3" style={{ marginTop: 12 }}>
          {[
            [`${nuestro?.posCalculada ?? '-'}º`, 'Posición'],
            [`${nuestro?.pts ?? 0}`, 'Puntos'],
            [`${pgReal}-${peReal}-${ppReal}`, 'V-E-D'],
          ].map(([valor, label]) => (
            <div
              key={label}
              style={{
                background: 'rgba(255,255,255,.07)',
                borderRadius: 10,
                padding: '8px 10px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: 'white', lineHeight: 1 }}>
                {valor}
              </div>
              <div style={{ fontSize: 10, color: '#cfdef0', marginTop: 2, letterSpacing: '.06em' }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Próximo partido */}
      {proximo ? (
        (() => {
                    const cd = getCountdownLabel(proximo.fecha, proximo.hora, ahora)

          return (
            <section
              className="card anim-fade-up anim-delay-1"
              style={{
                marginBottom: '1rem',
                background: 'linear-gradient(135deg,#0a2350 0%,#295A98 100%)',
                  border: 'none',
                color: 'white',
                              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--on-navy)', fontWeight: 700 }}>
                  Próximo partido · {proximo.amistoso ? 'Amistoso' : `Jornada ${proximo.jornada ?? '-'}`}
                </div>
                <span
                  className="badge"
                  style={{
                    background: cd.pasado ? 'var(--danger)' : 'rgba(255,255,255,.15)',
                    color: '#fff',
                    fontWeight: 700,
                  }}
                >
                  {cd.label}
                </span>
              </div>

              {/* Escudos enfrentados (local a la izquierda) */}
              {(() => {
                const { home, away } = matchSides(proximo, store.crestFor)
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    {[home, away].map((side, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, order: i === 0 ? 0 : 2 }}>
                        <TeamCrest src={side.crest} name={side.name} size={50} />
                        <div style={{ fontSize: 12, fontWeight: side.ours ? 700 : 500, textAlign: 'center', lineHeight: 1.2 }}>{side.name}</div>
                      </div>
                    ))}
                    <div style={{ order: 1, fontFamily: 'Bebas Neue', fontSize: 26, color: 'var(--on-navy)' }}>vs</div>
                  </div>
                )
              })()}

              {!cd.pasado && cd.dias > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 48, color: 'white', lineHeight: 1 }}>
                    {cd.dias}
                  </span>
                  <span style={{ fontSize: 14, color: '#d3e1f2' }}>días</span>
                  {cd.horas > 0 && (
                    <>
                      <span style={{ fontFamily: 'Bebas Neue', fontSize: 30, color: 'var(--on-navy)', lineHeight: 1 }}>{cd.horas}</span>
                      <span style={{ fontSize: 12, color: '#d3e1f2' }}>h</span>
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: '#dce8f6' }}>
                <span>📅 {formatFecha(proximo.fecha)}</span>
                <span>⏰ {proximo.hora || '--:--'}</span>
                <span>📍 {proximo.campo || 'Campo pendiente'}</span>
              </div>
            </section>
          )
        })()
      ) : (
        <section className="card anim-fade-up anim-delay-1" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 20, color: 'var(--primary)', marginBottom: 8 }}>Próximo partido</h2>
          <p style={{ color: 'var(--gris-mid)' }}>Aún no hay partidos próximos programados.</p>
        </section>
      )}

      {/* Métricas */}
      <section className="grid-4 anim-fade-up anim-delay-2" style={{ marginBottom: '1rem' }}>
        {[
          ['Goles', totalGoles, `${pjReal} jornadas`],
          ['Victorias', pgReal, `de ${pjReal} jugados`],
          ['Goleador', goleador?.goles ?? 0, goleador?.nombre?.split(' ')[0] || '-'],
          ['Asistente', asistente?.asistencias ?? 0, asistente?.nombre?.split(' ')[0] || '-'],
        ].map(([label, value, sub]) => (
          <article key={label} className="metric-card">
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
            <div className="metric-sub">{sub}</div>
          </article>
        ))}
      </section>

      {/* Últimos partidos */}
      <section className="card anim-fade-up anim-delay-3" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 20, color: 'var(--primary)' }}>Últimos partidos</h2>
          <button
            onClick={() => nav('/partidos')}
            style={{ background: 'none', border: 'none', color: 'var(--primary-mid)', fontSize: 13, fontWeight: 700 }}
          >
            Ver todos →
          </button>
        </div>

        {!ultimos.length ? (
          <p style={{ color: 'var(--gris-mid)' }}>Todavía no hay partidos jugados.</p>
        ) : (
          ultimos.map((p, i) => {
            const r = resultadoPartido(p)
            const rival = p.local === CLUB.name ? p.visitante : p.local

            return (
              <div
                key={p.id}
                onClick={() => nav(`/partido/${p.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: i < ultimos.length - 1 ? '1px solid #e8eff8' : 'none',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 4,
                    height: 36,
                    borderRadius: 2,
                    flexShrink: 0,
                    background:
                      r === 'victoria'
                        ? '#22a05a'
                        : r === 'derrota'
                          ? '#c0392b'
                          : '#e0a020',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.local === CLUB.name ? 'vs.' : 'en'} {rival || 'Rival pendiente'}</div>
                  <div style={{ fontSize: 11, color: 'var(--gris-mid)' }}>
                    {p.amistoso ? 'Amistoso' : `Jornada ${p.jornada ?? '-'}`} · {formatFecha(p.fecha)} · {p.hora || '--:--'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="score-box">
                    {p.goles_local ?? 0}–{p.goles_visitante ?? 0}
                  </span>
                  <span className={`tag-${r}`}>{r === 'victoria' ? 'V' : r === 'derrota' ? 'D' : 'E'}</span>
                </div>
              </div>
            )
          })
        )}
      </section>

      {/* Top goleadores */}
      <section className="card anim-fade-up anim-delay-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 20, color: 'var(--primary)' }}>Top goleadores</h2>
          <button
            onClick={() => nav('/estadisticas')}
            style={{ background: 'none', border: 'none', color: 'var(--primary-mid)', fontSize: 13, fontWeight: 700 }}
          >
            Ver todos →
          </button>
        </div>

        {!topGoleadores.length ? (
          <p style={{ color: 'var(--gris-mid)' }}>Aún no hay goles registrados en competición.</p>
        ) : (
          topGoleadores.map((j, i) => (
            <div
              key={j.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom: i < topGoleadores.length - 1 ? '1px solid #e8eff8' : 'none',
              }}
            >
              <div
                style={{
                  fontFamily: 'Bebas Neue',
                  fontSize: 18,
                  color: ['#c8a800', '#909090', '#a06030', '#ddd'][i] || '#ccc',
                  minWidth: 18,
                  textAlign: 'center',
                }}
              >
                {i + 1}
              </div>
              <Avatar jugador={j} size="sm" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{j.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--gris-mid)' }}>{j.posicion || '—'}</div>
              </div>
              <div className="bar-wrap" style={{ maxWidth: 70 }}>
                <div className="bar-fill" style={{ width: `${Math.round(((j.goles || 0) / maxGoles) * 100)}%` }} />
              </div>
              <div
                style={{
                  fontFamily: 'Bebas Neue',
                  fontSize: 22,
                  color: 'var(--primary)',
                  minWidth: 24,
                  textAlign: 'right',
                }}
              >
                {j.goles || 0}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}