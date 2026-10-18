import { matchResult, matchSides, RESULT_COLORS } from '../lib/match'
import { store } from '../lib/store'
import TeamCrest from './TeamCrest'

const fmt = (str) => new Date(str).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

/**
 * Match row: home name | home crest | score | away crest | away name.
 * A 5-column grid with equal outer columns and a fixed centre keeps both crests
 * at the same distance from the score, whatever the length of the names.
 */
export function ResultCard({ partido: p, onClick, actions = null, showTime = false }) {
  const r = matchResult(p)
  const color = RESULT_COLORS[r] || '#aab4c3'
  const { home, away } = matchSides(p, store.crestFor)
  const nameStyle = (side, align) => ({
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.25,
    color: side.ours ? 'var(--primary)' : 'var(--gris-mid)', textAlign: align, overflowWrap: 'break-word', hyphens: 'auto', minWidth: 0,
  })
  return (
    <div onClick={onClick} className={onClick ? 'pressable' : undefined} style={{
      position: 'relative', background: r ? `${color}0f` : 'white', border: `1px solid ${color}33`, borderLeft: `4px solid ${color}`,
      borderRadius: 14, padding: actions ? '30px 12px 14px' : '14px 12px', cursor: onClick ? 'pointer' : 'default',
    }}>
      {actions && <div style={{ position: 'absolute', top: 6, right: 8, display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>{actions}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 42px 84px 42px minmax(0,1fr)', alignItems: 'center', columnGap: 6 }}>
        <span style={nameStyle(home, 'right')}>{home.name}</span>
        <span style={{ display: 'flex', justifyContent: 'center' }}><TeamCrest src={home.crest} name={home.name} size={40} /></span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--gris-mid)', whiteSpace: 'nowrap' }}>{fmt(p.fecha)}{showTime && p.hora ? ` · ${p.hora}` : ''}</span>
          {p.jugado
            ? <span style={{ fontFamily: 'Bebas Neue', fontSize: 32, lineHeight: 1, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{p.goles_local} - {p.goles_visitante}</span>
            : <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, lineHeight: 1.4, color: '#aab4c3' }}>vs</span>}
          <span style={{ background: 'var(--primary-pale)', color: 'var(--primary)', fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{p.amistoso ? 'Amistoso' : `Jornada ${p.jornada}`}</span>
        </div>
        <span style={{ display: 'flex', justifyContent: 'center' }}><TeamCrest src={away.crest} name={away.name} size={40} /></span>
        <span style={nameStyle(away, 'left')}>{away.name}</span>
      </div>
    </div>
  )
}
