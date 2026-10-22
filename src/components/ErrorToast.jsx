import { useEffect, useState } from 'react'
import { messageFor } from '../lib/dbErrors'
import Icon from './Icon'

/**
 * Shows any unhandled async error (e.g. a failed Supabase write) instead of
 * failing silently. Disappears after a few seconds or on tap.
 */
export default function ErrorToast() {
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    let t
    const onError = (e) => {
      const reason = e.reason ?? e.error
      // Only messages written for users are shown; anything else stays in the console
      const text = messageFor(reason)
      console.error('[unhandled]', reason)
      setMsg(text)
      clearTimeout(t)
      t = setTimeout(() => setMsg(null), 8000)
    }
    window.addEventListener('unhandledrejection', onError)
    return () => { window.removeEventListener('unhandledrejection', onError); clearTimeout(t) }
  }, [])

  if (!msg) return null
  return (
    <div role="alert" onClick={() => setMsg(null)} style={{
      position: 'fixed', left: 12, right: 12, bottom: 'calc(72px + env(safe-area-inset-bottom))', zIndex: 2000,
      maxWidth: 656, margin: '0 auto', background: 'var(--danger)', color: 'white', borderRadius: 12,
      padding: '10px 14px', fontSize: 13, boxShadow: '0 6px 24px rgba(0,0,0,.25)', cursor: 'pointer',
    }}>
      <Icon name="alert-triangle" style={{ marginRight: 6 }} />{msg}
    </div>
  )
}
