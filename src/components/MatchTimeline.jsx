import { useState } from 'react'
import Sheet from './Sheet'
import { EVENT_TYPES, minuteLabel, withRunningScore, scoreFromEvents, isGoal } from '../lib/timeline'
import { CLUB } from '../config/club'
import { haptics } from '../lib/haptics'

const Card = ({ color, second = false }) => (
  <span style={{ position: 'relative', display: 'inline-block', width: 12, height: 16 }}>
    {second && <span style={{ position: 'absolute', left: -3, top: -2, width: 11, height: 15, background: '#f0c040', borderRadius: 2, border: '1px solid rgba(0,0,0,.1)' }} />}
    <span style={{ position: 'absolute', inset: 0, background: color, borderRadius: 2, boxShadow: '0 1px 2px rgba(0,0,0,.25)' }} />
  </span>
)

function EventIcon({ tipo }) {
  if (tipo === 'amarilla') return <Card color="#f0c040" />
  if (tipo === 'roja') return <Card color="#d63a2f" />
  if (tipo === 'segunda_amarilla') return <Card color="#d63a2f" second />
  if (tipo === 'cambio') return <span style={{ fontSize: 15 }}>🔄</span>
  if (tipo === 'penalti_fallado') return <span style={{ fontSize: 14 }}>❌</span>
  return <span style={{ fontSize: 16 }}>⚽</span>
}

/**
 * Vertical match timeline. Our club is drawn on the same side as in the match header
 * (left when we play at home, right when away).
 */
