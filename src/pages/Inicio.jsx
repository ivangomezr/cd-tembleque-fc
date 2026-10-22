import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../hooks/useStore'
import { CLUB, COMPETITION_LABEL, COMPETITION } from '../config/club'
import { useStandings } from '../hooks/useStandings'
import { matchResult, matchSides, ourScore, isHome, rivalName, teamInitials } from '../lib/match'
import TeamCrest from '../components/TeamCrest'
import { ResultCard } from '../components/MatchCard'
import PlayerAvatar from '../components/PlayerAvatar'
import AppLink from '../components/AppLink'
import { useVotacionMvp, MvpVoteSheet, MvpResults, MvpWinner } from '../components/Mvp'
import { tiempoRestante } from '../lib/mvp'
import Icon from '../components/Icon'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const Avatar = ({ jugador }) => <PlayerAvatar jugador={jugador} size={32} />

const fechaLarga = (fecha) => {
  const d = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const txt = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

/** Time left until kick-off. */
function cuentaAtras(fecha, hora, now) {
  const inicio = new Date(`${fecha}T${hora || '00:00'}:00`)
  if (Number.isNaN(inicio.getTime())) return { label: 'Fecha por confirmar' }
  const ms = inicio - now
  if (ms <= 0) return { label: 'En juego o pendiente de resultado', live: true }
  const horas = Math.floor(ms / 3.6e6)
  const dias = Math.floor(horas / 24)
  const esHoy = inicio.toDateString() === now.toDateString()
  return {
    label: esHoy ? 'Hoy' : dias === 0 ? 'Mañana' : dias === 1 ? 'Falta 1 día' : `Faltan ${dias} días`,
    dias, horas: horas % 24, minutos: Math.floor((ms % 3.6e6) / 6e4),
  }
}

const LETRA = { victoria: 'V', empate: 'E', derrota: 'D' }
const NOMBRE_RESULTADO = { victoria: 'Victoria', empate: 'Empate', derrota: 'Derrota' }
const byDate = (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || (a.jornada ?? 0) - (b.jornada ?? 0)

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────
function Hero({ temporada, children }) {
  const { photo } = CLUB
  return (
    <section className="home-hero anim-scale" aria-labelledby="home-club">
      {photo && (
        <picture className="home-hero__bg" aria-hidden="true">
          <source type="image/webp" srcSet={`${photo.webp640} 640w, ${photo.webp1200} 1200w`} sizes="(min-width: 960px) 1080px, 100vw" />
          <img src={photo.jpg} alt="" decoding="async" fetchpriority="high" />
        </picture>
      )}
      <div className="home-hero__id">
        <img className="home-hero__crest" src={CLUB.crest} alt={`Escudo del ${CLUB.name}`} width="383" height="512" />
        <div style={{ minWidth: 0 }}>
          <p className="home-hero__eyebrow">{COMPETITION_LABEL}</p>
          <h1 id="home-club" className="home-hero__name">{CLUB.name}</h1>
          <p className="home-hero__season">{COMPETITION.region} · Temporada {temporada?.nombre?.match(/\d{4}\/\d{2}/)?.[0] || COMPETITION.season}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function SeasonStats({ fila, totalEquipos }) {
  const jugados = fila?.pj || 0
  const stats = [
    { k: 'pos', label: 'Posición', value: jugados ? `${fila.pos}º` : '–', sub: totalEquipos > 1 ? `de ${totalEquipos} equipos` : null, main: true },
    { k: 'pts', label: 'Puntos', value: fila ? fila.pts : '–', sub: jugados ? `${jugados} jugados` : null },
    { k: 'gf', label: 'Goles a favor', short: 'A favor', value: fila ? fila.gf : '–' },
    { k: 'gc', label: 'Goles en contra', short: 'En contra', value: fila ? fila.gc : '–' },
  ]
  return (
    <>
      <dl className="home-stats" aria-label="Clasificación del club">
        {stats.map((s) => (
          <div key={s.k} className={`home-stat${s.main ? ' home-stat--main' : ''}`}>
            <dt><span aria-hidden="true">{s.short || s.label}</span><span className="sr-only">{s.label}</span></dt>
            <dd>{s.value}{s.sub && <small>{s.sub}</small>}</dd>
          </div>
        ))}
      </dl>
      {jugados > 0 && (
        <p className="home-record">
          <b>{fila.pg}</b> victorias · <b>{fila.pe}</b> empates · <b>{fila.pp}</b> derrotas · diferencia <b>{fila.dg > 0 ? `+${fila.dg}` : fila.dg}</b>
        </p>
      )}
    </>
  )
}

/**
 * After a match: the final score in big and a direct invitation to vote the MVP.
 * Shown from the moment the match is marked as played until 23:59 of the next day.
 */
function VoteHero({ partido, crestFor, mvp }) {
  const { votacion, setVotacion, now } = mvp
  const { jugadores } = useStore()
  const [abierto, setAbierto] = useState(false)
  const [gracias, setGracias] = useState(null)
  const { home, away, homeGoals, awayGoals } = matchSides(partido, crestFor)
  const r = matchResult(partido)
  const restante = tiempoRestante(votacion?.cierra, now)
  const miVoto = votacion?.miVoto ? jugadores.find((j) => j.id === votacion.miVoto) : null
  const fecha = fechaLarga(partido.fecha)
  return (
    <section className="vote-hero anim-scale" aria-labelledby="vote-hero-title">
      {CLUB.photo && <img className="vote-hero__bg" src={CLUB.photo.webp640} alt="" aria-hidden="true" decoding="async" />}
      <div className="vote-hero__top">
        <h2 id="vote-hero-title" className="vote-hero__label">Resultado final · {partido.amistoso ? 'Amistoso' : `Jornada ${partido.jornada}`}</h2>
        <span className={`vote-hero__res vote-hero__res--${r}`}>{{ victoria: 'Victoria', empate: 'Empate', derrota: 'Derrota' }[r]}</span>
      </div>
      <div className="vote-hero__score" aria-label={`${home.name} ${homeGoals}, ${away.name} ${awayGoals}`}>
        {[home, away].map((side, i) => (
          <div key={i} className={`vote-hero__team${side.ours ? ' ours' : ''}`} style={{ order: i === 0 ? 0 : 2 }} aria-hidden="true">
            <TeamCrest src={side.crest} name={side.name} size={60} />
            <span>{side.name}</span>
          </div>
        ))}
        <div className="vote-hero__goals" style={{ order: 1 }} aria-hidden="true">{homeGoals}-{awayGoals}</div>
      </div>
      {fecha && <p className="vote-hero__meta">{fecha}{partido.campo ? ` · ${partido.campo}` : ''}</p>}

      {gracias || miVoto ? (
        <p className="vote-hero__thanks" role="status"><Icon name="check" /> {gracias ? '¡Gracias! ' : ''}Has votado a <b>{(gracias || miVoto).nombre}</b>
          <button type="button" onClick={() => setAbierto(true)}>Cambiar</button></p>
      ) : (
        <button type="button" className="vote-hero__cta" onClick={() => setAbierto(true)}><span className="with-icon"><Icon name="star-filled" /> Vota al MVP del partido</span></button>
      )}
      <div className="vote-hero__sub">
        <span className="with-icon"><Icon name="stopwatch" /> {restante ? `Quedan ${restante}` : 'Cerrando…'}</span>
        <span className="with-icon"><Icon name="users" /> {votacion?.total ?? 0} {votacion?.total === 1 ? 'voto' : 'votos'}</span>
      </div>
      {(gracias || miVoto) && votacion?.total > 0 && <MvpResults votacion={votacion} max={3} titulo="Así va la votación" />}

      {abierto && (
        <MvpVoteSheet partido={partido} votacion={votacion}
          onClose={() => setAbierto(false)}
          onVoted={(v, jugador) => { setVotacion(v); setGracias(jugador); setAbierto(false) }} />
      )}
    </section>
  )
}

/** The MVP of the last match, once voting has closed (until the next match is played). */
function LastMvp({ partido, mvp }) {
  if (!partido?.mvp_jugador_id && !mvp.votacion?.mvpJugadorId) return null
  return (
    <section className="card anim-fade-up" aria-labelledby="home-mvp">
      <div className="section-head">
        <h2 id="home-mvp">MVP del último partido</h2>
        <AppLink className="link-more" to={`/partido/${partido.id}`}>Ver partido <Icon name="arrow-right" /></AppLink>
      </div>
      <MvpWinner partido={partido} votacion={mvp.votacion} />
    </section>
  )
}

function NextMatch({ partido, ahora, crestFor }) {
  if (!partido) {
    return (
      <section className="card" aria-labelledby="home-next">
        <div className="section-head"><h2 id="home-next">Próximo partido</h2><AppLink className="link-more" to="/partidos">Calendario <Icon name="arrow-right" /></AppLink></div>
        <p style={{ color: 'var(--home-muted)' }}>Todavía no hay ningún partido programado.</p>
      </section>
    )
  }
  const { home, away } = matchSides(partido, crestFor)
  const cd = cuentaAtras(partido.fecha, partido.hora, ahora)
  const fecha = fechaLarga(partido.fecha)
  return (
    <section className="home-next hero-navy anim-fade-up anim-delay-1" aria-labelledby="home-next">
      <div className="home-next__top">
        <h2 id="home-next" className="home-next__label">Próximo partido</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="home-chip">{partido.amistoso ? 'Amistoso' : `Jornada ${partido.jornada}`}</span>
          <span className={`home-chip${cd.live ? ' home-chip--live' : ''}`}>{cd.label}</span>
        </div>
      </div>

      <div className="home-next__teams">
        {[home, away].map((side, i) => (
          <div key={i} className={`home-next__team${side.ours ? ' home-next__team--ours' : ''}`} style={{ order: i === 0 ? 0 : 2 }}>
            <TeamCrest src={side.crest} name={side.name} size={64} />
            <span>{side.name}</span>
          </div>
        ))}
        <div className="home-next__mid" style={{ order: 1 }}>
          <span className="home-next__vs">{isHome(partido) ? 'En casa' : 'Fuera'}</span>
          <span className="home-next__time">{partido.hora || '--:--'}</span>
          {!cd.live && cd.dias != null && (
            <span className="home-count" aria-label={`Faltan ${cd.dias} días y ${cd.horas} horas`}>
              {cd.dias > 0 && <><b>{cd.dias}</b><span>d</span></>}
              <b>{cd.horas}</b><span>h</span>
              {cd.dias === 0 && <><b>{cd.minutos}</b><span>min</span></>}
            </span>
          )}
        </div>
      </div>

      <dl className="home-next__info">
        <div><dt>Fecha</dt><dd>{fecha || 'Por confirmar'}</dd></div>
        <div><dt>Hora</dt><dd>{partido.hora || 'Por confirmar'}</dd></div>
        <div className="wide"><dt>Campo</dt><dd>{partido.campo || 'Por confirmar'}</dd></div>
      </dl>

      <div className="home-next__cta">
        <AppLink className="btn-light" to={`/partido/${partido.id}`} aria-label={`Ver el partido contra ${rivalName(partido)}`}>Ver partido</AppLink>
        <AppLink className="btn-outline-light" to="/partidos">Calendario</AppLink>
      </div>
    </section>
  )
}

function FormStrip({ partidos, crestFor }) {
  const huecos = Array.from({ length: Math.max(0, 5 - partidos.length) })
  return (
    <section className="card anim-fade-up anim-delay-2" aria-labelledby="home-form">
      <div className="section-head">
        <h2 id="home-form">Forma</h2>
        <AppLink className="link-more" to="/clasificacion">Clasificación <Icon name="arrow-right" /></AppLink>
      </div>
      {!partidos.length ? (
        <p style={{ color: 'var(--home-muted)' }}>Aún no se ha jugado ningún partido de liga.</p>
      ) : (
        <>
          <ol className="form-strip" aria-label="Últimos cinco partidos de liga, del más antiguo al más reciente">
            {huecos.map((_, i) => (
              <li key={`h${i}`} className="form-item" aria-hidden="true">
                <span style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}><span className="form-badge form-badge--vacio">–</span></span>
              </li>
            ))}
            {partidos.map((p) => {
              const r = matchResult(p)
              const { nuestros, rivales } = ourScore(p)
              const rival = rivalName(p)
              return (
                <li key={p.id} className="form-item">
                  <AppLink to={`/partido/${p.id}`} aria-label={`${NOMBRE_RESULTADO[r]} ${nuestros}-${rivales} ${isHome(p) ? 'contra' : 'en casa del'} ${rival}, jornada ${p.jornada}`}>
                    <span className={`form-badge form-badge--${r}`} aria-hidden="true">{LETRA[r]}</span>
                    <span className="form-item__score" aria-hidden="true">{nuestros}-{rivales}</span>
                    <span className="form-item__rival" aria-hidden="true" title={rival}>
                      {crestFor(rival) || p.escudo_rival_url
                        ? <TeamCrest src={p.escudo_rival_url || crestFor(rival)} name={rival} size={18} />
                        : teamInitials(rival)}
                    </span>
                  </AppLink>
                </li>
              )
            })}
          </ol>
          <div className="form-legend" aria-hidden="true"><span className="with-icon"><Icon name="arrow-left" /> Más antiguo</span><span className="with-icon">Más reciente <Icon name="arrow-right" /></span></div>
        </>
      )}
    </section>
  )
}

function RecentResults({ partidos }) {
  return (
    <section className="card anim-fade-up anim-delay-3" aria-labelledby="home-results">
      <div className="section-head">
        <h2 id="home-results">Últimos resultados</h2>
        <AppLink className="link-more" to="/partidos">Ver todos <Icon name="arrow-right" /></AppLink>
      </div>
      {!partidos.length ? (
        <p style={{ color: 'var(--home-muted)' }}>Todavía no hay partidos jugados.</p>
      ) : (
        <ul className="home-results" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {partidos.map((p) => (
            <li key={p.id}>
              <AppLink to={`/partido/${p.id}`} aria-label={`Ver el partido ${p.local} ${p.goles_local}-${p.goles_visitante} ${p.visitante}`}>
                <ResultCard partido={p} />
              </AppLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Leaders({ jugadores, campo, titulo, id, ruta, vacio }) {
  const lista = jugadores.filter((j) => j[campo] > 0).sort((a, b) => b[campo] - a[campo]).slice(0, 4)
  const max = Math.max(1, ...lista.map((j) => j[campo]))
  return (
    <section className="card anim-fade-up anim-delay-4" aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id}>{titulo}</h2>
        <AppLink className="link-more" to={ruta}>Ver todos <Icon name="arrow-right" /></AppLink>
      </div>
      {!lista.length ? <p style={{ color: 'var(--home-muted)' }}>{vacio}</p> : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {lista.map((j, i) => (
            <li key={j.id} className="scorer">
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 18, minWidth: 18, textAlign: 'center', color: i === 0 ? 'var(--accent)' : 'var(--home-muted)' }}>{i + 1}</span>
              <Avatar jugador={j} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--home-muted)' }}>{j.posicion || '—'}</div>
              </div>
              <div className="bar-wrap" style={{ maxWidth: 70 }} aria-hidden="true">
                <div className="bar-fill" style={{ width: `${Math.round((j[campo] / max) * 100)}%` }} />
              </div>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--primary)', minWidth: 24, textAlign: 'right' }}>{j[campo]}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Inicio() {
  const { jugadores = [], partidos = [], stats = [], loading, store, temporada } = useStore()
  const { ownRow, table = [], equipos = [] } = useStandings()
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const data = useMemo(() => {
    const amistosos = new Set(partidos.filter((p) => p.amistoso).map((p) => p.id))
    const statsLiga = stats.filter((s) => !amistosos.has(s.partido_id))
    const totales = jugadores.map((j) => {
      const ss = statsLiga.filter((s) => s.jugador_id === j.id)
      return { ...j, goles: ss.reduce((a, s) => a + (s.goles || 0), 0), asistencias: ss.reduce((a, s) => a + (s.asistencias || 0), 0) }
    })
    const jugados = partidos.filter((p) => p.jugado).sort(byDate)
    const forma = jugados.filter((p) => !p.amistoso).slice(-5)
    const ultimos = [...jugados].reverse().slice(0, 3)
    const proximo = partidos.filter((p) => !p.jugado).sort(byDate)[0] || null
    const ultimoJugado = jugados[jugados.length - 1] || null
    return { totales, forma, ultimos, proximo, ultimoJugado }
  }, [jugadores, partidos, stats])

  // MVP vote of the last match played (open until 23:59 of the next day)
  const mvp = useVotacionMvp(data.ultimoJugado)

  if (loading) {
    return <div className="page"><div className="empty" style={{ marginTop: '3rem' }} role="status">Cargando datos...</div></div>
  }

  const { totales, forma, ultimos, proximo, ultimoJugado } = data

  return (
    <div className="page home">
      {ultimoJugado && mvp.abierta && <VoteHero partido={ultimoJugado} crestFor={store.crestFor} mvp={mvp} />}
      <Hero temporada={temporada}>
        <SeasonStats fila={ownRow} totalEquipos={table.length || equipos.length} />
      </Hero>
      <div className="home-grid">
        <div className="home-col">
          {ultimoJugado && !mvp.abierta && <LastMvp partido={ultimoJugado} mvp={mvp} />}
          <NextMatch partido={proximo} ahora={ahora} crestFor={store.crestFor} />
          <RecentResults partidos={ultimos} />
        </div>
        <div className="home-col">
          <FormStrip partidos={forma} crestFor={store.crestFor} />
          <Leaders jugadores={totales} campo="goles" titulo="Goleadores" id="home-goles" ruta="/estadisticas" vacio="Aún no hay goles registrados en liga." />
          <Leaders jugadores={totales} campo="asistencias" titulo="Asistentes" id="home-asist" ruta="/estadisticas" vacio="Aún no hay asistencias registradas en liga." />
        </div>
      </div>
    </div>
  )
}
