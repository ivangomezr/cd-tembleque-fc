import { initials } from '../lib/players'

/**
 * Round player photo used across the app (lists, rankings, menu…).
 *
 * Player photos are cut-outs on a transparent background, wearing the blue kit.
 * On a blue circle they disappeared, and the whole body shrank to a dot. Here:
 *   - a light "studio" backdrop (same as the squad cards) gives contrast to the
 *     blue shirt and dark hair;
 *   - the photo is zoomed on the head and shoulders;
 *   - a white ring plus a soft shadow separates it from any background.
 * Without a photo it shows the initials on club navy.
 */
export default function PlayerAvatar({ jugador, size = 32, ring = true, className = '' }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }
  return (
    <span className={`p-avatar${ring ? ' p-avatar--ring' : ''}${jugador?.foto_url ? '' : ' p-avatar--empty'} ${className}`} style={style} aria-hidden="true">
      {jugador?.foto_url
        ? <img src={jugador.foto_url} alt="" loading="lazy" decoding="async" />
        : initials(jugador?.nombre)}
    </span>
  )
}
