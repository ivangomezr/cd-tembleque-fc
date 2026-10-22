import { useState } from 'react'
import Sheet from './Sheet'
import { messageFor, UserFacingError } from '../lib/dbErrors'
import { LIMITS } from '../lib/validation'
import { ESTADOS, POSICIONES, initials } from '../lib/players'
import Icon from './Icon'

/** Admin form to edit a player (name, number, position, photo, availability). */
export default function PlayerEditSheet({ jugador, store, onClose }) {
  const [form, setForm] = useState({
    nombre: jugador.nombre, posicion: jugador.posicion, dorsal: jugador.dorsal ?? '', foto_url: jugador.foto_url || '',
    estado: jugador.estado || 'disponible', estado_desc: jugador.estado_desc || '',
  })
  const [fotoArchivo, setFotoArchivo] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(jugador.foto_url || null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError('') }

  const save = async () => {
    setSaving(true)
    try {
      let foto_url = form.foto_url || null
      if (fotoArchivo) {
        foto_url = await store.subirFotoJugador(jugador.id, fotoArchivo)
        if (!foto_url) throw new UserFacingError('No se pudo subir la foto. Inténtalo de nuevo.')
      }
      // The store validates (validation.js) and the database checks again
      await store.updateJugador(jugador.id, { ...form, foto_url })
      onClose(true)
    } catch (e) {
      console.error('[jugadores] update failed', e)
      setError(messageFor(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet title="Editar jugador" onClose={() => onClose(false)}>
      <div className="form-group">
        <label className="label" htmlFor="pe-nombre">Nombre</label>
        <input id="pe-nombre" className="input" value={form.nombre} maxLength={LIMITS.nombreJugador} onChange={(e) => set('nombre', e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="form-group">
          <label className="label" htmlFor="pe-pos">Posición</label>
          <select id="pe-pos" className="select" value={form.posicion} onChange={(e) => set('posicion', e.target.value)}>
            {POSICIONES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label" htmlFor="pe-dorsal">Dorsal</label>
          <input id="pe-dorsal" className="input" type="number" inputMode="numeric" min="1" max="99" value={form.dorsal} onChange={(e) => set('dorsal', e.target.value)} placeholder="1-99" />
        </div>
      </div>
      <div className="form-group">
        <span className="label">Foto</span>
        <p style={{ fontSize: 11, color: 'var(--home-muted)', margin: '-2px 0 8px' }}>Mejor en vertical, de cintura para arriba y con fondo liso.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 60, height: 80, borderRadius: 10, overflow: 'hidden', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {fotoPreview
              ? <img src={fotoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
              : <span style={{ color: '#cfe0f5', fontWeight: 700 }}>{initials(form.nombre)}</span>}
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', background: 'white', border: '1.5px solid #b9cbe2', borderRadius: 10, padding: '10px 14px', fontSize: 13, cursor: 'pointer', textAlign: 'center', color: 'var(--primary-mid)', fontWeight: 600 }}>
              <Icon name="camera" /> {fotoPreview ? 'Cambiar foto' : 'Subir foto'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setFotoArchivo(file)
                setFotoPreview(URL.createObjectURL(file))
              }} />
            </label>
            {fotoPreview && (
              <button type="button" onClick={() => { setFotoArchivo(null); setFotoPreview(null); set('foto_url', '') }}
                style={{ width: '100%', marginTop: 6, background: 'none', border: 'none', fontSize: 12, color: '#c0392b', cursor: 'pointer', minHeight: 32 }}>
                Quitar foto
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="form-group">
        <label className="label" htmlFor="pe-estado">Estado</label>
        <select id="pe-estado" className="select" value={form.estado} onChange={(e) => set('estado', e.target.value)}>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {form.estado !== 'disponible' && (
        <div className="form-group">
          <label className="label" htmlFor="pe-desc">Detalle <span style={{ fontWeight: 400, fontSize: 11 }}>(solo lo ven los miembros del club)</span></label>
          <input id="pe-desc" className="input" value={form.estado_desc} maxLength={LIMITS.estadoDesc} onChange={(e) => set('estado_desc', e.target.value)}
            placeholder={form.estado === 'lesionado' ? 'Ej: esguince de tobillo' : 'Describe el motivo'} />
        </div>
      )}
      {error && <div className="alert-error"><Icon name="alert-triangle" /> {error}</div>}
      <button onClick={save} disabled={saving} className="btn btn-primary btn-block">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
    </Sheet>
  )
}
