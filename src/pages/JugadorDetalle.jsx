import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { useAuth } from '../hooks/useAuth'
import { playerTotals, fmtMin } from '../lib/playerTotals'
import { ESTADOS, POS_CLASS, byDorsal, splitName, playerMatchLog, rankIn } from '../lib/players'
import { ShirtSvg } from '../components/Camiseta'
import TeamCrest from '../components/TeamCrest'
import PlayerEditSheet from '../components/PlayerEditSheet'
import AppLink from '../components/AppLink'
import Icon from '../components/Icon'
import { StatIcon } from '../components/EventIcons'

const RES = { victoria: { l: 'V', c: 'var(--res-v)' }, empate: { l: 'E', c: 'var(--res-e)' }, derrota: { l: 'D', c: 'var(--res-d)' } }
const ROL = { titular: 'Titular', suplente: 'Suplente', 'sin minutos': 'Sin minutos', convocado: 'Convocado', 'no convocado': 'No convocado' }
const fecha = (f) => {
  const d = new Date(`${f}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className={`pstat${accent ? ' pstat--accent' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}{sub && <small>{sub}</small>}</dd>
    </div>
  )
}

export default function JugadorDetalle() {
  const { id } = useParams()
  const { jugadores = [], partidos = [], stats = [], store, loading, temporada } = useStore()
  const { isAdmin } = useAuth()
  const [editando, setEditando] = useState(false)
  const [historial, setHistorial] = useState(null)

  const jugadorId = Number(id)
  const totales = useMemo(() => playerTotals(jugadores, stats, partidos), [jugadores, stats, partidos])
  const j = totales.find((x) => x.id === jugadorId)
  const log = useMemo(() => playerMatchLog(jugadorId, partidos, stats), [jugadorId, partidos, stats])
  const plantilla = useMemo(() => jugadores.filter((x) => x.activo !== false).sort(byDorsal), [jugadores])
  const idx = plantilla.findIndex((x) => x.id === jugadorId)
  const prev = idx > 0 ? plantilla[idx - 1] : null
  const next = idx >= 0 && idx < plantilla.length - 1 ? plantilla[idx + 1] : null

  // Previous seasons (closed ones), loaded on demand from the database
  useEffect(() => {
    let vivo = true
    setHistorial(null)
    ;(async () => {
      try {
        const temporadas = (await store.getTemporadas()).filter((t) => !t.activa)
        const filas = []
        for (const t of temporadas) {
          const d = await store.getDatosTemporada(t.id)
          const [tot] = playerTotals([{ id: jugadorId }], d.stats, d.partidos)
          if (tot.partidos || tot.convocatorias) filas.push({ temporada: t, ...tot })
        }
        if (vivo) setHistorial(filas)
      } catch {
        if (vivo) setHistorial([])
      }
    })()
    return () => { vivo = false }
  }, [jugadorId, store])

  if (loading) return <div className="page"><div className="empty" role="status">Cargando jugador…</div></div>
  if (!j) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: 12 }}>No hemos encontrado a este jugador.</p>
          <AppLink className="btn btn-primary" to="/jugadores">Volver a la plantilla</AppLink>
        </div>
      </div>
    )
  }

  const { first, last } = splitName(j.nombre)
  const estado = ESTADOS[j.estado]
  const esPortero = j.posicion === 'Portero'
  const mvps = log.filter((r) => r.mvp && !r.partido.amistoso).length
  const ga = j.goles + j.asistencias
  const minPorPartido = j.partidos ? Math.round(j.minutos / j.partidos) : null
  const rankings = [
    ['goles', 'en goles'], ['asistencias', 'en asistencias'], ['minutos', 'en minutos'],
    ...(esPortero ? [['paradas', 'en paradas']] : []),
  ].map(([k, l]) => ({ k, l, pos: rankIn(totales, jugadorId, k) })).filter((r) => r.pos && r.pos <= 3) // podium only
  const jornadasLiga = partidos.filter((p) => p.jugado && !p.amistoso).length

  return (
    <div className="page player anim-fade">
      <nav className="player-nav" aria-label="Navegación de la plantilla">
        <AppLink className="link-more" to="/jugadores"><Icon name="arrow-left" /> Plantilla</AppLink>
        <div style={{ display: 'flex', gap: 6 }}>
          {prev && <AppLink className="player-nav__btn" to={`/jugadores/${prev.id}`} aria-label={`Anterior: ${prev.nombre}`}><Icon name="chevron-left" size={16} />{prev.dorsal ?? ''}</AppLink>}
          {next && <AppLink className="player-nav__btn" to={`/jugadores/${next.id}`} aria-label={`Siguiente: ${next.nombre}`}>{next.dorsal ?? ''}<Icon name="chevron-right" size={16} /></AppLink>}
        </div>
      </nav>

      {/* Header */}
      <section className="player-hero" aria-labelledby="player-name">
        <div className="player-hero__media" aria-hidden="true">
          {j.dorsal != null && <span className="player-hero__ghost">{j.dorsal}</span>}
          {j.foto_url
            ? <img src={j.foto_url} alt="" decoding="async" />
            : <span className="player-hero__shirt"><ShirtSvg dorsal={j.dorsal ?? ''} size={190} /></span>}
        </div>
        <div className="player-hero__body">
          <div className="player-hero__num" aria-hidden="true">{j.dorsal ?? '–'}</div>
          <h1 id="player-name" className="player-hero__name">
            {first && <span>{first}</span>}{last}
          </h1>
          <div className="player-hero__tags">
            {j.dorsal != null && <span className="sr-only">Dorsal {j.dorsal}.</span>}
            {j.posicion && <span className={`pos-pill ${POS_CLASS[j.posicion]}`}>{j.posicion}</span>}
            <span className="player-tag" style={estado?.color ? { color: estado.color, background: 'white' } : undefined}>
              {estado?.icono && <Icon name={estado.icono} />} {estado?.label || 'Disponible'}
            </span>
            {mvps > 0 && <span className="player-tag player-tag--gold"><Icon name="star-filled" /> MVP ×{mvps}</span>}
          </div>
          {j.estado !== 'disponible' && j.estado_desc && <p className="player-hero__note">{j.estado_desc}</p>}
          {isAdmin && <button type="button" className="btn btn-sm player-hero__edit" onClick={() => setEditando(true)}><span className="with-icon"><Icon name="pencil" /> Editar jugador</span></button>}
        </div>
      </section>

      <div className="player-grid">
        {/* Season */}
        <section className="card" aria-labelledby="player-season">
          <div className="section-head">
            <h2 id="player-season">Temporada {temporada?.nombre?.match(/\d{4}\/\d{2}/)?.[0] || ''}</h2>
          </div>
          <dl className="pstats">
            <Stat label="Partidos" value={j.partidos} sub={jornadasLiga ? `de ${jornadasLiga}` : null} accent />
            <Stat label="Titular" value={j.titularidades} />
            <Stat label="Minutos" value={fmtMin(j.minutos)} sub={minPorPartido ? `${minPorPartido}' por partido` : null} />
            {esPortero ? (
              <>
                <Stat label="Paradas" value={j.paradas} accent />
                <Stat label="Encajados" value={j.goles_encajados} sub={j.partidos ? `${(j.goles_encajados / j.partidos).toFixed(1).replace('.', ',')} por partido` : null} />
                <Stat label="Goles" value={j.goles} />
              </>
            ) : (
              <>
                <Stat label="Goles" value={j.goles} sub={j.minutosPorGol ? `1 cada ${j.minutosPorGol}'` : null} accent />
                <Stat label="Asistencias" value={j.asistencias} />
                <Stat label="Goles + asist." value={ga} />
              </>
            )}
            <Stat label="Amarillas" value={j.tarjetas_amarillas} />
            <Stat label="Rojas" value={j.tarjetas_rojas} />
            <Stat label="Convocatorias" value={j.convocatorias} />
          </dl>
          {rankings.length > 0 && (
            <ul className="player-ranks" aria-label="Posición en la plantilla">
              {rankings.map((r) => (
                <li key={r.k}><b>{r.pos}º</b> {r.l}</li>
              ))}
            </ul>
          )}
        </section>

        {/* Match by match */}
        <section className="card" aria-labelledby="player-log">
          <div className="section-head"><h2 id="player-log">Partido a partido</h2></div>
          {!log.length ? (
            <p style={{ color: 'var(--home-muted)' }}>Todavía no se ha jugado ningún partido esta temporada.</p>
          ) : (
            <ol className="player-log">
              {log.map(({ partido: p, stat, rol, resultado, nuestros, rivales, rival, mvp }) => (
                <li key={p.id}>
                  <AppLink to={`/partido/${p.id}`} className={`player-log__row${rol === 'no convocado' ? ' player-log__row--out' : ''}`}
                    aria-label={`${p.amistoso ? 'Amistoso' : `Jornada ${p.jornada}`} contra ${rival}, ${nuestros}-${rivales}. ${ROL[rol]}${stat?.minutos ? `, ${stat.minutos} minutos` : ''}${stat?.goles ? `, ${stat.goles} goles` : ''}${stat?.asistencias ? `, ${stat.asistencias} asistencias` : ''}`}>
                    <span className="player-log__res" style={{ background: RES[resultado]?.c }} aria-hidden="true">{RES[resultado]?.l}</span>
                    <span className="player-log__match" aria-hidden="true">
                      <span className="player-log__rival">
                        <TeamCrest src={p.escudo_rival_url || store.crestFor(rival)} name={rival} size={18} />
                        <span>{rival}</span>
                      </span>
                      <span className="player-log__meta">{p.amistoso ? 'Amistoso' : `J${p.jornada}`} · {fecha(p.fecha)} · {nuestros}-{rivales}</span>
                    </span>
                    <span className="player-log__figs" aria-hidden="true">
                      <span className={`player-log__rol player-log__rol--${rol.replace(/ /g, '-')}`}>{ROL[rol]}</span>
                      <span className="player-log__icons">
                        {stat?.minutos > 0 && <span>{stat.minutos}'</span>}
                        {stat?.goles > 0 && <span><StatIcon stat="goles" />{stat.goles > 1 ? `×${stat.goles}` : ''}</span>}
                        {stat?.asistencias > 0 && <span><StatIcon stat="asistencias" />{stat.asistencias > 1 ? `×${stat.asistencias}` : ''}</span>}
                        {stat?.tarjetas_amarillas > 0 && <span className="card-y" title="Amarilla" />}
                        {stat?.tarjetas_rojas > 0 && <span className="card-r" title="Roja" />}
                        {esPortero && stat?.paradas > 0 && <span><StatIcon stat="paradas" />{stat.paradas}</span>}
                        {mvp && <span style={{ color: '#c99a06' }}><StatIcon stat="mvp" title="MVP" /></span>}
                      </span>
                    </span>
                  </AppLink>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Previous seasons */}
        {historial?.length > 0 && (
          <section className="card" aria-labelledby="player-history">
            <div className="section-head"><h2 id="player-history">Temporadas anteriores</h2></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="player-history">
                <thead>
                  <tr><th scope="col">Temporada</th><th scope="col">PJ</th><th scope="col">Min</th><th scope="col">{esPortero ? 'Par.' : 'Goles'}</th><th scope="col">{esPortero ? 'Enc.' : 'Asist.'}</th></tr>
                </thead>
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.temporada.id}>
                      <th scope="row">{h.temporada.nombre}</th>
                      <td>{h.partidos}</td>
                      <td>{fmtMin(h.minutos)}</td>
                      <td>{esPortero ? h.paradas : h.goles}</td>
                      <td>{esPortero ? h.goles_encajados : h.asistencias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {editando && <PlayerEditSheet jugador={j} store={store} onClose={() => setEditando(false)} />}
    </div>
  )
}
