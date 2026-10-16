/** Club shirt (blue & white stripes) with the player's number and name. */
export default function Camiseta({ nombre, dorsal, pequeña = false, destacado = false, badge = null }) {
  const size = pequeña ? 50 : 60
  const id = `stripes-${pequeña ? 's' : 'l'}`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: size + 8 }}>
      <div style={{ position: 'relative', width: size, height: size * 0.85 }}>
        <svg viewBox="0 0 100 85" width={size} height={size * 0.85} xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <defs>
            <pattern id={id} width="16" height="85" patternUnits="userSpaceOnUse">
              <rect width="16" height="85" fill="#ffffff" />
              <rect width="8" height="85" fill="#295A98" />
            </pattern>
          </defs>
          <path d="M25 10 L8 30 L22 38 L25 34 L25 82 L75 82 L75 34 L78 38 L92 30 L75 10 L64 14 Q50 24 36 14 Z"
            fill={`url(#${id})`} stroke={destacado ? '#f0c040' : '#01153A'} strokeWidth={destacado ? 4 : 2.5} strokeLinejoin="round" />
          <path d="M36 14 Q50 24 64 14" fill="none" stroke="#01153A" strokeWidth="3" />
          <text x="50" y="62" textAnchor="middle" fill="#01153A" stroke="#ffffff" strokeWidth="3" paintOrder="stroke"
            fontSize="30" fontFamily="'Bebas Neue', sans-serif">{dorsal ?? '?'}</text>
        </svg>
        {badge && (
          <span style={{ position: 'absolute', top: -4, right: -6, background: 'white', borderRadius: 10, padding: '0 4px', fontSize: 10, lineHeight: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.3)', whiteSpace: 'nowrap' }}>{badge}</span>
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
