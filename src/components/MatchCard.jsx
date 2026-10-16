import { matchResult, matchSides, RESULT_COLORS } from '../lib/match'
import { store } from '../lib/store'
import TeamCrest from './TeamCrest'

const fmt = (str) => new Date(str).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

/** Played-match row: home crest | score | away crest, coloured by our result. */
export function ResultCard({ partido: p, onClick }) {
  const r = matchResult(p)
  const color = RESULT_COLORS[r] || '#aaa'
  const { home, away } = matchSides(p, store.crestFor)
  const Side = ({ side, align }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: align === 'right' ? 'flex-end' : 'flex-start', flexDirection: align === 'right' ? 'row' : 'row-reverse', minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: side.ours ? 'var(--primary)' : 'var(--gris-mid)', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: align, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{side.name}</span>
      <TeamCrest src={side.crest} name={side.name} size={46} />
    </div>
  )
  return (
    <div onClick={onClick} className="pressable" style={{
      background: `${color}0f`, border: `1px solid ${color}33`, borderLeft: `4px solid ${color}`,
      borderRadius: 14, padding: '14px 12px', cursor: 'pointer',
      display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 8,
    }}>
      <Side side={home} align="right" />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 84 }}>
        <span style={{ fontSize: 10, color: 'var(--gris-mid)', whiteSpace: 'nowrap' }}>{fmt(p.fecha)}</span>
        <span style={{ fontFamily: 'Bebas Neue', fontSize: 36, lineHeight: 1, color: 'var(--navy)' }}>{p.goles_local} - {p.goles_visitante}</span>
        <span style={{ background: 'var(--primary-pale)', color: 'var(--primary)', fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{p.amistoso ? 'Amistoso' : `Jornada ${p.jornada}`}</span>
      </div>
      <Side side={away} align="left" />
    </div>
  )
}

/** Upcoming-match tile for horizontal carousels. */
export function UpcomingCard({ partido: p, highlight = false, onClick }) {
  const { home, away } = matchSides(p, store.crestFor)
  const rival = home.ours ? away : home
  return (
    <div onClick={onClick} className={highlight ? 'hero-navy' : ''} style={{
      background: highlight ? undefined : 'white', borderRadius: 16, padding: '14px 16px', flexShrink: 0, minWidth: 200,
      border: `1.5px solid ${highlight ? 'var(--primary)' : '#e6edf6'}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <span style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 8px', borderRadius: 20, background: highlight ? 'rgba(255,255,255,0.12)' : 'var(--primary-pale)', color: highlight ? 'var(--on-navy)' : 'var(--primary-mid)' }}>
        {p.amistoso ? 'Amistoso' : `Jornada ${p.jornada}`} · {home.ours ? 'Casa' : 'Fuera'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TeamCrest src={home.crest} name={home.name} size={32} />
        <span style={{ fontFamily: 'Bebas Neue', fontSize: 14, color: highlight ? 'var(--on-navy-muted)' : '#bbb' }}>vs</span>
        <TeamCrest src={away.crest} name={away.name} size={32} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: highlight ? 'white' : 'var(--navy)', lineHeight: 1.2 }}>{rival.name}</div>
      <div style={{ fontSize: 11, color: highlight ? 'var(--on-navy)' : 'var(--gris-mid)' }}>{fmt(p.fecha)}{p.hora ? ` · ${p.hora}` : ''}</div>
      <div style={{ fontSize: 11, color: highlight ? 'var(--on-navy-muted)' : 'var(--gris-light)' }}>📍 {p.campo}</div>
    </div>
  )
}
