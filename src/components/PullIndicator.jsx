import { usePullToRefresh } from '../hooks/usePullToRefresh'
import Icon from './Icon'

export function PullIndicator({ onRefresh }) {
  const { isRefreshing, pullDistance } = usePullToRefresh(onRefresh)

  const visible = isRefreshing || pullDistance > 10
  const progress = Math.min(pullDistance / 80, 1)

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', top: 58, left: 0, right: 0,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 500, pointerEvents: 'none',
      transform: `translateY(${isRefreshing ? 0 : pullDistance * 0.4}px)`,
      transition: isRefreshing ? 'none' : 'transform 0.1s',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--navy)',
        border: '2px solid var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        opacity: Math.max(0.3, progress),
        transform: `scale(${0.6 + progress * 0.4})`,
        transition: isRefreshing ? 'none' : 'transform 0.1s, opacity 0.1s',
      }}>
        {isRefreshing ? (
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: 'var(--primary)',
            animation: 'spin 0.7s linear infinite',
          }} />
        ) : (
          <div style={{
            fontSize: 14,
            transform: `rotate(${progress * 180}deg)`,
            transition: 'transform 0.1s',
            color: 'var(--primary)', display: 'flex',
          }}><Icon name="arrow-down" size={16} /></div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
