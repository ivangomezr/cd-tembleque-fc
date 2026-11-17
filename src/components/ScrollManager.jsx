import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/** Scroll position of each history entry (by location key), for the back button. */
const positions = new Map()

/** How long to keep trying to restore a position while the page is still loading. */
const RESTORE_MS = 1000

/**
 * Window scroll on route changes. The app is a SPA, so without this the new page
 * keeps the scroll of the previous one and opens half-way down.
 *   · New page (link, tab, navigate): starts at the top.
 *   · Back / forward: returns to where that page was left.
 *   · Same page with a different query (e.g. Admin ?tab=): keeps the scroll.
 * Pages can still scroll on their own after mounting (Partidos brings the next match into view).
 */
export default function ScrollManager() {
  const { key, pathname } = useLocation()
  const navType = useNavigationType()
  const prevPath = useRef(pathname)

  // The router decides the scroll, not the browser
  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return
    const before = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => { window.history.scrollRestoration = before }
  }, [])

  // Remember where the current entry is. One listener reading a ref: scroll events
  // fire a frame late, so after a route change they must count for the new entry.
  const currentKey = useRef(key)
  useEffect(() => {
    const save = () => positions.set(currentKey.current, window.scrollY)
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [])

  // Layout effect: runs before the pages' own effects, so their scrolling wins
  useLayoutEffect(() => {
    currentKey.current = key
    const samePage = prevPath.current === pathname
    prevPath.current = pathname
    if (samePage && navType !== 'POP') return

    const target = navType === 'POP' ? positions.get(key) : undefined
    if (!target) {
      window.scrollTo(0, 0)
      return
    }
    // Back/forward: the page may still be loading (or re-render shorter for a moment), so keep
    // the position for a short while. Stops as soon as the user touches the screen or the wheel.
    let frame
    let stopped = false
    const start = performance.now()
    const stop = () => { stopped = true; cancelAnimationFrame(frame) }
    const restore = () => {
      if (stopped) return
      if (Math.abs(window.scrollY - target) >= 2) window.scrollTo(0, target)
      if (performance.now() - start < RESTORE_MS) frame = requestAnimationFrame(restore)
    }
    window.addEventListener('touchstart', stop, { passive: true, once: true })
    window.addEventListener('wheel', stop, { passive: true, once: true })
    restore()
    return () => {
      stop()
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('wheel', stop)
    }
  }, [key, pathname, navType])

  return null
}
