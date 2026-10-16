import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { useAuth } from '../hooks/useAuth'
import { haptics } from '../lib/haptics'
import { isHome, rivalName, matchResult, matchSides } from '../lib/match'
import { startersFromLineup, eventsByPlayer } from '../lib/timeline'
import { PlayerBadges, hasBadges } from '../components/EventIcons'
import Alineacion from '../components/Alineacion'
import MatchTimeline, { EventEditor } from '../components/MatchTimeline'
import TeamCrest from '../components/TeamCrest'
import Sheet from '../components/Sheet'
import KitPicker from '../components/KitPicker'
import { KITS, DEFAULT_KIT } from '../config/club'

const fmt = (str) => new Date(str).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const posOrder = { Portero: 0, Defensa: 1, Centrocampista: 2, Delantero: 3 }
const byPos = (a, b) => (posOrder[a.posicion] ?? 99) - (posOrder[b.posicion] ?? 99) || (a.dorsal || 99) - (b.dorsal || 99)
const initials = (n = '?') => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

function Avatar({ jugador, size = 32 }) {
  return (
    <div className="avatar avatar-sm" style={{ overflow: 'hidden', padding: 0, width: size, height: size, flexShrink: 0 }}>
      {jugador?.foto_url
        ? <img src={jugador.foto_url} alt={jugador.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : <span style={{ fontSize: size * 0.38 }}>{initials(jugador?.nombre)}</span>}
    </div>
  )
}

const CardIcon = ({ color }) => <span style={{ display: 'inline-block', width: 10, height: 14, background: color, borderRadius: 2, verticalAlign: 'middle' }} />

export default function DetallePartido() {
  const { id } = useParams()
  const nav = useNavigate()
  const { partidos, jugadores, stats, store, loading } = useStore()
  const auth = useAuth()
  const isAdmin = auth.isAdmin
  const jugadorActivo = auth.jugadorId ? jugadores.find((j) => j.id === auth.jugadorId) || null : null

  const partido = partidos.find((p) => p.id === Number(id))
  const [alineacion, setAlineacion] = useState(null)
  const [alineacionCargada, setAlineacionCargada] = useState(false)
  const [eventos, setEventos] = useState([])
  const [votos, setVotos] = useState({ ranking: [], visibles: [] })
  const [miVoto, setMiVoto] = useState(null)
  const [editEvento, setEditEvento] = useState(null) // null | {} (new) | event
  const [editConvocatoria, setEditConvocatoria] = useState(false)

  const cargarEventos = () => partido && store.getEventos(partido.id).then(setEventos)

  useEffect(() => {
    if (!partido) return
    store.getAlineacion(partido.id).then((a) => { setAlineacion(a); setAlineacionCargada(true) })
    cargarEventos()
    store.getVotosMvp(partido.id).then(setVotos)
  }, [partido?.id])

  // My vote depends on who is logged in (can change without leaving the page)
  useEffect(() => {
    setMiVoto(auth.jugadorId ? votos.visibles.find((x) => x.votante_id === auth.jugadorId)?.votado_id || null : null)
  }, [votos, auth.jugadorId])

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
  const statOf = (jid) => statsPartido.find((s) => s.jugador_id === jid)

  // Event badges (goals, penalties, own goals, cards) for shirts and substitutes.
  // From the timeline when there is one; otherwise from the manual stats.
  const eventInfo = eventos.length ? eventsByPlayer(eventos) : Object.fromEntries(statsPartido.map((s) => [s.jugador_id, {
    goles: s.goles, penaltis: 0, propia: 0, amarillas: s.tarjetas_amarillas, roja: s.tarjetas_rojas > 0, segunda: false,
  }]))
  const badges = {}
  Object.entries(eventInfo).forEach(([id, info]) => {
    if (hasBadges(info)) badges[id] = <PlayerBadges info={info} size={10} />
  })

  // MVP ranking
  const ranking = [...votos.ranking].sort((a, b) => b.votos - a.votos)
    .map((r) => ({ jugador: getJugador(Number(r.votado_id)), votos: r.votos })).filter((x) => x.jugador)
  const mvpId = partido.mvp_jugador_id || ranking[0]?.jugador.id || null
  const votables = jugadores.filter((j) => convocadosIds.includes(j.id) || statsPartido.some((s) => s.jugador_id === j.id && s.minutos > 0)).sort(byPos)

  const votar = async (jid) => {
    if (!jugadorActivo) return
    haptics.tap?.()
    await store.votarMvp(partido.id, jugadorActivo.id, jid)
    setMiVoto(jid)
    setVotos(await store.getVotosMvp(partido.id))
  }
  const quitarVoto = async () => {
    setMiVoto(null)
    await store.eliminarVotoMvp(partido.id, jugadorActivo.id)
    setVotos(await store.getVotosMvp(partido.id))
  }

  const guardarAlineacion = async (formacion, slots) => {
    await store.saveAlineacion(partido.id, formacion, slots)
    setAlineacion({ formacion, jugadores: slots })
  }

  const fichaFilas = statsPartido
    .filter((s) => s.minutos > 0 || s.goles || s.asistencias || s.tarjetas_amarillas || s.tarjetas_rojas)
    .map((s) => ({ s, j: getJugador(s.jugador_id) }))
    .filter((x) => x.j)
    .sort((a, b) => Number(b.s.titular) - Number(a.s.titular) || byPos(a.j, b.j))

  const Crest = ({ side, size }) => side.ours
    ? <img src={side.crest} alt={side.name} style={{ width: size, height: size, objectFit: 'contain' }} />
    : <TeamCrest src={side.crest} name={side.name} size={size} />

  return (
    <div className="page anim-fade">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => nav('/partidos')} style={{ background: 'none', border: 'none', color: 'var(--primary-mid)', fontSize: 14, fontWeight: 600, padding: 0 }}>← Volver</button>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            {partido.jugado && (
              <button onClick={() => nav(`/admin?tab=stats&partido=${partido.id}`)} style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 700 }}>📊 Stats</button>
            )}
            <button onClick={() => nav(`/admin?tab=partidos&edit=${partido.id}`)} style={{ background: 'none', border: '1.5px solid #b9cbe2', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>✏️ Editar</button>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="hero-navy" style={{ padding: '1.4rem 1rem', marginBottom: '1rem', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--on-navy)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          {partido.amistoso ? 'Amistoso' : `Jornada ${partido.jornada}`} · {fmt(partido.fecha)}{partido.hora ? ` · ${partido.hora}` : ''}
        </div>
        <div style={{ fontSize: 12, color: 'var(--on-navy-muted)', marginBottom: 14 }}>📍 {partido.campo} · {isHome(partido) ? 'En casa' : 'Fuera'}</div>
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
            ? <span className={`tag-${resultado}`} style={{ fontSize: 13, padding: '4px 16px' }}>{resultado === 'victoria' ? '✓ Victoria' : resultado === 'derrota' ? '✗ Derrota' : '= Empate'}</span>
            : <span style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--on-navy)', padding: '4px 14px', borderRadius: 20, fontSize: 13 }}>Pendiente</span>}
        </div>
      </div>

      {/* Timeline */}
      {partido.jugado && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 18, color: 'var(--primary)', marginBottom: 10 }}>⏱️ Minuto a minuto</h2>
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
            <h2 style={{ fontSize: 18, color: 'var(--primary)' }}>👕 {partido.jugado ? 'Alineación' : 'Alineación prevista'}</h2>
            <span style={{ fontSize: 12, color: 'var(--gris-mid)' }}>
              {alineacion?.formacion ? `${alineacion.formacion} · ` : ''}Equipación {(KITS[partido.equipacion] || KITS[DEFAULT_KIT]).label.toLowerCase()}
            </span>
          </div>
          {isAdmin && (
            <div style={{ marginBottom: 12 }}>
              <KitPicker value={partido.equipacion || DEFAULT_KIT} onChange={(v) => v !== partido.equipacion && store.updatePartido(partido.id, { equipacion: v })} />
            </div>
          )}
          {alineacionCargada
            ? <Alineacion jugadores={jugadores} alineacionInicial={alineacion} onSave={guardarAlineacion} modoEdicion={isAdmin} elegibles={convocados} mvpId={partido.jugado ? mvpId : null} badges={badges} kit={partido.equipacion || DEFAULT_KIT} />
            : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gris-mid)', fontSize: 13 }}>Cargando alineación…</div>}

          <div style={{ marginTop: 20, borderTop: '1px solid #e8eff8', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontSize: 15, color: 'var(--gris-dark)' }}>{partido.jugado ? '🔄 Suplentes' : `📋 Convocatoria (${convocados.length})`}</h3>
              {isAdmin && <button onClick={() => setEditConvocatoria(true)} style={{ background: 'var(--primary-pale)', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>✏️ Convocatoria</button>}
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
          <h2 style={{ fontSize: 18, color: 'var(--primary)', marginBottom: 12 }}>📋 Ficha del partido</h2>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Jugador</th><th style={{ textAlign: 'center' }}>Min</th><th style={{ textAlign: 'center' }}>⚽</th><th style={{ textAlign: 'center' }}>🅰️</th><th style={{ textAlign: 'center' }}><CardIcon color="#f0c040" /></th><th style={{ textAlign: 'center' }}><CardIcon color="#d63a2f" /></th></tr></thead>
              <tbody>
                {fichaFilas.map(({ s, j }) => (
                  <tr key={j.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar jugador={j} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{j.nombre}</div>
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

      {/* MVP */}
      {partido.jugado && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 18, color: 'var(--primary)', marginBottom: 14 }}>⭐ MVP del partido</h2>
          {ranking.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {ranking.map(({ jugador: j, votos: n }, i) => (
                <div key={j.id} className={i === 0 ? 'hero-navy' : ''} style={{ border: i === 0 ? 'none' : '1px solid #e8eff8', borderRadius: 12, padding: i === 0 ? '12px 16px' : '8px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar jugador={j} size={i === 0 ? 46 : 34} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: i === 0 ? 'var(--on-navy)' : 'var(--gris-mid)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{i === 0 ? 'MVP — ' : ''}{n} voto{n !== 1 ? 's' : ''}</div>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: i === 0 ? 22 : 18, color: i === 0 ? 'white' : 'var(--navy)', lineHeight: 1.1 }}>{j.nombre}</div>
                  </div>
                  {i === 0 && <div style={{ fontSize: 26 }}>⭐</div>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--gris-mid)', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>Sin votos aún — sé el primero</div>
          )}

          {jugadorActivo && !miVoto && votables.length > 0 && (
            <>
              <div style={{ fontSize: 13, color: 'var(--gris-mid)', marginBottom: 10 }}>Vota al mejor del partido:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {votables.filter((j) => j.id !== jugadorActivo.id).map((j) => {
                  const s = statOf(j.id) || {}
                  return (
                    <button key={j.id} onClick={() => votar(j.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'white', border: '1.5px solid #b9cbe2', borderRadius: 10, textAlign: 'left' }}>
                      <Avatar jugador={j} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--gris-mid)' }}>{s.minutos || 0}' · ⚽{s.goles || 0} 🅰️{s.asistencias || 0}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {jugadorActivo && miVoto && (
            <div style={{ background: 'var(--primary-pale)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>✓ Has votado a <strong>{getJugador(miVoto)?.nombre}</strong></span>
              <button onClick={quitarVoto} style={{ background: 'white', border: '1.5px solid var(--primary)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>Cambiar</button>
            </div>
          )}
          {!jugadorActivo && <div style={{ fontSize: 13, color: 'var(--gris-mid)', textAlign: 'center' }}>Identifícate como jugador para votar al MVP</div>}
        </div>
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
  const disponibles = [...jugadores].sort(byPos)
  const toggle = (id, on) => setSel((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)))

  const save = async () => {
    setSaving(true)
    let nueva = null
    // Remove from the lineup anyone who is no longer called up
    if (alineacion?.jugadores?.some((s) => s?.jugador_id && !sel.includes(s.jugador_id))) {
      const slots = alineacion.jugadores.map((s) => (s?.jugador_id && !sel.includes(s.jugador_id) ? { ...s, jugador_id: null } : s))
      await store.saveAlineacion(partido.id, alineacion.formacion, slots)
      nueva = { ...alineacion, jugadores: slots }
    }
    await store.updateConvocados(partido.id, sel)
    haptics.success?.()
    onClose(nueva)
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
      <button onClick={save} disabled={saving} className="btn btn-primary btn-block">{saving ? 'Guardando…' : `Guardar convocatoria (${sel.length})`}</button>
    </Sheet>
  )
}
