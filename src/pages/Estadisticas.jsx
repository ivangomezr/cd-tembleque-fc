import { useMemo, useState } from 'react'
import { useStore } from '../hooks/useStore'
import { playerTotals, fmtMin } from '../lib/playerTotals'
import { COMPETITION } from '../config/club'
import { splitName, POS_CORTA } from '../lib/players'
import PlayerAvatar from '../components/PlayerAvatar'
import AppLink from '../components/AppLink'
import Icon from '../components/Icon'
import { StatIcon } from '../components/EventIcons'
import { ShirtSvg } from '../components/Camiseta'

// Every stat the page can rank by. `gk`: goalkeepers only. `lower`: tie-break (fewer is better).
const STATS = [
  { key: 'goles', label: 'Goles', corto: 'Goles', lider: 'Máximo goleador' },
  { key: 'asistencias', label: 'Asistencias', corto: 'Asist.', lider: 'Máximo asistente' },
  { key: 'mvps', label: 'MVP', corto: 'MVP', lider: 'Más veces MVP' },
  { key: 'minutos', label: 'Minutos', corto: 'Min', lider: 'Más minutos', fmt: fmtMin },
  { key: 'partidos', label: 'Partidos', corto: 'PJ', lider: 'Más partidos' },
  { key: 'titularidades', label: 'Titular', corto: 'Tit', lider: 'Más titularidades' },
  { key: 'paradas', label: 'Paradas', corto: 'Par.', lider: 'Más paradas', gk: true },
  { key: 'goles_encajados', label: 'Encajados', corto: 'Enc.', gk: true },
  { key: 'tarjetas_amarillas', label: 'Amarillas', corto: 'Amar.' },
  { key: 'tarjetas_rojas', label: 'Rojas', corto: 'Rojas' },
]
const LIDERES = ['goles', 'asistencias', 'mvps', 'minutos', 'paradas', 'partidos']
const TABLA = ['partidos', 'titularidades', 'minutos', 'goles', 'asistencias', 'mvps', 'tarjetas_amarillas', 'tarjetas_rojas']
const stat = (k) => STATS.find((s) => s.key === k)
const valor = (j, k) => (stat(k).fmt ? stat(k).fmt(j[k]) : j[k])

/** Players ordered by a stat (ties: fewer minutes for goals/assists, then number). */
function ranking(totales, k) {
  const s = stat(k)
  return totales
    .filter((j) => j[k] > 0 && (!s.gk || j.posicion === 'Portero'))
    .sort((a, b) => b[k] - a[k] || (['goles', 'asistencias'].includes(k) ? a.minutos - b.minutos : 0) || (a.dorsal ?? 99) - (b.dorsal ?? 99))
}

function LeaderCard({ k, lista }) {
  const s = stat(k)
  const j = lista[0]
  const empatados = lista.filter((x) => x[k] === j[k]).length - 1
  const { first, last } = splitName(j.nombre)
  return (
    <AppLink to={`/jugadores/${j.id}`} className="leader-card" aria-label={`${s.lider}: ${j.nombre}, ${valor(j, k)} ${s.label.toLowerCase()}`}>
      <div className="player-card__media" aria-hidden="true">
        {j.dorsal != null && <span className="player-card__ghost">{j.dorsal}</span>}
        {j.foto_url
          ? <img src={j.foto_url} alt="" loading="lazy" decoding="async" />
          : <span className="player-card__shirt"><ShirtSvg dorsal={j.dorsal ?? ''} size={110} /></span>}
      </div>
      <div className="player-card__shade" aria-hidden="true" />
      <span className="leader-card__tag" aria-hidden="true"><StatIcon stat={k} size={13} /> {s.lider}</span>
      <div className="leader-card__info" aria-hidden="true">
        <div className="player-card__names">
          {first && <span className="player-card__first">{first}</span>}
          <span className="player-card__last">{last}</span>
          {empatados > 0 && <span className="leader-card__tie">y {empatados} más</span>}
        </div>
        <span className={`leader-card__value${String(valor(j, k)).length > 3 ? ' leader-card__value--long' : ''}`}>{valor(j, k)}</span>
      </div>
    </AppLink>
  )
}

function Podio({ k, top }) {
  const orden = [top[1], top[0], top[2]].filter(Boolean)
  return (
    <ol className="podium" aria-label="Podio">
      {orden.map((j) => {
        const pos = top.indexOf(j) + 1
        return (
          <li key={j.id} className={`podium__step podium__step--${pos}`}>
            <AppLink to={`/jugadores/${j.id}`} className="podium__link" aria-label={`${pos}º ${j.nombre}: ${valor(j, k)} ${stat(k).label.toLowerCase()}`}>
              <span className="podium__avatar"><PlayerAvatar jugador={j} size={pos === 1 ? 76 : 60} /></span>
              <span className="podium__name">{splitName(j.nombre).last}</span>
              <span className="podium__value">{valor(j, k)}</span>
              <span className="podium__block" aria-hidden="true">{pos}</span>
            </AppLink>
          </li>
        )
      })}
    </ol>
  )
}

