import { teamInitials } from '../lib/match'

/** Team crest with an initials fallback. `team` = { nombre, escudo_url } */
export default function TeamCrest({ team, src, name, size = 28 }) {
  const url = src ?? team?.escudo_url
  const label = name ?? team?.nombre ?? '?'
  if (url) {
    return <img src={url} alt={label} loading="lazy" style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
  }
  return (
    <span
      aria-label={label}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: 'var(--navy-soft)', color: 'var(--on-navy)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Bebas Neue', fontSize: Math.max(10, size * 0.42), lineHeight: 1,
      }}
    >
      {teamInitials(label)}
    </span>
  )
}
