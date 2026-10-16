/**
 * Small, consistent icons for match events (timeline, pitch shirts, substitutes).
 *   GoalIcon variant: 'normal' | 'penalty' (navy "P" tag) | 'own' (red ball, "PP" tag)
 */

export function GoalIcon({ variant = 'normal', size = 16 }) {
  const own = variant === 'own'
  const tag = variant === 'penalty' ? 'P' : own ? 'PP' : null
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size + 2, height: size + 2, flexShrink: 0 }}
      title={variant === 'penalty' ? 'Gol de penalti' : own ? 'Gol en propia puerta' : 'Gol'}>
      <span style={{
        fontSize: size, lineHeight: 1, borderRadius: '50%',
        ...(own ? { background: '#d63a2f', boxShadow: '0 0 0 2px #d63a2f', filter: 'saturate(0.6)' } : {}),
      }}>⚽</span>
      {tag && (
        <span style={{
          position: 'absolute', right: -size * 0.45, bottom: -size * 0.25,
          background: own ? '#d63a2f' : 'var(--navy)', color: 'white', borderRadius: 4,
          fontSize: Math.max(7, size * 0.45), fontWeight: 800, lineHeight: 1, padding: '1px 2px', fontFamily: 'DM Sans, sans-serif',
        }}>{tag}</span>
      )}
    </span>
  )
}

export function CardIcon({ color = 'yellow', second = false, size = 14 }) {
  const fill = color === 'red' ? '#d63a2f' : '#f0c040'
  const w = Math.round(size * 0.75)
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: w, height: size, flexShrink: 0 }}
      title={second ? 'Segunda amarilla' : color === 'red' ? 'Tarjeta roja' : 'Tarjeta amarilla'}>
      {second && <span style={{ position: 'absolute', left: -3, top: -2, width: w - 1, height: size - 1, background: '#f0c040', borderRadius: 2, border: '1px solid rgba(0,0,0,.1)' }} />}
      <span style={{ position: 'absolute', inset: 0, background: fill, borderRadius: 2, boxShadow: '0 1px 2px rgba(0,0,0,.25)' }} />
    </span>
  )
}

/**
 * Compact cluster of a player's events: goals (penalties tagged), own goals in red, cards.
 * `info` = { goles, penaltis, propia, amarillas, roja, segunda } (see eventsByPlayer)
 */
export function PlayerBadges({ info, size = 11 }) {
  if (!info) return null
  const items = []
  const normales = Math.max(0, (info.goles || 0) - (info.penaltis || 0))
  for (let i = 0; i < Math.min(normales, 3); i++) items.push(<GoalIcon key={`g${i}`} size={size} />)
  for (let i = 0; i < Math.min(info.penaltis || 0, 2); i++) items.push(<GoalIcon key={`p${i}`} variant="penalty" size={size} />)
  for (let i = 0; i < Math.min(info.propia || 0, 2); i++) items.push(<GoalIcon key={`o${i}`} variant="own" size={size} />)
  if (info.segunda) items.push(<CardIcon key="sy" color="red" second size={size + 1} />)
  else if (info.roja) items.push(<CardIcon key="r" color="red" size={size + 1} />)
  else if (info.amarillas) items.push(<CardIcon key="y" size={size + 1} />)
  if (!items.length) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.45, background: 'white', borderRadius: 10, padding: '2px 5px', boxShadow: '0 1px 4px rgba(0,0,0,.3)', whiteSpace: 'nowrap', lineHeight: 1 }}>
      {items}
    </span>
  )
}

/** Has the player anything worth a badge? */
export const hasBadges = (info) => !!info && !!(info.goles || info.propia || info.amarillas || info.roja || info.segunda)
