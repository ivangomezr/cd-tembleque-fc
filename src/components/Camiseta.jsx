import { useId } from 'react'
import { KITS, GK_KITS, DEFAULT_KIT } from '../config/club'

/** Shirt silhouette shared by the body fill and the pattern clip. */
const BODY = 'M25 10 L8 30 L22 38 L25 34 L25 82 L75 82 L75 34 L78 38 L92 30 L75 10 L64 14 Q50 24 36 14 Z'

/** Small SVG shirt only (no name), used in the lineup and in the kit picker. `portero`: goalkeeper version of the kit. */
export function ShirtSvg({ kit = DEFAULT_KIT, dorsal = '', size = 60, highlight = false, portero = false }) {
  const k = (portero ? GK_KITS[kit] || GK_KITS[DEFAULT_KIT] : KITS[kit]) || KITS[DEFAULT_KIT]
  const uid = useId().replace(/:/g, '')
  const grad = `g-${uid}`
  const clip = `c-${uid}`
  const horizontal = k.bodyDirection === 'horizontal'
  const stops = k.body.map((c, i) => <stop key={i} offset={`${(i / (k.body.length - 1)) * 100}%`} stopColor={c} />)

  return (
    <svg viewBox="0 0 100 85" width={size} height={size * 0.85} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2={horizontal ? '1' : '0'} y2={horizontal ? '0' : '1'}>{stops}</linearGradient>
        <clipPath id={clip}><path d={BODY} /></clipPath>
      </defs>
      <path d={BODY} fill={`url(#${grad})`} />
      {k.pattern === 'slashes' && (
        <g clipPath={`url(#${clip})`} stroke={k.trim} strokeLinecap="round" fill="none" opacity="0.9">
          <path d="M52 84 L80 52" strokeWidth="2.2" />
          <path d="M60 86 L84 58" strokeWidth="1.4" />
          <path d="M66 88 L88 62" strokeWidth="2.6" />
          <path d="M45 86 L70 60" strokeWidth="1" />
          <path d="M72 90 L92 68" strokeWidth="1.2" />
        </g>
      )}
      {/* sleeve cuffs */}
      <path d="M8 30 L22 38" stroke={k.trim} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M92 30 L78 38" stroke={k.trim} strokeWidth="3.5" strokeLinecap="round" />
      {/* collar */}
      <path d="M36 14 Q50 24 64 14" fill="none" stroke={k.trim} strokeWidth="3.5" />
      {/* outline */}
      <path d={BODY} fill="none" stroke={highlight ? '#f0c040' : 'rgba(1,21,58,0.55)'} strokeWidth={highlight ? 4 : 1.5} strokeLinejoin="round" />
      {dorsal !== '' && (
        <text x="50" y="63" textAnchor="middle" fill={k.number} stroke={k.numberStroke} strokeWidth="1.2" paintOrder="stroke"
          fontSize="30" fontFamily="'Bebas Neue', sans-serif">{dorsal ?? '?'}</text>
      )}
    </svg>
  )
}

/** Shirt with the player's number and name, as drawn on the pitch. */
export default function Camiseta({ nombre, dorsal, pequeña = false, destacado = false, badge = null, kit = DEFAULT_KIT, portero = false }) {
  const size = pequeña ? 50 : 60
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: size + 8 }}>
      <div style={{ position: 'relative', width: size, height: size * 0.85 }}>
        <ShirtSvg kit={kit} dorsal={dorsal ?? '?'} size={size} highlight={destacado} portero={portero} />
        {badge && (
          <span style={{ position: 'absolute', top: -6, right: -10, zIndex: 2 }}>{badge}</span>
        )}
      </div>
      <div style={{
        fontSize: pequeña ? 9 : 10, fontWeight: 700, color: 'white', textAlign: 'center', maxWidth: size + 8,
        textShadow: '0 1px 3px rgba(0,0,0,0.8)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {nombre ? nombre.split(' ')[0].toUpperCase() : '—'}
      </div>
    </div>
  )
}
