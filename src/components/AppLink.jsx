import { useNavigate } from 'react-router-dom'

/**
 * Real link (<a href>) that navigates inside the app: keyboard and screen-reader
 * friendly, and Ctrl/⌘-click or middle-click still open a new tab.
 */
export default function AppLink({ to, children, onClick, ...rest }) {
  const nav = useNavigate()
  return (
    <a href={to} {...rest} onClick={(e) => {
      onClick?.(e)
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      nav(to)
    }}>{children}</a>
  )
}
