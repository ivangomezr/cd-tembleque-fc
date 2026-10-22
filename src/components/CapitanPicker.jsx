import { CAPITANIA, candidatosCapitan } from '../lib/players'
import Icon from './Icon'

/**
 * "Captain of the match" select: any player of the starting XI, the squad
 * captains first (the first option is the natural choice).
 */
export default function CapitanPicker({ id = 'capitan-sel', titularesIds = [], jugadores = [], value, onChange, disabled = false }) {
  const opciones = candidatosCapitan(titularesIds, jugadores)
  return (
    <div className="form-group">
      <label className="label with-icon" htmlFor={id}><Icon name="captain" /> Capitán del partido <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--gris-mid)' }}>(lleva el brazalete)</span></label>
      {!opciones.length ? (
        <p style={{ fontSize: 12, color: 'var(--gris-mid)' }}>Guarda primero la alineación: el capitán se elige entre los titulares.</p>
      ) : (
        <select id={id} className="select" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Sin capitán</option>
          {opciones.map((j) => (
            <option key={j.id} value={j.id}>
              {j.dorsal != null ? `#${j.dorsal} — ` : ''}{j.nombre}{CAPITANIA[j.capitania] ? ` · ${CAPITANIA[j.capitania].corto}` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