export default function Estadisticas() {
  const { jugadores = [], stats = [], partidos = [], loading } = useStore()
  const [tab, setTab] = useState('goles')
  const [orden, setOrden] = useState({ k: 'minutos', dir: -1 })

  const totales = useMemo(() => {
    const mvps = new Map()
    for (const p of partidos) if (p.jugado && !p.amistoso && p.mvp_jugador_id) mvps.set(p.mvp_jugador_id, (mvps.get(p.mvp_jugador_id) || 0) + 1)
    return playerTotals(jugadores, stats, partidos).filter((j) => j.activo !== false || j.partidos > 0).map((j) => ({ ...j, mvps: mvps.get(j.id) || 0 }))
  }, [jugadores, stats, partidos])

  const sum = (k) => totales.reduce((a, j) => a + (j[k] || 0), 0)
  const jornadas = partidos.filter((p) => p.jugado && !p.amistoso).length
  const lideres = LIDERES.map((k) => ({ k, lista: ranking(totales, k) })).filter((l) => l.lista.length)
  const lista = ranking(totales, tab)
  const max = Math.max(1, ...lista.map((j) => j[tab]))
  const tabla = [...totales].sort((a, b) => orden.dir * (a[orden.k] - b[orden.k]) || b.minutos - a.minutos || a.nombre.localeCompare(b.nombre))
  const ordenar = (k) => setOrden((o) => ({ k, dir: o.k === k ? -o.dir : -1 }))

  if (loading) return <div className="page"><div className="empty" role="status">Cargando estadísticas…</div></div>

  return (
    <div className="page stats anim-fade">
      <header className="matches-head">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Estadísticas</h1>
          <p className="stats-sub">{COMPETITION.name} · {COMPETITION.season}</p>
        </div>
      </header>

      <dl className="matches-summary stats-summary" aria-label="Resumen de la temporada">
        {[['Jornadas', 'Jorn.', jornadas], ['Goles', 'Goles', sum('goles')], ['Asistencias', 'Asist.', sum('asistencias')], ['Amarillas', 'Amar.', sum('tarjetas_amarillas')], ['Rojas', 'Rojas', sum('tarjetas_rojas')]].map(([l, c, v]) => (
          <div key={l} className="matches-summary__item">
            <dt><abbr title={l}>{c.toUpperCase()}</abbr></dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {!jornadas ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--home-muted)' }}>Las estadísticas aparecerán cuando se juegue el primer partido.</div>
      ) : (
        <>
          <section aria-labelledby="st-leaders" className="stats-block">
            <div className="section-head"><h2 id="st-leaders">Líderes</h2></div>
            <div className="leaders">
              {lideres.map(({ k, lista: l }) => <LeaderCard key={k} k={k} lista={l} />)}
            </div>
          </section>

          <div className="stats-grid">
            <section className="card stats-block" aria-labelledby="st-ranking">
              <div className="section-head"><h2 id="st-ranking">Ranking</h2></div>
              <div className="stats-chips" role="tablist" aria-label="Estadística">
                {STATS.map((s) => (
                  <button key={s.key} type="button" role="tab" aria-selected={tab === s.key} className={`chip ${tab === s.key ? 'active' : ''}`} onClick={() => setTab(s.key)}>
                    <span className="with-icon"><StatIcon stat={s.key} size={15} />{s.label}</span>
                  </button>
                ))}
              </div>
              {!lista.length ? (
                <p className="stats-empty">Nadie suma {stat(tab).label.toLowerCase()} todavía.</p>
              ) : (
                <>
                  {lista.length >= 3 && <Podio k={tab} top={lista.slice(0, 3)} />}
                  <ol className="rank-list" start={lista.length >= 3 ? 4 : 1}>
                    {lista.slice(lista.length >= 3 ? 3 : 0).map((j, i) => (
                      <li key={j.id}>
                        <AppLink to={`/jugadores/${j.id}`} className="rank-row" aria-label={`${j.nombre}: ${valor(j, tab)} ${stat(tab).label.toLowerCase()}. Ver ficha`}>
                          <span className="rank-row__pos" aria-hidden="true">{i + (lista.length >= 3 ? 4 : 1)}</span>
                          <PlayerAvatar jugador={j} size={36} />
                          <span className="rank-row__who" aria-hidden="true">
                            <span className="rank-row__name">{j.nombre}</span>
                            <span className="rank-row__meta">{POS_CORTA[j.posicion] || j.posicion} · {j.partidos} PJ · {fmtMin(j.minutos)}</span>
                          </span>
                          <span className="rank-row__bar" aria-hidden="true"><i style={{ width: `${Math.round((j[tab] / max) * 100)}%` }} /></span>
                          <span className="rank-row__value" aria-hidden="true">{valor(j, tab)}</span>
                          <Icon name="chevron-right" size={16} style={{ color: 'var(--gris-light)' }} />
                        </AppLink>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>

            <section className="card stats-block" aria-labelledby="st-table">
              <div className="section-head">
                <h2 id="st-table">Tabla completa</h2>
                <span className="stats-hint">Toca una columna para ordenar</span>
              </div>
              <div className="stats-table-wrap">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col" className="stats-table__player">Jugador</th>
                      {TABLA.map((k) => (
                        <th key={k} scope="col" aria-sort={orden.k === k ? (orden.dir < 0 ? 'descending' : 'ascending') : 'none'}>
                          <button type="button" onClick={() => ordenar(k)} className={orden.k === k ? 'on' : ''} title={stat(k).label}>
                            {['goles', 'asistencias', 'mvps', 'tarjetas_amarillas', 'tarjetas_rojas'].includes(k) ? <StatIcon stat={k} size={14} title={stat(k).label} /> : stat(k).corto}
                            {orden.k === k && <Icon name={orden.dir < 0 ? 'chevron-down' : 'chevron-up'} size={12} />}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tabla.map((j) => (
                      <tr key={j.id}>
                        <th scope="row" className="stats-table__player">
                          <AppLink to={`/jugadores/${j.id}`}>
                            <PlayerAvatar jugador={j} size={28} />
                            <span>{splitName(j.nombre).first ? `${splitName(j.nombre).first[0]}. ` : ''}{splitName(j.nombre).last}</span>
                          </AppLink>
                        </th>
                        {TABLA.map((k) => <td key={k} className={`${orden.k === k ? 'on' : ''}${!j[k] ? ' zero' : ''}`}>{j[k] ? valor(j, k) : '–'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
