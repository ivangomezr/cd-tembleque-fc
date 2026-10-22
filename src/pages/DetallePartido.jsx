import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { useAuth } from '../hooks/useAuth'
import { haptics } from '../lib/haptics'
import { isHome, rivalName, matchResult, matchSides } from '../lib/match'
import { startersFromLineup, eventsByPlayer } from '../lib/timeline'
import { PlayerBadges, hasBadges, StatIcon } from '../components/EventIcons'
import Alineacion from '../components/Alineacion'
import MatchTimeline, { EventEditor } from '../components/MatchTimeline'
import TeamCrest from '../components/TeamCrest'
import Sheet from '../components/Sheet'
import KitPicker from '../components/KitPicker'
import { KITS, DEFAULT_KIT } from '../config/club'
import { messageFor } from '../lib/dbErrors'
import PlayerAvatar from '../components/PlayerAvatar'
import { useVotacionMvp, MvpVoteSheet, MvpResults, MvpWinner } from '../components/Mvp'
import { tiempoRestante } from '../lib/mvp'
import Icon from '../components/Icon'

const fmt = (str) => new Date(str).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const posOrder = { Portero: 0, Defensa: 1, Centrocampista: 2, Delantero: 3 }
const byPos = (a, b) => (posOrder[a.posicion] ?? 99) - (posOrder[b.posicion] ?? 99) || (a.dorsal || 99) - (b.dorsal || 99)
const initials = (n = '?') => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

const Avatar = ({ jugador, size = 32 }) => <PlayerAvatar jugador={jugador} size={size} />


