/**
 * Feedback háptico — solo funciona en Android con navigator.vibrate
 * En iOS no hace nada (silencioso), no rompe nada
 */
export const haptics = {
  light:   () => navigator.vibrate?.(30),
  medium:  () => navigator.vibrate?.(60),
  success: () => navigator.vibrate?.([40, 30, 40]),
  error:   () => navigator.vibrate?.([80, 40, 80]),
  tap:     () => navigator.vibrate?.(20),
}
