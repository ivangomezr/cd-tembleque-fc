import { useEffect, useState } from 'react'
import Camiseta from './Camiseta'
import Sheet from './Sheet'

/** Football 11 formations: outfield lines from defence to attack. */
export const FORMACIONES = {
  '4-4-2': [4, 4, 2],
  '4-3-3': [4, 3, 3],
  '4-2-3-1': [4, 2, 3, 1],
  '4-1-4-1': [4, 1, 4, 1],
  '4-5-1': [4, 5, 1],
  '3-5-2': [3, 5, 2],
  '3-4-3': [3, 4, 3],
  '5-3-2': [5, 3, 2],
}
export const FORMACION_DEFECTO = '4-4-2'

/** Lines including the goalkeeper as line 0. */
const lineas = (f) => [1, ...(FORMACIONES[f] || FORMACIONES[FORMACION_DEFECTO])]

const lineLabel = (idx, total) =>
  idx === 0 ? 'Portero' : idx === 1 ? 'Defensa' : idx === total - 1 ? 'Delantero' : 'Medio'

export function slotsVacios(formacion) {
  return lineas(formacion).flatMap((n, linea) =>
    Array.from({ length: n }, (_, posicion) => ({ linea, posicion, jugador_id: null })))
}

/** Older lineups (football 7 or other formations) are re-mapped onto the new grid keeping players in order. */
function normalizar(alineacion) {
  const formacion = FORMACIONES[alineacion?.formacion] ? alineacion.formacion : FORMACION_DEFECTO
  const base = slotsVacios(formacion)
  const prev = alineacion?.jugadores || []
  if (prev.length === base.length && prev.every((s) => typeof s?.linea === 'number')) return { formacion, slots: prev }
  const ids = prev.map((s) => (s && typeof s === 'object' ? s.jugador_id : s))
  return { formacion, slots: base.map((s, i) => ({ ...s, jugador_id: ids[i] ?? null })) }
}

