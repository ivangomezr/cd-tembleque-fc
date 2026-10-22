import { ICONS, FILLED } from '../lib/icons'

/**
 * SVG icon from the app's icon set (Tabler Icons, src/lib/icons.js).
 * Same look on iOS, Android and Windows, unlike emoji. Inherits the text colour
 * and, by default, the font size.
 *
 *   <Icon name="ball" />                       decorative (hidden from screen readers)
 *   <Icon name="trash" title="Eliminar" />     meaningful on its own (announced)
 */
export default function Icon({ name, size = '1.15em', title, className = '', style, strokeWidth = 2, spin = false, ...rest }) {
  const paths = ICONS[name]
  if (!paths) {
    if (import.meta.env?.DEV) console.warn(`[Icon] unknown icon "${name}"`)
    return null
  }
  const filled = FILLED.has(name)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={`icon${spin ? ' icon--spin' : ''}${className ? ` ${className}` : ''}`}
      style={style} focusable="false"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
      {...rest}
    >
      {title && <title>{title}</title>}
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}
