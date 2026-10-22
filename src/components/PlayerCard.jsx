import { ShirtSvg } from './Camiseta'
import { ESTADOS, POS_CORTA, CAPITANIA, splitName } from '../lib/players'
import Icon from './Icon'

/**
 * Squad card: photo (or the club shirt with the number when there is none) on a
 * club-blue background, a dark fade at the bottom so the name and number stay
 * readable, the position and any availability status.
 */
export default function PlayerCard({ jugador: j, href, onOpen, priority = false }) {
  const { first, last } = splitName(j.nombre)
  const estado = ESTADOS[j.estado]
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onOpen?.()
  }
  return (
    <a className="player-card" href={href} onClick={onClick}
      aria-label={`${j.nombre}${j.dorsal != null ? `, dorsal ${j.dorsal}` : ''}, ${j.posicion || 'sin posición'}${CAPITANIA[j.capitania] ? `, ${CAPITANIA[j.capitania].label.toLowerCase()}` : ''}${estado?.icono ? `, ${estado.label.toLowerCase()}` : ''}`}>
      <div className="player-card__media" aria-hidden="true">
        {j.dorsal != null && <span className="player-card__ghost">{j.dorsal}</span>}
        {j.foto_url
          ? <img src={j.foto_url} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" />
          : <span className="player-card__shirt"><ShirtSvg dorsal={j.dorsal ?? ''} size={120} /></span>}
      </div>
      <div className="player-card__shade" aria-hidden="true" />
      <div className="player-card__top" aria-hidden="true">
        {j.posicion && <span className="player-card__pos">{POS_CORTA[j.posicion] || j.posicion}</span>}
        <span className="player-card__badges">
          {CAPITANIA[j.capitania] && <span className={`player-card__cap player-card__cap--${j.capitania}`} title={CAPITANIA[j.capitania].label}><Icon name="captain-filled" size={15} />{j.capitania === 2 && <small>2</small>}</span>}
          {estado?.icono && <span className="player-card__status" style={{ color: estado.color }} title={estado.label}><Icon name={estado.icono} /></span>}
        </span>
      </div>
      <div className="player-card__info" aria-hidden="true">
        <div className="player-card__names">
          {first && <span className="player-card__first">{first}</span>}
          <span className="player-card__last">{last}</span>
        </div>
        {j.dorsal != null && <span className="player-card__num">{j.dorsal}</span>}
      </div>
    </a>
  )
}
