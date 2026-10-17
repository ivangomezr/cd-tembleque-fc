/**
 * Player helpers shared by the squad page and the player page (pure, no I/O).
 */
import { matchResult, ourScore, rivalName } from './match'

export const POSICIONES = ['Portero', 'Defensa', 'Centrocampista', 'Delantero']
export const POS_CLASS = { Portero: 'pos-portero', Defensa: 'pos-defensa', Centrocampista: 'pos-centrocampista', Delantero: 'pos-delantero' }
export const POS_CORTA = { Portero: 'POR', Defensa: 'DEF', Centrocampista: 'MED', Delantero: 'DEL' }

export const ESTADOS = {
  disponible: { icono: null, label: 'Disponible', color: null },
  lesionado: { icono: '✚', label: 'Lesionado', color: '#c0392b' },
  duda: { icono: '❓', label: 'Duda', color: '#a86b00' },
  sancionado: { icono: '🟥', label: 'Sancionado', color: '#c0392b' },
  baja: { icono: '💤', label: 'Baja', color: '#5f6b7a' },
}

/** By shirt number (players without one go last, then by name). */
export const byDorsal = (a, b) =>
  (a.dorsal ?? 1000) - (b.dorsal ?? 1000) || String(a.nombre).localeCompare(String(b.nombre), 'es')

/** "Iván Gómez Ruiz" → { first: 'Iván', last: 'Gómez Ruiz' }; single names go in `last`. */
export function splitName(nombre = '') {
  const parts = String(nombre).trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return { first: '', last: parts[0] || '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export const initials = (n = '?') => String(n).split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'

/**
 * One row per match of the season in which the player was called up or has stats.
 * @returns {Array<{ partido, stat, rol: 'titular'|'suplente'|'sin minutos'|'convocado', resultado, nuestros, rivales, rival, mvp }>}
 */
export function playerMatchLog(jugadorId, partidos = [], stats = []) {
  return partidos
    .filter((p) => p.jugado)
    .map((p) => {
      const stat = stats.find((s) => s.partido_id === p.id && s.jugador_id === jugadorId) || null
      const convocado = (p.convocados || []).map(Number).includes(jugadorId)
      if (!stat && !convocado) return null
      const minutos = stat?.minutos || 0
      const rol = stat?.titular ? 'titular' : minutos > 0 ? 'suplente' : stat ? 'sin minutos' : 'convocado'
      const { nuestros, rivales } = ourScore(p)
      return { partido: p, stat, rol, resultado: matchResult(p), nuestros, rivales, rival: rivalName(p), mvp: p.mvp_jugador_id === jugadorId }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.partido.fecha).localeCompare(String(a.partido.fecha)))
}

/** Position of the player in the squad for a stat (1 = best), or null when he has none. */
export function rankIn(totales, jugadorId, key) {
  const me = totales.find((j) => j.id === jugadorId)
  if (!me || !(me[key] > 0)) return null
  return 1 + totales.filter((j) => j[key] > me[key]).length
}
