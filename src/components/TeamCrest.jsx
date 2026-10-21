import { useCallback, useState } from 'react'
import { teamInitials } from '../lib/match'
import { CLUB } from '../config/club'

/**
 * Team crest with an initials fallback. `team` = { nombre, escudo_url }
 *
 * The crest keeps a square footprint (size × size) but the <img> box itself has
 * the image's real proportions. With a square <img> + object-fit: contain the
 * page looks right, but the browser's drag preview (and anything else that
 * ignores object-fit) stretches the bitmap to the square box.
 */
export default function TeamCrest({ team, src, name, size = 28, alt, imgStyle, ...rest }) {
  const url = src ?? team?.escudo_url
  const label = name ?? team?.nombre ?? '?'
  // Width / height of the image. Our own crest is known up front; others are read when they load.
  const [ratio, setRatio] = useState(() => (url === CLUB.crest ? CLUB.crestRatio : null))
  const medir = useCallback((img) => {
    if (img?.complete && img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight)
  }, [])

  if (url) {
    const box = ratio ? (ratio >= 1 ? { width: size, height: size / ratio } : { width: size * ratio, height: size }) : { width: size, height: size }
    return (
      <span style={{ width: size, height: size, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={url} alt={alt ?? label} loading="lazy" ref={medir} onLoad={(e) => medir(e.currentTarget)}
          style={{ ...box, objectFit: 'contain', display: 'block', ...imgStyle }} {...rest} />
      </span>
    )
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
