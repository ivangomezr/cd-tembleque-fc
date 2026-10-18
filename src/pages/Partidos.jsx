import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { useAuth } from '../hooks/useAuth'
import { matchResult, matchSides, ourScore, isHome, rivalName } from '../lib/match'
import TeamCrest from '../components/TeamCrest'
import AppLink from '../components/AppLink'
import { debeMarcarseJugado } from '../lib/validation'

const VISTAS = [
  { key: 'todos', label: 'Calendario' },
  { key: 'resultados', label: 'Resultados' },
  { key: 'proximos', label: 'Próximos' },
]
const LUGARES = [
  { key: 'todos', label: 'Todos' },
  { key: 'casa', label: 'En casa' },
  { key: 'fuera', label: 'Fuera' },
]
const RES = { victoria: { l: 'V', t: 'Victoria' }, empate: { l: 'E', t: 'Empate' }, derrota: { l: 'D', t: 'Derrota' } }

const byDate = (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.hora || '').localeCompare(String(b.hora || ''))
const dia = (fecha) => {
  const d = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(d.getTime())) return { n: '–', mes: '', sem: '' }
  return {
    n: d.getDate(),
    mes: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''),
    sem: d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''),
  }
}
const mesLabel = (fecha) => {
  const d = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(d.getTime())) return 'Sin fecha'
  const t = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** One match: date block, both teams stacked like a scoreboard, and the result or kick-off time. */
function MatchRow({ p, crestFor, next = false }) {
  const { home, away, homeGoals, awayGoals } = matchSides(p, crestFor)
  const r = matchResult(p)
  const d = dia(p.fecha)
  const { nuestros, rivales } = ourScore(p)
  const pendiente = debeMarcarseJugado(p) // already over, score not entered yet
  const winner = p.jugado ? (homeGoals > awayGoals ? 'home' : awayGoals > homeGoals ? 'away' : null) : null
  const label = `${p.amistoso ? 'Amistoso' : `Jornada ${p.jornada}`}, ${d.sem} ${d.n} ${d.mes}: ${home.name} ${p.jugado ? `${homeGoals}-${awayGoals} ` : ''}${away.name}${p.jugado ? `, ${RES[r].t.toLowerCase()}` : pendiente ? ', pendiente de resultado' : `, ${p.hora || 'hora por confirmar'}`}`
  return (
    <AppLink to={`/partido/${p.id}`} className={`m-row${next ? ' m-row--next' : ''}${p.jugado ? ` m-row--${r}` : ''}`} aria-label={label}>
      <span className="m-row__date" aria-hidden="true">
        <span className="m-row__sem">{d.sem}</span>
        <span className="m-row__day">{d.n}</span>
        <span className="m-row__mes">{d.mes}</span>
      </span>
      <span className="m-row__teams" aria-hidden="true">
        {[[home, homeGoals, 'home'], [away, awayGoals, 'away']].map(([side, goles, k]) => (
          <span key={k} className={`m-row__team${side.ours ? ' m-row__team--ours' : ''}${winner === k ? ' m-row__team--win' : ''}`}>
            <TeamCrest src={side.crest} name={side.name} size={22} />
            <span className="m-row__name">{side.name}</span>
            {p.jugado && <span className="m-row__goals">{goles}</span>}
          </span>
        ))}
        <span className="m-row__meta">
          {pendiente ? <b className="m-row__pending">Pendiente de resultado · </b> : next && <b>Próximo · </b>}
          {p.amistoso ? 'Amistoso' : `Jornada ${p.jornada}`}{p.campo ? ` · ${p.campo}` : ''}
        </span>
      </span>
      <span className="m-row__end" aria-hidden="true">
        {p.jugado
          ? <span className={`m-row__res m-row__res--${r}`} title={`${RES[r].t} ${nuestros}-${rivales}`}>{RES[r].l}</span>
          : <span className={`m-row__time${pendiente ? ' m-row__time--past' : ''}`}>{p.hora || '--:--'}</span>}
      </span>
    </AppLink>
  )
}

