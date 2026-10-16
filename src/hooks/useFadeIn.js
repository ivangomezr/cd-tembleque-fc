/**
 * useFadeIn — devuelve props para aplicar animación de entrada a un elemento.
 * Uso: <div {...fadeIn(0)}>  (el número es el índice para el delay escalonado)
 */
export function useFadeIn() {
  const fadeIn = (index = 0, type = 'up') => ({
    className: `anim-fade-${type === 'up' ? 'up' : type === 'scale' ? 'scale' : 'fade'} ${index > 0 ? `anim-delay-${Math.min(index, 8)}` : ''}`.trim(),
    style: { animationFillMode: 'both' }
  })
  return { fadeIn }
}
