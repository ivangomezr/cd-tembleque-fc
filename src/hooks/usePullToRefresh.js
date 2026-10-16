import { useState, useEffect, useRef } from 'react'
import { haptics } from '../lib/haptics'

/**
 * usePullToRefresh — detecta el gesto de tirar hacia abajo y llama a onRefresh
 * Uso: const { pullProps, isRefreshing, pullDistance } = usePullToRefresh(onRefresh)
 * Aplica {...pullProps} al contenedor que quieres que sea "pulleable"
 */
export function usePullToRefresh(onRefresh, { threshold = 80 } = {}) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef(null)
  const pulling = useRef(false)

  useEffect(() => {
    const onTouchStart = (e) => {
      // Solo activar si estamos en el top de la página
      if (window.scrollY > 0) return
      startY.current = e.touches[0].clientY
      pulling.current = true
    }

    const onTouchMove = (e) => {
      if (!pulling.current || startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy < 0) { setPullDistance(0); return }
      // Resistencia progresiva — cuanto más tiras, menos avanza
      const resistance = Math.min(dy * 0.5, threshold + 20)
      setPullDistance(resistance)
      if (resistance >= threshold && !isRefreshing) {
        haptics.light()
      }
    }

    const onTouchEnd = async () => {
      if (!pulling.current) return
      pulling.current = false

      if (pullDistance >= threshold && !isRefreshing) {
        haptics.medium()
        setIsRefreshing(true)
        setPullDistance(0)
        try { await onRefresh() } catch { }
        setIsRefreshing(false)
      } else {
        setPullDistance(0)
      }
      startY.current = null
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [pullDistance, isRefreshing, onRefresh, threshold])

  return { isRefreshing, pullDistance }
}