export default function DetallePartido() {
  const { id } = useParams()
  const nav = useNavigate()
  const { partidos, jugadores, stats, store, loading } = useStore()
  const auth = useAuth()
  const isAdmin = auth.isAdmin

  const partido = partidos.find((p) => p.id === Number(id))
  const [alineacion, setAlineacion] = useState(null)
  const [alineacionCargada, setAlineacionCargada] = useState(false)
  const [eventos, setEventos] = useState([])
  const mvp = useVotacionMvp(partido)
  const [votando, setVotando] = useState(false)
  const [editEvento, setEditEvento] = useState(null) // null | {} (new) | event
  const [editConvocatoria, setEditConvocatoria] = useState(false)

  const cargarEventos = () => partido && store.getEventos(partido.id).then(setEventos)

  useEffect(() => {
    if (!partido) return
    store.getAlineacion(partido.id).then((a) => { setAlineacion(a); setAlineacionCargada(true) })
    cargarEventos()
  }, [partido?.id])


  if (!partido) {
    return <div className="page anim-fade"><div className="empty">{loading ? 'Cargando…' : 'Partido no encontrado'}</div></div>
  }

  const rival = rivalName(partido)
  const resultado = matchResult(partido)
  const { home, away } = matchSides(partido, store.crestFor)
  const getJugador = (jid) => jugadores.find((j) => j.id === jid)
  const convocadosIds = partido.convocados || []
  const convocados = convocadosIds.map(getJugador).filter(Boolean)
  const titularesIds = startersFromLineup(alineacion)
  const suplentes = convocados.filter((j) => !titularesIds.includes(j.id))
  const statsPartido = stats.filter((s) => s.partido_id === partido.id)

  // Event badges (goals, penalties, own goals, cards) for shirts and substitutes.
  // From the timeline when there is one; otherwise from the manual stats.
  const eventInfo = eventos.length ? eventsByPlayer(eventos) : Object.fromEntries(statsPartido.map((s) => [s.jugador_id, {
    goles: s.goles, penaltis: 0, propia: 0, amarillas: s.tarjetas_amarillas, roja: s.tarjetas_rojas > 0, segunda: false,
  }]))
  const badges = {}
  Object.entries(eventInfo).forEach(([id, info]) => {
    if (hasBadges(info)) badges[id] = <PlayerBadges info={info} size={10} />
  })

  const mvpId = partido.mvp_jugador_id || null

  const guardarAlineacion = async (formacion, slots, capitanId = null) => {
    await store.saveAlineacion(partido.id, formacion, slots)
    setAlineacion({ formacion, jugadores: slots })
    // after the line-up: the captain has to be one of the starters just saved
    if ((capitanId ?? null) !== (store.getPartidos().find((p) => p.id === partido.id)?.capitan_id ?? null)) {
      await store.updatePartido(partido.id, { capitan_id: capitanId })
    }
  }

  const fichaFilas = statsPartido
    .filter((s) => s.minutos > 0 || s.goles || s.asistencias || s.tarjetas_amarillas || s.tarjetas_rojas)
    .map((s) => ({ s, j: getJugador(s.jugador_id) }))
    .filter((x) => x.j)
    .sort((a, b) => Number(b.s.titular) - Number(a.s.titular) || byPos(a.j, b.j))

  const Crest = ({ side, size }) => <TeamCrest src={side.crest} name={side.name} size={size} />

  return (
    <div className="page anim-fade">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => nav('/partidos')} style={{ background: 'none', border: 'none', color: 'var(--primary-mid)', fontSize: 14, fontWeight: 600, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="arrow-left" /> Volver</button>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            {partido.jugado && (
              <button onClick={() => nav(`/admin?tab=stats&partido=${partido.id}`)} style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="chart-bar" /> Stats</button>
            )}
            <button onClick={() => nav(`/admin?tab=partidos&edit=${partido.id}`)} style={{ background: 'none', border: '1.5px solid #b9cbe2', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="pencil" /> Editar</button>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="hero-navy" style={{ padding: '1.4rem 1rem', marginBottom: '1rem', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--on-navy)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          {partido.amistoso ? 'Amistoso' : `Jornada ${partido.jornada}`} · {fmt(partido.fecha)}{partido.hora ? ` · ${partido.hora}` : ''}
        </div>
        <div style={{ fontSize: 12, color: 'var(--on-navy-muted)', marginBottom: 14 }}><Icon name="map-pin" /> {partido.campo} · {isHome(partido) ? 'En casa' : 'Fuera'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
          {[home, null, away].map((side, i) => side ? (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Crest side={side} size={56} />
              <div style={{ fontSize: 13, fontWeight: side.ours ? 700 : 500, color: side.ours ? 'white' : 'var(--on-navy)', lineHeight: 1.2 }}>{side.name}</div>
            </div>
          ) : (
            <div key={i}>
              {partido.jugado
                ? <div style={{ fontFamily: 'Bebas Neue', fontSize: 46, color: 'white', background: 'rgba(0,0,0,0.25)', padding: '2px 18px', borderRadius: 12, lineHeight: 1.1 }}>{partido.goles_local} - {partido.goles_visitante}</div>
                : <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: 'white' }}>vs</div>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          {resultado
            ? <span className={`tag-${resultado}`} style={{ fontSize: 13, padding: '4px 16px' }}><span className="with-icon" style={{ gap: 4 }}><Icon name={resultado === 'victoria' ? 'check' : resultado === 'derrota' ? 'x' : 'equal'} />{resultado === 'victoria' ? 'Victoria' : resultado === 'derrota' ? 'Derrota' : 'Empate'}</span></span>
            : <span style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--on-navy)', padding: '4px 14px', borderRadius: 20, fontSize: 13 }}>Pendiente</span>}
        </div>
      </div>

      {/* Timeline */}
      {partido.jugado && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 className="with-icon" style={{ fontSize: 18, color: 'var(--primary)', marginBottom: 10 }}><Icon name="stopwatch" /> Minuto a minuto</h2>
          <MatchTimeline
            partido={partido}
            eventos={eventos}
            jugadores={jugadores}
            rival={rival}
            editable={isAdmin}
            onAdd={() => setEditEvento({})}
            onEdit={(e) => setEditEvento(e)}
          />
        </div>
      )}

      {/* Lineup */}
      {(partido.jugado || alineacion || isAdmin) && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 className="with-icon" style={{ fontSize: 18, color: 'var(--primary)' }}><Icon name="shirt" /> {partido.jugado ? 'Alineación' : 'Alineación prevista'}</h2>
            <span style={{ fontSize: 12, color: 'var(--gris-mid)' }}>
              {alineacion?.formacion ? `${alineacion.formacion} · ` : ''}Equipación {(KITS[partido.equipacion] || KITS[DEFAULT_KIT]).label.toLowerCase()}
            </span>
          </div>
          {isAdmin && (
            <div style={{ marginBottom: 12 }}>
              <KitPicker value={partido.equipacion || DEFAULT_KIT} onChange={(v) => v !== partido.equipacion && store.updatePartido(partido.id, { equipacion: v }).catch((e) => window.alert(messageFor(e)))} />
            </div>
          )}
          {alineacionCargada
            ? <Alineacion jugadores={jugadores} alineacionInicial={alineacion} onSave={guardarAlineacion} modoEdicion={isAdmin} elegibles={convocados} mvpId={partido.jugado ? mvpId : null} badges={badges} kit={partido.equipacion || DEFAULT_KIT} capitanId={partido.capitan_id ?? null} />
            : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gris-mid)', fontSize: 13 }}>Cargando alineación…</div>}

          <div style={{ marginTop: 20, borderTop: '1px solid #e8eff8', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 className="with-icon" style={{ fontSize: 15, color: 'var(--gris-dark)' }}><Icon name={partido.jugado ? 'arrows-exchange' : 'clipboard-list'} /> {partido.jugado ? 'Suplentes' : `Convocatoria (${convocados.length})`}</h3>
              {isAdmin && <button onClick={() => setEditConvocatoria(true)} style={{ background: 'var(--primary-pale)', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="pencil" /> Convocatoria</button>}
            </div>
            {(partido.jugado ? suplentes : convocados).length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[...(partido.jugado ? suplentes : convocados)].sort(byPos).map((j) => {
                  const info = partido.jugado ? eventInfo[j.id] : null
                  return (
                    <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f7fafd', border: '1px solid #e8eff8', padding: '4px 12px 4px 4px', borderRadius: 24 }}>
                      <span style={{ position: 'relative', display: 'inline-flex' }}>
                        <Avatar jugador={j} size={28} />
                        {hasBadges(info) && (
                          <span style={{ position: 'absolute', top: -7, right: -12, zIndex: 1 }}>
                            <PlayerBadges info={info} size={9} />
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gris-dark)', marginLeft: hasBadges(info) ? 8 : 0 }}>{j.nombre}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--gris-mid)' }}>{partido.jugado ? 'Sin suplentes.' : 'Aún no hay jugadores convocados.'}</div>
            )}
          </div>
        </div>
      )}

      {/* Player sheet */}
      {partido.jugado && fichaFilas.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 className="with-icon" style={{ fontSize: 18, color: 'var(--primary)', marginBottom: 12 }}><Icon name="clipboard-list" /> Ficha del partido</h2>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Jugador</th><th style={{ textAlign: 'center' }}>Min</th><th style={{ textAlign: 'center' }}><StatIcon stat="goles" title="Goles" /></th><th style={{ textAlign: 'center' }}><StatIcon stat="asistencias" title="Asistencias" /></th><th style={{ textAlign: 'center' }}><StatIcon stat="tarjetas_amarillas" title="Amarillas" /></th><th style={{ textAlign: 'center' }}><StatIcon stat="tarjetas_rojas" title="Rojas" /></th></tr></thead>
              <tbody>
                {fichaFilas.map(({ s, j }) => (
                  <tr key={j.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar jugador={j} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{j.nombre}{j.id === partido.capitan_id && <Icon name="captain-filled" title="Capitán" style={{ color: 'var(--primary)', marginLeft: 4 }} />}</div>
                          <div style={{ fontSize: 10, color: 'var(--gris-mid)' }}>{s.titular ? 'Titular' : 'Suplente'} · #{j.dorsal}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--navy)' }}>{s.minutos}'</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: s.goles ? 'var(--primary)' : '#ccc' }}>{s.goles || '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: s.asistencias ? 'var(--primary)' : '#ccc' }}>{s.asistencias || '—'}</td>
                    <td style={{ textAlign: 'center', color: s.tarjetas_amarillas ? 'inherit' : '#ccc' }}>{s.tarjetas_amarillas || '—'}</td>
                    <td style={{ textAlign: 'center', color: s.tarjetas_rojas ? 'inherit' : '#ccc' }}>{s.tarjetas_rojas || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MVP: voted by everyone until 23:59 of the day after the match */}
      {partido.jugado && (
        <section className="card" style={{ marginBottom: '1rem' }} aria-labelledby="mvp-title">
          <div className="section-head">
            <h2 id="mvp-title" className="with-icon"><Icon name="star" /> MVP del partido</h2>
            {mvp.abierta && mvp.votacion?.cierra && <span className="mvp-chip with-icon" style={{ gap: 4 }}><Icon name="stopwatch" /> {tiempoRestante(mvp.votacion.cierra, mvp.now) || 'Cerrando…'}</span>}
          </div>
          {mvp.abierta ? (
            <>
              <MvpResults votacion={mvp.votacion} titulo="Votación en directo" />
              <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => setVotando(true)}>
                <span className="with-icon"><Icon name={mvp.votacion?.miVoto ? 'check' : 'star-filled'} />{mvp.votacion?.miVoto ? `Has votado a ${getJugador(mvp.votacion.miVoto)?.nombre || ''} · Cambiar` : 'Votar al MVP'}</span>
              </button>
              <p className="mvp-note">Puede votar todo el mundo, sin registro. Cierra a las 23:59 del día siguiente al partido.</p>
            </>
          ) : mvpId ? (
            <>
              <MvpWinner partido={partido} votacion={mvp.votacion} />
              {mvp.votacion?.total > 0 && <div style={{ marginTop: 12 }}><MvpResults votacion={mvp.votacion} titulo="Resultado final" /></div>}
            </>
          ) : (
            <p style={{ color: 'var(--gris-mid)', fontSize: 13, textAlign: 'center' }}>La votación ha cerrado sin votos.</p>
          )}
          {votando && (
            <MvpVoteSheet partido={partido} votacion={mvp.votacion}
              onClose={() => setVotando(false)}
              onVoted={(v) => { mvp.setVotacion(v); setVotando(false) }} />
          )}
        </section>
      )}

      {editEvento && (
        <EventEditor
          evento={editEvento}
          partido={partido}
          jugadores={jugadores}
          convocados={convocados}
          rival={rival}
          store={store}
          onClose={(changed) => { setEditEvento(null); if (changed) cargarEventos() }}
        />
      )}

      {editConvocatoria && (
        <ConvocatoriaSheet
          partido={partido}
          jugadores={jugadores}
          alineacion={alineacion}
          store={store}
          onClose={(nuevaAlineacion) => { if (nuevaAlineacion) setAlineacion(nuevaAlineacion); setEditConvocatoria(false) }}
        />
      )}
    </div>
  )
}

function ConvocatoriaSheet({ partido, jugadores, alineacion, store, onClose }) {
  const [sel, setSel] = useState(partido.convocados || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const disponibles = [...jugadores].sort(byPos)
  const toggle = (id, on) => setSel((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)))

  const save = async () => {
    setSaving(true)
    setError('')
    let nueva = null
    try {
      // Remove from the lineup anyone who is no longer called up
      if (alineacion?.jugadores?.some((s) => s?.jugador_id && !sel.includes(s.jugador_id))) {
        const slots = alineacion.jugadores.map((s) => (s?.jugador_id && !sel.includes(s.jugador_id) ? { ...s, jugador_id: null } : s))
        await store.saveAlineacion(partido.id, alineacion.formacion, slots)
        nueva = { ...alineacion, jugadores: slots }
      }
      await store.updateConvocados(partido.id, sel)
      haptics.success?.()
      onClose(nueva)
    } catch (e) {
      // e.g. dropping a player who already has events or stats in this match
      haptics.error?.()
      setError(messageFor(e))
      setSaving(false)
    }
  }

  return (
    <Sheet title={`Convocatoria (${sel.length})`} onClose={() => onClose(null)}>
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }}
        onClick={() => setSel(sel.length === jugadores.length ? [] : jugadores.filter((j) => j.estado !== 'lesionado').map((j) => j.id))}>
        {sel.length === jugadores.length ? 'Quitar todos' : 'Seleccionar disponibles'}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {disponibles.map((j) => {
          const checked = sel.includes(j.id)
          return (
            <label key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: checked ? 'var(--primary-pale)' : '#f9fafc', border: `1px solid ${checked ? 'var(--primary)' : '#eee'}`, borderRadius: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={checked} onChange={(e) => toggle(j.id, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
              <Avatar jugador={j} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gris-dark)' }}>{j.nombre}</div>
                <div style={{ fontSize: 11, color: j.estado && j.estado !== 'disponible' ? 'var(--danger)' : 'var(--gris-mid)' }}>{j.posicion}{j.estado && j.estado !== 'disponible' ? ` · ${j.estado}` : ''}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--gris-mid)' }}>#{j.dorsal}</div>
            </label>
          )
        })}
      </div>
      {error && <div className="alert-error"><Icon name="alert-triangle" /> {error}</div>}
      <button onClick={save} disabled={saving} className="btn btn-primary btn-block">{saving ? 'Guardando…' : `Guardar convocatoria (${sel.length})`}</button>
    </Sheet>
  )
}