function Campo({ slots, jugadores, formacion, onSlotClick, mvpId, badges = {} }) {
  const lines = lineas(formacion)
  const get = (id) => jugadores.find((j) => j.id === id)
  return (
    <div style={{
      background: 'repeating-linear-gradient(180deg, #2f8a4a 0 36px, #2b7f44 36px 72px)',
      borderRadius: 16, padding: '16px 6px', position: 'relative', minHeight: 440,
      border: '3px solid #1f5e32', display: 'flex', flexDirection: 'column-reverse', justifyContent: 'space-around', gap: 6,
      overflow: 'hidden',
    }}>
      {/* pitch markings */}
      <div style={{ position: 'absolute', inset: 8, border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: 4, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 8, left: '26%', right: '26%', height: '13%', border: '1.5px solid rgba(255,255,255,0.35)', borderTop: 'none', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 8, left: '26%', right: '26%', height: '13%', border: '1.5px solid rgba(255,255,255,0.35)', borderBottom: 'none', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '50%', left: 8, right: 8, height: 1.5, background: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', width: 70, height: 70, marginLeft: -35, marginTop: -35, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.35)', pointerEvents: 'none' }} />

      {lines.map((n, linea) => (
        <div key={linea} style={{ display: 'flex', justifyContent: 'space-evenly', alignItems: 'center', zIndex: 1 }}>
          {slots.filter((s) => s.linea === linea).map((slot) => {
            const j = slot.jugador_id ? get(slot.jugador_id) : null
            const click = onSlotClick ? () => onSlotClick(slot) : undefined
            return (
              <div key={slot.posicion} onClick={click} style={{ cursor: click ? 'pointer' : 'default' }}>
                {j ? (
                  <Camiseta nombre={j.nombre} dorsal={j.dorsal} pequeña={n >= 4} destacado={j.id === mvpId} badge={badges[j.id]} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: n >= 4 ? 58 : 68 }}>
                    <div style={{ width: n >= 4 ? 44 : 52, height: n >= 4 ? 40 : 46, border: '2px dashed rgba(255,255,255,0.45)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 20 }}>{onSlotClick ? '+' : '—'}</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>{lineLabel(linea, lines.length)}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function Editor({ inicial, jugadores, elegibles, onSave, onClose }) {
  const [{ formacion, slots }, setState] = useState(() => normalizar(inicial))
  const [slotSel, setSlotSel] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const usados = new Set(slots.map((s) => s.jugador_id).filter(Boolean))
  const cambiarFormacion = (f) => {
    // keep the players already placed, in order
    const ids = slots.map((s) => s.jugador_id)
    setState({ formacion: f, slots: slotsVacios(f).map((s, i) => ({ ...s, jugador_id: ids[i] ?? null })) })
  }
  const asignar = (id) => {
    setState((st) => ({ ...st, slots: st.slots.map((s) => (s === slotSel ? { ...s, jugador_id: id ? Number(id) : null } : s)) }))
    setSlotSel(null)
  }
  const save = async () => {
    setGuardando(true)
    await onSave(formacion, slots)
    setGuardando(false)
    onClose({ formacion, jugadores: slots })
  }
  const pool = (elegibles?.length ? elegibles : jugadores)
  const total = lineas(formacion).length

  return (
    <Sheet title="✏️ Editar alineación" onClose={() => onClose()}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {Object.keys(FORMACIONES).map((f) => (
          <button key={f} className={`chip ${formacion === f ? 'active' : ''}`} onClick={() => cambiarFormacion(f)}>{f}</button>
        ))}
      </div>
      {!elegibles?.length && <p style={{ fontSize: 12, color: 'var(--gris-mid)', marginBottom: 10 }}>💡 Si guardas antes la convocatoria, aquí solo aparecerán los convocados.</p>}
      <Campo slots={slots} jugadores={jugadores} formacion={formacion} onSlotClick={setSlotSel} />
      <div style={{ fontSize: 12, color: 'var(--gris-mid)', margin: '8px 0 12px', textAlign: 'center' }}>{usados.size}/11 titulares · toca una posición para asignar</div>
      <button onClick={save} disabled={guardando} className="btn btn-primary btn-block">{guardando ? 'Guardando…' : 'Guardar alineación'}</button>

      {slotSel && (
        <Sheet title={`Elegir ${lineLabel(slotSel.linea, total).toLowerCase()}`} onClose={() => setSlotSel(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {slotSel.jugador_id && <button className="btn btn-ghost btn-block" onClick={() => asignar(null)}>Vaciar posición</button>}
            {pool.filter((j) => !usados.has(j.id) || j.id === slotSel.jugador_id)
              .sort((a, b) => (a.dorsal || 99) - (b.dorsal || 99))
              .map((j) => (
                <button key={j.id} onClick={() => asignar(j.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${j.id === slotSel.jugador_id ? 'var(--primary)' : '#e1e8f2'}`, background: j.id === slotSel.jugador_id ? 'var(--primary-pale)' : 'white', textAlign: 'left' }}>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, width: 26, color: 'var(--primary)' }}>{j.dorsal}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{j.nombre}</span>
                  <span style={{ fontSize: 11, color: 'var(--gris-mid)' }}>{j.posicion}</span>
                </button>
              ))}
          </div>
        </Sheet>
      )}
    </Sheet>
  )
}

export default function Alineacion({ jugadores, alineacionInicial, onSave, modoEdicion = false, elegibles = [], mvpId = null, badges = {} }) {
  const [abierto, setAbierto] = useState(false)
  const [actual, setActual] = useState(alineacionInicial)
  useEffect(() => { setActual(alineacionInicial) }, [alineacionInicial])
  const { formacion, slots } = normalizar(actual)

  return (
    <div>
      <Campo slots={slots} jugadores={jugadores} formacion={formacion} mvpId={mvpId} badges={badges} />
      {modoEdicion && (
        <button onClick={() => setAbierto(true)} className="btn btn-ghost btn-block" style={{ marginTop: 10 }}>✏️ Editar alineación</button>
      )}
      {abierto && (
        <Editor
          inicial={actual}
          jugadores={jugadores}
          elegibles={elegibles}
          onSave={onSave}
          onClose={(nuevo) => { if (nuevo) setActual(nuevo); setAbierto(false) }}
        />
      )}
    </div>
  )
}
