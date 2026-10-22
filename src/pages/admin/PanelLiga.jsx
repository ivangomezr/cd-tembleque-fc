import { useMemo, useState } from 'react'
import { useStore } from '../../hooks/useStore'
import { useStandings } from '../../hooks/useStandings'
import { haptics } from '../../lib/haptics'
import TeamCrest from '../../components/TeamCrest'
import Sheet from '../../components/Sheet'
import { validarPartidoLiga, validarEquipo, validarTemporada, debeMarcarseJugado, LIMITS } from '../../lib/validation'
import { messageFor } from '../../lib/dbErrors'
import Icon from '../../components/Icon'
import { ZONES } from '../../lib/standings'

const SECTIONS = [
  { key: 'resultados', label: 'Jornadas', icon: 'calendar' },
  { key: 'equipos', label: 'Equipos', icon: 'shield-half' },
  { key: 'config', label: 'Zonas', icon: 'settings' },
]

export default function PanelLiga() {
  const [section, setSection] = useState('resultados')
  return (
    <div>
      <div className="segmented" style={{ marginBottom: 14 }}>
        {SECTIONS.map((s) => (
          <button key={s.key} className={section === s.key ? 'active' : ''} onClick={() => setSection(s.key)}><span className="with-icon"><Icon name={s.icon} /> {s.label}</span></button>
        ))}
      </div>
      {section === 'resultados' && <Resultados />}
      {section === 'equipos' && <Equipos />}
      {section === 'config' && <Zonas />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Results per matchday
// ─────────────────────────────────────────────────────────────────────────────
function Resultados() {
  const { store, partidos, partidosLiga, temporada } = useStore()
  const { results, equipos } = useStandings()
  const totalJornadas = Math.max(2 * (equipos.length - 1), 1)
  const maxConDatos = Math.max(0, ...results.map((r) => r.jornada || 0))
  const ultimaJugada = Math.max(0, ...results.filter((r) => r.jugado).map((r) => r.jornada || 0))
  const [jornada, setJornada] = useState(Math.max(1, ultimaJugada || 1))
  const [edit, setEdit] = useState(null) // { mode, data }
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const team = (id) => equipos.find((e) => e.id === id)
  const deJornada = results.filter((r) => r.jornada === jornada)
  const ocupados = new Set(deJornada.flatMap((r) => [r.local_id, r.visitante_id]))
  const libres = equipos.filter((e) => !ocupados.has(e.id))

  const openAdd = () => {
    setError('')
    setEdit({ mode: 'add', data: { jornada, fecha: '', local_id: '', visitante_id: '', goles_local: 0, goles_visitante: 0, jugado: false } })
  }
  const openEdit = (r) => {
    setError('')
    // A past fixture still pending is ticked as played automatically (the admin then fills in the score)
    const auto = debeMarcarseJugado(r)
    setEdit({ mode: 'edit', id: r.id, auto, data: { ...r, jugado: r.jugado || auto } })
  }

  const save = async () => {
    const d = edit.data
    try {
      // Same rules as the database (validation.js ↔ migration 20261017180000)
      validarPartidoLiga(d, { partidosLiga, partidos, equipos, temporada, id: edit.id ?? null })
    } catch (e) { haptics.error?.(); return setError(messageFor(e)) }
    if (edit.auto && d.jugado && !edit.marcador &&
        !window.confirm(`Se ha marcado como jugado porque la fecha ya pasó. ¿Guardar con el resultado ${Number(d.goles_local) || 0}-${Number(d.goles_visitante) || 0}?`)) return
    setSaving(true)
    try {
      if (edit.mode === 'add') await store.addPartidoLiga(d)
      else await store.updatePartidoLiga(edit.id, d)
      haptics.success?.()
      setEdit(null)
    } catch (e) {
      haptics.error?.()
      setError(messageFor(e))
    } finally {
      setSaving(false)
    }
  }

  const set = (k, v) => {
    setError('')
    setEdit((e) => {
      const data = { ...e.data, [k]: v }
      let { auto, marcador } = e
      if (k === 'jugado') auto = false
      if (k === 'goles_local' || k === 'goles_visitante') marcador = true
      // Picking a date that has already passed ticks "played" (unless the admin already decided)
      if (k === 'fecha' && !e.tocado && !e.data.jugado && debeMarcarseJugado({ fecha: v, jugado: false })) { data.jugado = true; auto = true }
      return { ...e, data, auto, marcador, tocado: e.tocado || k === 'jugado' }
    })
  }

  if (equipos.length < 2) {
    return <div className="empty">Añade primero los equipos del grupo en <strong>Equipos</strong>.</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" disabled={jornada <= 1} onClick={() => setJornada((j) => j - 1)} aria-label="Jornada anterior">‹</button>
        <select className="select" value={jornada} onChange={(e) => setJornada(Number(e.target.value))} style={{ flex: 1, textAlign: 'center' }}>
          {Array.from({ length: Math.max(totalJornadas, maxConDatos) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>Jornada {n}</option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" disabled={jornada >= Math.max(totalJornadas, maxConDatos)} onClick={() => setJornada((j) => j + 1)} aria-label="Jornada siguiente">›</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        {deJornada.length === 0 && <div className="empty">Sin partidos en esta jornada</div>}
        {deJornada.map((r, i) => {
          const L = team(r.local_id), V = team(r.visitante_id)
          return (
            <button key={r.id} onClick={() => !r.own && openEdit(r)} disabled={r.own}
              style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, padding: '12px 14px', background: r.own ? 'var(--primary-pale)' : 'white', border: 'none', borderBottom: i < deJornada.length - 1 ? '1px solid #e8eff8' : 'none', cursor: r.own ? 'default' : 'pointer', textAlign: 'left', color: 'var(--navy)', opacity: 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', fontSize: 13, fontWeight: 600, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{L?.nombre_corto || L?.nombre}</span>
                <TeamCrest team={L} size={22} />
              </span>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, minWidth: 54, textAlign: 'center', color: r.jugado ? 'var(--navy)' : '#aaa' }}>
                {r.jugado ? `${r.goles_local} - ${r.goles_visitante}` : 'vs'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, minWidth: 0 }}>
                <TeamCrest team={V} size={22} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{V?.nombre_corto || V?.nombre}</span>
              </span>
            </button>
          )
        })}
      </div>
      {deJornada.some((r) => r.own) && <p style={{ fontSize: 11, color: 'var(--gris-mid)', marginBottom: 10 }}>El partido resaltado es el nuestro: se edita desde Admin › Partidos.</p>}
      {libres.length >= 2 && <button className="btn btn-primary btn-block" onClick={openAdd}>+ Añadir partido a la jornada {jornada}</button>}
      {libres.length === 1 && <p style={{ fontSize: 12, color: 'var(--gris-mid)', textAlign: 'center' }}>Descansa: {libres[0].nombre}</p>}

      {edit && (
        <Sheet title={edit.mode === 'add' ? `Nuevo partido · J${edit.data.jornada}` : `Editar partido · J${edit.data.jornada}`} onClose={() => setEdit(null)}>
          {[['local_id', 'Local'], ['visitante_id', 'Visitante']].map(([k, l]) => (
            <div className="form-group" key={k}>
              <label className="label">{l}</label>
              <select className="select" value={edit.data[k]} onChange={(e) => set(k, e.target.value)}>
                <option value="">Selecciona…</option>
                {equipos.filter((e) => !e.es_propio).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
          ))}
          <div className="form-group">
            <label className="label">Fecha <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--gris-mid)' }}>(opcional)</span></label>
            <input className="input" type="date" value={edit.data.fecha || ''} onChange={(e) => set('fecha', e.target.value)} />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input id="jugado-liga" type="checkbox" checked={!!edit.data.jugado} onChange={(e) => set('jugado', e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
            <label htmlFor="jugado-liga" className="label" style={{ margin: 0 }}>Partido jugado</label>
          </div>
          {edit.auto && edit.data.jugado && (
            <p style={{ fontSize: 12, color: 'var(--primary)', background: 'var(--primary-pale)', borderRadius: 8, padding: '8px 10px', margin: '-6px 0 12px' }}>
              <Icon name="check" /> Marcado automáticamente porque la fecha ya pasó. Indica el resultado.
            </p>
          )}
          {edit.data.jugado && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[['goles_local', 'Goles local'], ['goles_visitante', 'Goles visitante']].map(([k, l]) => (
                <div key={k}>
                  <label className="label">{l}</label>
                  <input className="input" type="number" min="0" max={LIMITS.goles} step="1" inputMode="numeric" value={edit.data[k]} onChange={(e) => set(k, e.target.value)} style={{ textAlign: 'center', fontFamily: 'Bebas Neue', fontSize: 24 }} />
                </div>
              ))}
            </div>
          )}
          {error && <div className="alert-error"><Icon name="alert-triangle" /> {error}</div>}
          <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? <><Icon name="loader" spin /> Guardando…</> : 'Guardar'}</button>
          {edit.mode === 'edit' && (
            <button className="btn btn-block" style={{ marginTop: 8, background: 'var(--danger-pale)', color: 'var(--danger)' }}
              onClick={async () => { if (window.confirm('¿Eliminar este partido de la liga?')) { try { await store.deletePartidoLiga(edit.id); setEdit(null) } catch (e) { setError(messageFor(e)) } } }}>
              <span className="with-icon"><Icon name="trash" /> Eliminar partido</span>
            </button>
          )}
        </Sheet>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────────────────────────────────────
function Equipos() {
  const { equipos, store } = useStore()
  const [edit, setEdit] = useState(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const open = (e) => {
    setFile(null)
    setError('')
    setPreview(e?.escudo_url || null)
    setEdit(e ? { mode: 'edit', id: e.id, es_propio: e.es_propio, data: { nombre: e.nombre, nombre_corto: e.nombre_corto || '', sancion_puntos: e.sancion_puntos || 0, escudo_url: e.escudo_url } }
      : { mode: 'add', data: { nombre: '', nombre_corto: '', sancion_puntos: 0, escudo_url: null } })
  }
  const set = (k, v) => setEdit((e) => ({ ...e, data: { ...e.data, [k]: v } }))

  const save = async () => {
    try { validarEquipo({ ...edit.data, escudo_url: null }, { equipos, id: edit.id ?? null }) }
    catch (e) { return setError(messageFor(e)) }
    setSaving(true)
    try {
      let escudo_url = edit.data.escudo_url
      if (file) escudo_url = await store.uploadEscudoEquipo(file)
      const data = { ...edit.data, escudo_url }
      if (edit.mode === 'add') await store.addEquipo(data)
      else await store.updateEquipo(edit.id, data)
      haptics.success?.()
      setEdit(null)
    } catch (e) {
      console.error(e)
      setError(messageFor(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 14, color: 'var(--gris-mid)' }}>{equipos.length} equipos en el grupo</span>
        <button onClick={() => open(null)} className="btn btn-primary btn-sm">+ Añadir equipo</button>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {equipos.map((e, i) => (
          <button key={e.id} onClick={() => open(e)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: e.es_propio ? 'var(--primary-pale)' : 'white', border: 'none', borderBottom: i < equipos.length - 1 ? '1px solid #e8eff8' : 'none', cursor: 'pointer', textAlign: 'left' }}>
            <TeamCrest team={e} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{e.nombre}</div>
              <div style={{ fontSize: 11, color: 'var(--gris-mid)' }}>
                {e.nombre_corto || '—'}{e.sancion_puntos ? ` · −${e.sancion_puntos} pts sanción` : ''}{e.es_propio ? ' · Nuestro equipo' : ''}
              </div>
            </div>
            <span style={{ color: 'var(--gris-light)' }}>›</span>
          </button>
        ))}
      </div>

      {edit && (
        <Sheet title={edit.mode === 'add' ? 'Nuevo equipo' : 'Editar equipo'} onClose={() => setEdit(null)}>
          <div className="form-group">
            <label className="label">Nombre oficial</label>
            <input className="input" value={edit.data.nombre} maxLength={LIMITS.nombreEquipo} onChange={(e) => set('nombre', e.target.value)} disabled={edit.es_propio} autoFocus={edit.mode === 'add'} />
          </div>
          <div className="form-group">
            <label className="label">Nombre corto <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--gris-mid)' }}>(para la tabla en móvil)</span></label>
            <input className="input" value={edit.data.nombre_corto} maxLength={16} onChange={(e) => set('nombre_corto', e.target.value)} placeholder="Ej: Villacañas" />
          </div>
          <div className="form-group">
            <label className="label">Escudo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {preview ? <TeamCrest src={preview} name="" alt="" size={52} /> : <TeamCrest team={{ nombre: edit.data.nombre }} size={52} />}
              <label style={{ flex: 1, background: 'var(--primary-pale)', border: '1.5px solid #b9cbe2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                <Icon name="camera" /> {preview ? 'Cambiar escudo' : 'Subir escudo'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)) } }} />
              </label>
            </div>
          </div>
          <div className="form-group">
            <label className="label">Puntos de sanción <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--gris-mid)' }}>(se restan en la clasificación)</span></label>
            <input className="input" type="number" min="0" max={LIMITS.sancion} step="1" value={edit.data.sancion_puntos} onChange={(e) => set('sancion_puntos', e.target.value)} />
          </div>
          {error && <div className="alert-error"><Icon name="alert-triangle" /> {error}</div>}
          <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? <><Icon name="loader" spin /> Guardando…</> : 'Guardar'}</button>
          {edit.mode === 'edit' && !edit.es_propio && (
            <button className="btn btn-block" style={{ marginTop: 8, background: 'var(--danger-pale)', color: 'var(--danger)' }}
              onClick={async () => { if (window.confirm('¿Eliminar el equipo y todos sus resultados de liga?')) { try { await store.deleteEquipo(edit.id); setEdit(null) } catch (e) { setError(messageFor(e)) } } }}>
              <span className="with-icon"><Icon name="trash" /> Eliminar equipo</span>
            </button>
          )}
        </Sheet>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Zones (promotion / play-off / relegation)
// ─────────────────────────────────────────────────────────────────────────────
function Zonas() {
  const { temporada, equipos, store } = useStore()
  const initial = useMemo(() => ({
    zona_ascenso: temporada?.zona_ascenso ?? 1,
    zona_promocion: temporada?.zona_promocion ?? 0,
    zona_descenso: temporada?.zona_descenso ?? 0,
  }), [temporada])
  const [form, setForm] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  if (!temporada) return <div className="empty">No hay temporada activa.</div>
  const guardar = async () => {
    try {
      validarTemporada(form, { numEquipos: equipos.length })
      await store.updateTemporada(temporada.id, form)
      setSaved(true)
      haptics.success?.()
    } catch (e) {
      haptics.error?.()
      setError(messageFor(e))
    }
  }

  const fields = [
    ['zona_ascenso', 'Plazas de ascenso directo', ZONES.ascenso.color],
    ['zona_promocion', 'Plazas de promoción', ZONES.promocion.color],
    ['zona_descenso', 'Plazas de descenso', ZONES.descenso.color],
  ]
  return (
    <div className="card">
      <p style={{ fontSize: 13, color: 'var(--gris-mid)', marginBottom: 14, lineHeight: 1.5 }}>
        Las plazas cambian cada temporada según las bases de competición de la FFCM. Ajústalas aquí y la tabla pintará las zonas automáticamente.
      </p>
      {fields.map(([k, l, c]) => (
        <div className="form-group" key={k}>
          <label className="label with-icon"><Icon name="circle-filled" size={12} style={{ color: c }} /> {l}</label>
          <input className="input" type="number" min="0" max={Math.min(equipos.length || LIMITS.zonas, LIMITS.zonas)} step="1" value={form[k]} onChange={(e) => { setForm((f) => ({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) })); setSaved(false); setError('') }} />
        </div>
      ))}
      {error && <div className="alert-error"><Icon name="alert-triangle" /> {error}</div>}
      <button className="btn btn-primary btn-block" onClick={guardar}>
        {saved ? <span className="with-icon"><Icon name="check" /> Guardado</span> : 'Guardar zonas'}
      </button>
    </div>
  )
}
