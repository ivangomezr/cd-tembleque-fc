import { createPortal } from 'react-dom'
import Icon from './Icon'

/**
 * Bottom sheet modal used across the app. Rendered in a portal so it always sits
 * above the fixed header / bottom navigation, whatever the page's stacking context.
 */
export default function Sheet({ title, onClose, children }) {
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2>{title}</h2>
          <button onClick={onClose} className="sheet-close" aria-label="Cerrar"><Icon name="x" size={22} /></button>
        </div>
        {children}
      </div>
    </>,
    document.body
  )
}
