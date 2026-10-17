import { useState } from 'react'
import { useStore } from '../hooks/useStore'
import { playerTotals, fmtMin } from '../lib/playerTotals'
import { useAuth } from '../hooks/useAuth'
import { messageFor, UserFacingError } from '../lib/dbErrors'
import { LIMITS } from '../lib/validation'

function initials(n) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }
function Avatar({ jugador, size = 'sm' }) {
  const dim = size === 'sm' ? 32 : size === 'md' ? 42 : 64
  const fs = size === 'sm' ? 12 : size === 'md' ? 15 : 22
  return (
    <div className={`avatar avatar-${size}`} style={{ overflow: 'hidden', padding: 0, width: dim, height: dim, flexShrink: 0 }}>
      {jugador?.foto_url
        ? <img src={jugador.foto_url} alt={jugador.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : <span style={{ fontSize: fs }}>{initials(jugador?.nombre || '?')}</span>
      }
    </div>
  )
}

const posiciones = ['Todos', 'Portero', 'Defensa', 'Centrocampista', 'Delantero']
const POSICIONES = ['Portero', 'Defensa', 'Centrocampista', 'Delantero']
const posClass = { Portero: 'pos-portero', Defensa: 'pos-defensa', Centrocampista: 'pos-centrocampista', Delantero: 'pos-delantero' }
const posOrder = { Portero: 0, Defensa: 1, Centrocampista: 2, Delantero: 3 }
const ESTADOS = {
  disponible: { icono: null, label: 'Disponible', color: null },
  lesionado: { icono: '🏥', label: 'Lesionado', color: '#c0392b' },
  duda: { icono: '❓', label: 'Duda', color: '#e0a020' },
  sancionado: { icono: '🟥', label: 'Sancionado', color: '#c0392b' },
  baja: { icono: '💤', label: 'Baja', color: '#888' },
}
const IconoEstado = ({ estado, size = 16 }) => {
  const e = ESTADOS[estado]
  if (!e?.icono) return null
  return (
    <div style={{ position: 'absolute', top: 0, right: 0, width: size + 4, height: size + 4, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size - 2, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', zIndex: 2 }}>
      {e.icono === '🏥' ? <span style={{ color: '#c0392b', fontWeight: 900, fontSize: size - 2, lineHeight: 1 }}>✚</span> : e.icono}
    </div>
  )
}

const statTabs = [
  { key: 'goles', label: '⚽ Goles', color: 'var(--primary)' },
  { key: 'asistencias', label: '🅰️ Asistencias', color: 'var(--primary)' },
  { key: 'minutos', label: '🕒 Minutos', color: 'var(--navy)' },
  { key: 'partidos', label: '🎮 Partidos', color: 'var(--primary-mid)' },
  { key: 'tarjetas_amarillas', label: '🟨 Amarillas', color: '#c8a800' },
  { key: 'paradas', label: '🧤 Paradas', color: '#185fa5' },
  { key: 'goles_encajados', label: '🥅 Encajados', color: '#c0392b' },
]

export default function Jugadores() {
  const { jugadores, stats, partidos, store } = useStore()
  const { isAdmin } = useAuth()

  const [vista, setVista] = useState('plantilla')
  const [filtro, setFiltro] = useState('Todos')
  const [selected, setSelected] = useState(null)
  const [statTab, setStatTab] = useState('goles')

  // Edit modal state
  const emptyForm = { nombre: '', posicion: 'Delantero', dorsal: '', foto_url: '', estado: 'disponible', estado_desc: '' }
  const [editModal, setEditModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [fotoArchivo, setFotoArchivo] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const conTotales = playerTotals(jugadores, stats, partidos)

  const filtrados = (filtro === 'Todos' ? conTotales : conTotales.filter(j => j.posicion === filtro))
    .sort((a, b) => (posOrder[a.posicion] ?? 99) - (posOrder[b.posicion] ?? 99))

  const jugador = selected ? conTotales.find(j => j.id === selected) : null

  // Stats
  const cur = statTabs.find(t => t.key === statTab)
  const porteroTabs = ['paradas', 'goles_encajados']
  const sorted = [...conTotales]
    .filter(j => j[statTab] > 0 && (porteroTabs.includes(statTab) ? j.posicion === 'Portero' : true))
    .sort((a, b) => b[statTab] - a[statTab])
  const max = Math.max(...conTotales.map(j => j[statTab]), 1)
  const totGoles = conTotales.reduce((s, j) => s + j.goles, 0)
  const totAsist = conTotales.reduce((s, j) => s + j.asistencias, 0)
  const totAmar = conTotales.reduce((s, j) => s + j.tarjetas_amarillas, 0)
  const maxPJ = Math.max(...conTotales.map(j => j.partidos), 0)

  const openEdit = (j) => {
    setForm({ nombre: j.nombre, posicion: j.posicion, dorsal: j.dorsal, foto_url: j.foto_url || '', estado: j.estado || 'disponible', estado_desc: j.estado_desc || '' })
    setFotoArchivo(null)
    setFotoPreview(j.foto_url || null)
    setEditModal(true)
  }

  const saveEdit = async () => {
    if (!form.nombre.trim()) return
    setSaving(true)
    try {
      let foto_url = form.foto_url || null
      if (fotoArchivo) {
        foto_url = await store.subirFotoJugador(jugador.id, fotoArchivo)
        if (!foto_url) throw new UserFacingError('No se pudo subir la foto. Inténtalo de nuevo.')
      }
      // The store validates (validation.js) and the database checks again
      await store.updateJugador(jugador.id, { ...form, foto_url })
      setFotoArchivo(null)
      setFotoPreview(null)
      setEditModal(false)
    } catch (e) {
      console.error('[jugadores] update failed', e)
      window.alert(messageFor(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page anim-fade">
      {/* Selector de vista */}
      <div style={{ display: 'flex', background: '#e8eff8', borderRadius: 12, padding: 4, marginBottom: '1.25rem', gap: 4 }}>
        {[['plantilla', '👕', 'Plantilla'], ['stats', '📊', 'Estadísticas']].map(([key, icon, label]) => (
          <button
            key={key}
            onClick={() => setVista(key)}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 700,
              background: vista === key ? 'white' : 'transparent',
              color: vista === key ? 'var(--primary)' : 'var(--gris-mid)',
              boxShadow: vista === key ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* VISTA PLANTILLA */}
      {vista === 'plantilla' && (
        <>
          <h1 className="page-title">Plantilla · {jugadores.length}</h1>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: '1rem', scrollbarWidth: 'none' }}>
            {posiciones.map(p => (
              <button key={p} onClick={() => setFiltro(p)} style={{ padding: '7px 14px', borderRadius: 20, whiteSpace: 'nowrap', border: '1.5px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, minHeight: 36, background: filtro === p ? 'var(--primary)' : 'white', color: filtro === p ? 'white' : 'var(--primary-mid)', borderColor: filtro === p ? 'var(--primary)' : '#b9cbe2' }}>{p}</button>
            ))}
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {filtrados.map((j, i) => (
              <div key={j.id} onClick={() => setSelected(j.id === selected ? null : j.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < filtrados.length - 1 ? '1px solid #e8eff8' : 'none', background: selected === j.id ? '#eef4fb' : 'white', cursor: 'pointer' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div className="avatar avatar-md" style={{ overflow: 'hidden', padding: 0 }}>
                    {j.foto_url
                      ? <img src={j.foto_url} alt={j.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : initials(j.nombre)
                    }
                  </div>
                  <IconoEstado estado={j.estado} size={12} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{j.nombre}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span className={`pos-pill ${posClass[j.posicion]}`}>{j.posicion}</span>
                    <span style={{ fontSize: 12, color: 'var(--gris-mid)' }}>#{j.dorsal}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                  {(j.posicion === 'Portero'
                    ? [['🧤', j.paradas], ['🥅', j.goles_encajados], ['🎮', j.partidos]]
                    : [['⚽', j.goles], ['🅰️', j.asistencias], ['🕒', `${j.minutos}'`]]
                  ).map(([ic, v]) => (
                    <div key={ic} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: 'var(--primary)', lineHeight: 1 }}>{v}</div>
                      <div style={{ fontSize: 9, color: 'var(--gris-mid)' }}>{ic}</div>
                    </div>
                  ))}
                </div>
                <div style={{ color: '#b9cbe2', fontSize: 16 }}>›</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* VISTA ESTADÍSTICAS */}
      {vista === 'stats' && (
        <>
          <h1 className="page-title">Estadísticas</h1>
          <div className="grid-4" style={{ marginBottom: '1.25rem' }}>
            {[['Goles', totGoles, 'var(--primary)'], ['Asistencias', totAsist, 'var(--primary-mid)'], ['Amarillas', totAmar, '#c8a800'], ['Jornadas', maxPJ, 'var(--primary)']].map(([l, v, c]) => (
              <div key={l} className="metric-card"><div className="metric-label">{l}</div><div className="metric-value" style={{ color: c }}>{v}</div></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: '1rem', scrollbarWidth: 'none' }}>
            {statTabs.map(t => (
              <button key={t.key} onClick={() => setStatTab(t.key)} style={{ padding: '8px 16px', borderRadius: 20, whiteSpace: 'nowrap', border: '1.5px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, background: statTab === t.key ? 'var(--primary)' : 'white', color: statTab === t.key ? 'white' : 'var(--primary-mid)', borderColor: statTab === t.key ? 'var(--primary)' : '#b9cbe2' }}>{t.label}</button>
            ))}
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
            {sorted.length === 0 && <div className="empty">Sin datos aún</div>}
            {sorted.map((j, i) => (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < sorted.length - 1 ? '1px solid #e8eff8' : 'none', background: i === 0 ? '#eef4fb' : 'white' }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, minWidth: 24, textAlign: 'center', color: ['#c8a800', '#909090', '#a06030', '#b9cbe2'][Math.min(i, 3)] }}>{i + 1}</div>
                <Avatar jugador={j} size="sm" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{j.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--gris-mid)' }}>{j.posicion}</div>
                </div>
                <div className="bar-wrap" style={{ maxWidth: 80 }}><div className="bar-fill" style={{ width: `${Math.round(j[statTab] / max * 100)}%`, background: cur.color }} /></div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: cur.color, minWidth: 28, textAlign: 'right' }}>{statTab === 'minutos' ? fmtMin(j[statTab]) : j[statTab]}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th style={{ textAlign: 'center' }}>PJ</th>
                  <th style={{ textAlign: 'center' }}>Min</th>
                  <th style={{ textAlign: 'center' }}>⚽</th>
                  <th style={{ textAlign: 'center' }}>🅰️</th>
                  <th style={{ textAlign: 'center' }}>🟨</th>
                  <th style={{ textAlign: 'center' }}>🧤</th>
                  <th style={{ textAlign: 'center' }}>🥅</th>
                </tr>
              </thead>
              <tbody>
                {[...conTotales].sort((a, b) => (b.goles + b.asistencias) - (a.goles + a.asistencias)).map(j => (
                  <tr key={j.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar jugador={j} size="sm" /><div><div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{j.nombre}</div><div style={{ fontSize: 10, color: 'var(--gris-mid)' }}>{j.posicion}</div></div></div></td>
                    <td style={{ textAlign: 'center', fontSize: 14 }}>{j.partidos}</td>
                    <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: j.minutos ? 'var(--navy)' : '#ccc' }}>{j.minutos ? fmtMin(j.minutos) : '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: j.goles > 0 ? 'var(--primary)' : '#ccc' }}>{j.goles || '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: j.asistencias > 0 ? 'var(--primary)' : '#ccc' }}>{j.asistencias || '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 14 }}>{j.tarjetas_amarillas > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 13, background: '#f0c040', borderRadius: 2, display: 'inline-block' }} />{j.tarjetas_amarillas}</span> : <span style={{ color: '#ddd' }}>—</span>}</td>
                    <td style={{ textAlign: 'center', fontSize: 14, color: j.paradas > 0 ? '#185fa5' : '#ccc' }}>{j.paradas || '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 14, color: j.goles_encajados > 0 ? '#c0392b' : '#ccc' }}>{j.goles_encajados || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal detalle jugador */}
      {jugador && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, animation: 'fadeIn 0.2s ease' }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 300, background: 'white', borderRadius: '20px 20px 0 0', padding: '1.5rem', paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))', boxShadow: '0 -4px 30px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto', animation: 'slideUpModal 0.3s cubic-bezier(0.32,0.72,0,1)' }}>
            <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '-0.5rem auto 1.25rem' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: '1.25rem' }}>
              <div className="avatar avatar-lg" style={{ overflow: 'hidden', padding: 0 }}>
                {jugador.foto_url
                  ? <img src={jugador.foto_url} alt={jugador.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : initials(jugador.nombre)
                }
              </div>
              <div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: 'var(--primary)', lineHeight: 1 }}>{jugador.nombre}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span className={`pos-pill ${posClass[jugador.posicion]}`}>{jugador.posicion}</span>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: '#b9cbe2', lineHeight: 1 }}>#{jugador.dorsal}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: '1rem' }}>
              {[
                ['Partidos', jugador.partidos, 'var(--primary)'],
                ['Minutos', fmtMin(jugador.minutos), 'var(--navy)'],
                ['Titular', jugador.titularidades, 'var(--primary-mid)'],
                ['Goles', jugador.goles, 'var(--primary-mid)'],
                ['Asistencias', jugador.asistencias, 'var(--primary)'],
                ['Amarillas', jugador.tarjetas_amarillas, '#c8a800'],
                ...(jugador.posicion === 'Portero' ? [
                  ['Paradas', jugador.paradas || 0, '#185fa5'],
                  ['Goles enc.', jugador.goles_encajados || 0, '#c0392b'],
                ] : [])
              ].map(([l, v, c]) => (
                <div key={l} style={{ background: '#f3f6fb', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: c, lineHeight: 1 }}>{v}</div>
                  <div style={{ fontSize: 10, color: 'var(--gris-mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{l}</div>
                </div>
              ))}
            </div>
            {jugador.estado && jugador.estado !== 'disponible' && (
              <div style={{ background: ESTADOS[jugador.estado]?.color + '18', border: `1.5px solid ${ESTADOS[jugador.estado]?.color}44`, borderRadius: 12, padding: '10px 14px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{jugador.estado === 'lesionado' ? '✚' : ESTADOS[jugador.estado]?.icono}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: ESTADOS[jugador.estado]?.color }}>{ESTADOS[jugador.estado]?.label}</div>
                  {jugador.estado_desc && <div style={{ fontSize: 12, color: 'var(--gris-mid)', marginTop: 2 }}>{jugador.estado_desc}</div>}
                </div>
              </div>
            )}
            {(jugador.goles + jugador.asistencias) > 0 && (
              <div style={{ background: '#f3f6fb', borderRadius: 12, padding: '12px 14px', marginBottom: '1rem' }}>
                <div style={{ fontSize: 12, color: 'var(--gris-mid)', marginBottom: 6 }}>Participación ofensiva</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="bar-wrap"><div className="bar-fill" style={{ width: `${Math.round((jugador.goles + jugador.asistencias) / Math.max(...conTotales.map(j => j.goles + j.asistencias), 1) * 100)}%` }} /></div>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: 'var(--primary)' }}>{jugador.goles + jugador.asistencias}</span>
                </div>
              </div>
            )}
            {isAdmin && (
              <button
                onClick={() => openEdit(jugador)}
                className="btn btn-ghost btn-block"
                style={{ marginBottom: 10 }}
              >
                ✏️ Editar jugador
              </button>
            )}
            <button onClick={() => setSelected(null)} className="btn btn-primary btn-block">Cerrar</button>
          </div>
        </>
      )}

      {/* Modal editar jugador */}
      {editModal && jugador && (
        <>
          <div onClick={() => setEditModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 500, background: 'white', borderRadius: '20px 20px 0 0', padding: '1.5rem', paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))', boxShadow: '0 -4px 30px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '-0.5rem auto 1rem' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--primary)' }}>Editar jugador</h2>
              <button onClick={() => setEditModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#aaa' }}>✕</button>
            </div>
            <div className="form-group">
              <label className="label">Nombre</label>
              <input className="input" value={form.nombre} onChange={e => setF('nombre', e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="form-group">
              <label className="label">Posición</label>
              <select className="select" value={form.posicion} onChange={e => setF('posicion', e.target.value)}>
                {POSICIONES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Dorsal</label>
              <input className="input" type="number" value={form.dorsal} onChange={e => setF('dorsal', e.target.value)} placeholder="Número de camiseta" />
            </div>
            <div className="form-group">
              <label className="label">Foto de perfil</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid #b9cbe2' }}>
                  {fotoPreview
                    ? <img src={fotoPreview} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: '#9fc2ec', fontWeight: 700, fontSize: 20 }}>{form.nombre ? initials(form.nombre) : '?'}</span>
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', background: 'white', border: '1.5px solid #b9cbe2', borderRadius: 10, padding: '8px 14px', fontSize: 13, cursor: 'pointer', textAlign: 'center', color: 'var(--primary-mid)', fontWeight: 600 }}>
                    📷 {fotoPreview ? 'Cambiar foto' : 'Subir foto'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                      const file = e.target.files[0]
                      if (!file) return
                      setFotoArchivo(file)
                      setFotoPreview(URL.createObjectURL(file))
                    }} />
                  </label>
                  {fotoPreview && (
                    <button type="button" onClick={() => { setFotoArchivo(null); setFotoPreview(null); setF('foto_url', '') }}
                      style={{ width: '100%', marginTop: 6, background: 'none', border: 'none', fontSize: 12, color: '#c0392b', cursor: 'pointer' }}>
                      Eliminar foto
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="label">Estado</label>
              <select className="select" value={form.estado} onChange={e => setF('estado', e.target.value)}>
                {Object.entries(ESTADOS).map(([k, v]) => (
                  <option key={k} value={k}>{v.icono ? `${v.icono === '🏥' ? '✚' : v.icono} ` : ''}{v.label}</option>
                ))}
              </select>
            </div>
            {form.estado !== 'disponible' && (
              <div className="form-group">
                <label className="label">Descripción <span style={{ fontWeight: 400, color: 'var(--gris-mid)', fontSize: 11 }}>(opcional)</span></label>
                <input className="input" value={form.estado_desc} maxLength={LIMITS.estadoDesc} onChange={e => setF('estado_desc', e.target.value)} placeholder={form.estado === 'lesionado' ? 'Ej: Rotura de ligamentos' : 'Describe el motivo'} />
              </div>
            )}
            <button onClick={saveEdit} disabled={saving} className="btn btn-primary btn-block" style={{ opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}