export default function Partidos() {
  const nav = useNavigate()
  const { partidos = [], loading, store } = useStore()
  const { isAdmin } = useAuth()
  const [vista, setVista] = useState('todos')
  const [lugar, setLugar] = useState('todos')
  const nextRef = useRef(null)

  const ordenados = useMemo(() => [...partidos].sort(byDate), [partidos])
  const proximo = ordenados.find((p) => !p.jugado) || null

  // Season summary (league matches)
  const resumen = useMemo(() => {
    const liga = partidos.filter((p) => p.jugado && !p.amistoso)
    const r = liga.map((p) => ({ ...ourScore(p), res: matchResult(p) }))
    return {
      pj: liga.length,
      v: r.filter((x) => x.res === 'victoria').length,
      e: r.filter((x) => x.res === 'empate').length,
      d: r.filter((x) => x.res === 'derrota').length,
      gf: r.reduce((a, x) => a + x.nuestros, 0),
      gc: r.reduce((a, x) => a + x.rivales, 0),
    }
  }, [partidos])

  const lista = ordenados
    .filter((p) => (vista === 'resultados' ? p.jugado : vista === 'proximos' ? !p.jugado : true))
    .filter((p) => (lugar === 'casa' ? isHome(p) : lugar === 'fuera' ? !isHome(p) : true))
  // Results: newest first. Calendar and upcoming: chronological.
  if (vista === 'resultados') lista.reverse()

  const grupos = []
  for (const p of lista) {
    const k = mesLabel(p.fecha)
    if (!grupos.length || grupos[grupos.length - 1].k !== k) grupos.push({ k, items: [] })
    grupos[grupos.length - 1].items.push(p)
  }

  // In the calendar, bring the next match into view
  useEffect(() => {
    if (vista !== 'todos' || !nextRef.current) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    nextRef.current.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [vista, loading])

  return (
    <div className="page matches anim-fade">
      <header className="matches-head">
        <h1 className="page-title" style={{ margin: 0 }}>Partidos</h1>
        {isAdmin && <button onClick={() => nav('/admin?tab=partidos')} className="btn btn-primary btn-sm">+ Partido</button>}
      </header>

      {resumen.pj > 0 && (
        <dl className="matches-summary" aria-label="Resumen de liga">
          {[['PJ', 'Jugados', resumen.pj], ['V', 'Victorias', resumen.v], ['E', 'Empates', resumen.e], ['D', 'Derrotas', resumen.d], ['GF', 'Goles a favor', resumen.gf], ['GC', 'Goles en contra', resumen.gc]].map(([s, l, v]) => (
            <div key={s} className={`matches-summary__item matches-summary__item--${s.toLowerCase()}`}>
              <dt><abbr title={l}>{s}</abbr></dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="matches-controls">
        <div className="segmented" role="group" aria-label="Qué partidos ver">
          {VISTAS.map((v) => (
            <button key={v.key} type="button" className={vista === v.key ? 'active' : ''} aria-pressed={vista === v.key} onClick={() => setVista(v.key)}>{v.label}</button>
          ))}
        </div>
        <div className="matches-place" role="group" aria-label="Dónde se juega">
          {LUGARES.map((l) => (
            <button key={l.key} type="button" className={`chip${lugar === l.key ? ' active' : ''}`} aria-pressed={lugar === l.key} onClick={() => setLugar(l.key)}>{l.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty" role="status">Cargando partidos…</div>
      ) : !lista.length ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--home-muted)' }}>
          {!partidos.length ? 'Todavía no hay partidos en el calendario.' : vista === 'resultados' ? 'No hay resultados con este filtro.' : vista === 'proximos' ? 'No hay partidos pendientes con este filtro.' : 'No hay partidos con este filtro.'}
        </div>
      ) : (
        grupos.map((g) => (
          <section key={g.k} className="matches-month" aria-labelledby={`m-${g.k}`}>
            <h2 id={`m-${g.k}`} className="matches-month__title">{g.k}</h2>
            <ul className="matches-list">
              {g.items.map((p) => (
                <li key={p.id} ref={p.id === proximo?.id ? nextRef : undefined}>
                  <MatchRow p={p} crestFor={store.crestFor} next={p.id === proximo?.id} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {!loading && proximo && vista === 'todos' && <p className="sr-only">Próximo partido: contra {rivalName(proximo)}.</p>}
    </div>
  )
}