export default function MatchTimeline({ partido, eventos, jugadores, rival, editable = false, onAdd, onEdit }) {
  const ourSide = partido.local === CLUB.name ? 'left' : 'right'
  const name = (id) => jugadores.find((j) => j.id === id)?.nombre || '—'
  const rows = withRunningScore(eventos)
  const firstHalf = rows.filter((r) => r.event.minuto <= 45)
  const secondHalf = rows.filter((r) => r.event.minuto > 45)
  const htScore = firstHalf.length ? firstHalf[firstHalf.length - 1] : { propio: 0, rival: 0 }
  const ft = scoreFromEvents(eventos)
  const { propio: realPropio, rival: realRival } = (() => {
    const home = partido.local === CLUB.name
    return { propio: home ? partido.goles_local : partido.goles_visitante, rival: home ? partido.goles_visitante : partido.goles_local }
  })()
  const mismatch = eventos.length > 0 && (ft.propio !== realPropio || ft.rival !== realRival)
  const fmtScore = (s) => (ourSide === 'left' ? `${s.propio} - ${s.rival}` : `${s.rival} - ${s.propio}`)

  const describe = (e) => {
    const ours = e.equipo === 'propio'
    switch (e.tipo) {
      case 'gol':
      case 'gol_penalti':
        return {
          main: ours ? name(e.jugador_id) : e.nombre_rival || rival,
          sub: e.tipo === 'gol_penalti' ? 'Penalti' : ours && e.jugador2_id ? `Asist. ${name(e.jugador2_id)}` : null,
        }
      case 'gol_propia':
        return { main: ours ? e.nombre_rival || 'Gol en propia' : name(e.jugador_id), sub: 'En propia puerta' }
      case 'penalti_fallado':
        return { main: ours ? name(e.jugador_id) : e.nombre_rival || rival, sub: 'Penalti fallado' }
      case 'cambio':
        return ours
          ? { main: <span style={{ color: '#1f9d55' }}>↑ {name(e.jugador_id)}</span>, sub: <span style={{ color: '#c0392b' }}>↓ {name(e.jugador2_id)}</span> }
          : { main: e.nombre_rival || 'Cambio', sub: null }
      default:
        return { main: ours ? name(e.jugador_id) : e.nombre_rival || rival, sub: EVENT_TYPES[e.tipo]?.label }
    }
  }

  const Divider = ({ label, score }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#e1e8f2' }} />
      <span style={{ position: 'relative', zIndex: 1, fontSize: 11, fontWeight: 700, color: 'var(--gris-mid)', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#f1f5fb', borderRadius: 20, padding: '3px 12px' }}>
        {label}{score ? ` · ${score}` : ''}
      </span>
      <div style={{ flex: 1, height: 1, background: '#e1e8f2' }} />
    </div>
  )

  const Row = ({ row }) => {
    const e = row.event
    const left = (e.equipo === 'propio') === (ourSide === 'left')
    const d = describe(e)
    const goal = isGoal(e)
    const content = (
      <div style={{ display: 'flex', flexDirection: left ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, textAlign: left ? 'right' : 'left', minWidth: 0 }}>
        <span style={{ flexShrink: 0, display: 'inline-flex' }}><EventIcon tipo={e.tipo} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: goal ? 700 : 600, color: 'var(--navy)', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{d.main}</div>
          {(d.sub || goal) && (
            <div style={{ fontSize: 11, color: 'var(--gris-mid)', lineHeight: 1.3, display: 'flex', gap: 6, alignItems: 'center', justifyContent: left ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
              {goal && <span style={{ fontFamily: 'Bebas Neue', fontSize: 13, color: 'white', background: 'var(--primary)', borderRadius: 5, padding: '0 6px', lineHeight: '17px' }}>{fmtScore(row)}</span>}
              {d.sub && <span style={{ overflowWrap: 'anywhere' }}>{d.sub}</span>}
            </div>
          )}
        </div>
      </div>
    )
    return (
      <div
        onClick={editable ? () => onEdit?.(e) : undefined}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 46px minmax(0,1fr)', alignItems: 'center', padding: '7px 0', cursor: editable ? 'pointer' : 'default' }}
      >
        <div>{left && content}</div>
        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <span style={{
            fontSize: 11, fontWeight: 800, minWidth: 36, textAlign: 'center', padding: '3px 4px', borderRadius: 20,
            background: goal ? 'var(--navy)' : 'white', color: goal ? 'white' : 'var(--navy)',
            border: `1.5px solid ${goal ? 'var(--navy)' : '#d6dfec'}`, zIndex: 1,
          }}>{minuteLabel(e)}</span>
        </div>
        <div>{!left && content}</div>
      </div>
    )
  }

  return (
    <div>
      {mismatch && (
        <div style={{ background: 'var(--accent-pale)', color: '#7a5a00', borderRadius: 10, padding: '8px 12px', fontSize: 12, marginBottom: 10 }}>
          ⚠️ Los goles del timeline ({fmtScore(ft)}) no coinciden con el marcador del partido.
        </div>
      )}
      {eventos.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--gris-mid)', fontSize: 13, padding: '1rem 0' }}>
          {editable ? 'Aún no hay eventos. Añade goles, tarjetas y cambios con su minuto.' : 'Sin eventos registrados'}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, marginLeft: -1, background: '#e6ecf5' }} />
          <Divider label="Inicio" />
          {firstHalf.map((r) => <Row key={r.event.id} row={r} />)}
          <Divider label="Descanso" score={fmtScore(htScore)} />
          {secondHalf.map((r) => <Row key={r.event.id} row={r} />)}
          <Divider label="Final" score={fmtScore(ft)} />
        </div>
      )}
      {editable && (
        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={onAdd}>+ Añadir evento</button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Event editor
// ─────────────────────────────────────────────────────────────────────────────
const TIPOS_ORDEN = ['gol', 'gol_penalti', 'gol_propia', 'penalti_fallado', 'amarilla', 'segunda_amarilla', 'roja', 'cambio']

export function EventEditor({ evento, partido, jugadores, convocados, rival, store, onClose }) {
  const editing = !!evento?.id
  const [form, setForm] = useState(() => ({
    equipo: evento?.equipo || 'propio',
    tipo: evento?.tipo || 'gol',
    minuto: evento?.minuto ?? '',
    minuto_extra: evento?.minuto_extra || '',
    jugador_id: evento?.jugador_id || '',
    jugador2_id: evento?.jugador2_id || '',
    nombre_rival: evento?.nombre_rival || '',
  }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError('') }

  const pool = (convocados.length ? convocados : jugadores).slice().sort((a, b) => (a.dorsal || 99) - (b.dorsal || 99))
  const ours = form.equipo === 'propio'
  // Which inputs each type needs
  const needsPlayer = ours ? form.tipo !== 'gol_propia' : form.tipo === 'gol_propia'
  const needsAssist = ours && ['gol', 'gol_penalti', 'gol_propia'].includes(form.tipo)
  const isSub = ours && form.tipo === 'cambio'
  const needsRivalName = !ours ? form.tipo !== 'gol_propia' : form.tipo === 'gol_propia'

  const playerLabel = isSub ? '↑ Entra' : form.tipo.startsWith('gol') && form.tipo !== 'gol_propia' ? 'Goleador' : form.tipo === 'gol_propia' ? 'Jugador nuestro que marca en propia' : form.tipo === 'penalti_fallado' ? 'Lanzador' : 'Jugador'

  const save = async () => {
    const m = Number(form.minuto)
    if (!m || m < 1 || m > 130) return setError('Indica un minuto válido (1-120).')
    if (needsPlayer && !form.jugador_id) return setError(`Selecciona ${playerLabel.toLowerCase()}.`)
    if (isSub && !form.jugador2_id) return setError('Selecciona quién sale.')
    if (isSub && Number(form.jugador_id) === Number(form.jugador2_id)) return setError('Entra y sale el mismo jugador.')
    setSaving(true)
    const ev = {
      partido_id: partido.id,
      equipo: form.equipo,
      tipo: form.tipo,
      minuto: m,
      minuto_extra: Number(form.minuto_extra) || 0,
      jugador_id: needsPlayer ? form.jugador_id : null,
      jugador2_id: needsAssist || isSub ? form.jugador2_id || null : null,
      nombre_rival: needsRivalName ? form.nombre_rival : null,
    }
    try {
      if (editing) await store.updateEvento(evento.id, partido.id, ev)
      else await store.addEvento(ev)
      haptics.success?.()
      onClose(true)
    } catch (e) {
      console.error(e)
      setError('No se pudo guardar el evento.')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('¿Eliminar este evento?')) return
    await store.deleteEvento(evento.id, partido.id)
    onClose(true)
  }

  const playerSelect = ({ k, label, optional }) => (
    <div className="form-group">
      <label className="label">{label}{optional && <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--gris-mid)' }}> (opcional)</span>}</label>
      <select className="select" value={form[k] || ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">{optional ? '— Ninguno —' : 'Selecciona…'}</option>
        {pool.map((j) => <option key={j.id} value={j.id}>#{j.dorsal} · {j.nombre}</option>)}
      </select>
    </div>
  )

  return (
    <Sheet title={editing ? 'Editar evento' : 'Nuevo evento'} onClose={() => onClose(false)}>
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={ours ? 'active' : ''} onClick={() => set('equipo', 'propio')}>{CLUB.shortName}</button>
        <button className={!ours ? 'active' : ''} onClick={() => set('equipo', 'rival')}>{rival}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
        {TIPOS_ORDEN.map((t) => (
          <button key={t} onClick={() => set('tipo', t)} style={{
            padding: '8px 4px', borderRadius: 10, fontSize: 10.5, fontWeight: 700, lineHeight: 1.2, minHeight: 56,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            border: `1.5px solid ${form.tipo === t ? 'var(--primary)' : '#e1e8f2'}`,
            background: form.tipo === t ? 'var(--primary-pale)' : 'white', color: form.tipo === t ? 'var(--primary)' : 'var(--gris-dark)',
          }}>
            <EventIcon tipo={t} />
            {EVENT_TYPES[t].label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
        <div className="form-group">
          <label className="label">Minuto</label>
          <input className="input" type="number" inputMode="numeric" min="1" max="120" value={form.minuto} onChange={(e) => set('minuto', e.target.value)} placeholder="Ej: 37" />
        </div>
        <div className="form-group">
          <label className="label">Añadido <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--gris-mid)' }}>(45+2 → 2)</span></label>
          <input className="input" type="number" inputMode="numeric" min="0" max="15" value={form.minuto_extra} onChange={(e) => set('minuto_extra', e.target.value)} placeholder="0" />
        </div>
      </div>

      {needsPlayer && playerSelect({ k: 'jugador_id', label: playerLabel })}
      {isSub && playerSelect({ k: 'jugador2_id', label: '↓ Sale' })}
      {needsAssist && playerSelect({ k: 'jugador2_id', label: 'Asistencia', optional: true })}
      {needsRivalName && (
        <div className="form-group">
          <label className="label">Jugador rival <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--gris-mid)' }}>(opcional)</span></label>
          <input className="input" value={form.nombre_rival} onChange={(e) => set('nombre_rival', e.target.value)} placeholder="Nombre o dorsal, ej: Dorsal 9" />
        </div>
      )}

      {ours && form.tipo === 'cambio' && <p style={{ fontSize: 11, color: 'var(--gris-mid)', marginBottom: 12 }}>Los minutos de ambos jugadores se recalculan automáticamente.</p>}
      {error && <div className="alert-error">⚠️ {error}</div>}
      <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? '⏳ Guardando…' : 'Guardar evento'}</button>
      {editing && (
        <button className="btn btn-block" style={{ marginTop: 8, background: 'var(--danger-pale)', color: 'var(--danger)' }} onClick={remove}>🗑️ Eliminar evento</button>
      )}
    </Sheet>
  )
}
