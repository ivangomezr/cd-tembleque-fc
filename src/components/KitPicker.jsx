import { KITS } from '../config/club'
import { ShirtSvg } from './Camiseta'

/** Lets the admin choose which kit was worn in a match. */
export default function KitPicker({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Object.keys(KITS).length}, 1fr)`, gap: 10 }}>
      {Object.entries(KITS).map(([key, k]) => {
        const active = value === key
        return (
          <button key={key} type="button" onClick={() => onChange(key)} aria-pressed={active} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', borderRadius: 12,
            border: `2px solid ${active ? 'var(--primary)' : '#e1e8f2'}`, background: active ? 'var(--primary-pale)' : 'white',
          }}>
            <ShirtSvg kit={key} dorsal="10" size={48} />
            <span style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--primary)' : 'var(--gris-dark)' }}>{k.label}</span>
            <span style={{ fontSize: 11, color: 'var(--gris-mid)' }}>{k.description}</span>
          </button>
        )
      })}
    </div>
  )
}
