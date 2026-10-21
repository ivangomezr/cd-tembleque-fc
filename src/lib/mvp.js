/**
 * MVP voting rules (pure). The database applies the same ones
 * (migration 20261020000000_mvp_votacion_abierta.sql); the server's answer wins.
 */

const ZONA = 'Europe/Madrid'

/** Offset (ms) of a time zone at a given instant. */
function offsetMs(instant, timeZone = ZONA) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))
  const g = (t) => Number(parts.find((p) => p.type === t).value)
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - instant
}

/** Voting closes at 23:59:59 (Spain) of the day after the match. */
export function mvpCierre(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return null
  const [y, m, d] = fecha.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d + 1, 23, 59, 59)
  // two passes so the result is right across daylight-saving changes
  let t = wall - offsetMs(wall)
  t = wall - offsetMs(t)
  return new Date(t)
}

/** Open from the moment the match is marked as played until the closing time. */
export const votacionAbierta = (p, now = new Date()) => !!p?.jugado && !!mvpCierre(p.fecha) && now <= mvpCierre(p.fecha)

/**
 * Who can be voted, in the order shown to voters: players with goals or assists
 * first (more goals, then more assists), then by minutes played.
 * Only the candidates chosen by a superadmin (partido.mvp_finalistas); for older
 * matches without them, the call-up, or players with minutes when there's none.
 */
export function candidatosMvp(partido, jugadores = [], stats = []) {
  if (!partido) return []
  const s = (id) => stats.find((x) => x.partido_id === partido.id && x.jugador_id === id) || {}
  const finalistas = (partido.mvp_finalistas || []).map(Number)
  const conv = (partido.convocados || []).map(Number)
  const ids = finalistas.length ? finalistas
    : conv.length ? conv : stats.filter((x) => x.partido_id === partido.id && x.minutos > 0).map((x) => x.jugador_id)
  return jugadores
    .filter((j) => ids.includes(j.id))
    .map((j) => ({ ...j, goles: s(j.id).goles || 0, asistencias: s(j.id).asistencias || 0, minutos: s(j.id).minutos || 0 }))
    .sort((a, b) =>
      Number(b.goles + b.asistencias > 0) - Number(a.goles + a.asistencias > 0) ||
      b.goles - a.goles || b.asistencias - a.asistencias || b.minutos - a.minutos ||
      (a.dorsal ?? 1000) - (b.dorsal ?? 1000) || a.id - b.id)
}

/** Most voted; ties go to whoever comes first in the voting order. */
export function ganadorMvp(ranking = [], candidatos = []) {
  if (!ranking.length) return null
  const orden = (id) => { const i = candidatos.findIndex((c) => c.id === id); return i < 0 ? 1e9 : i }
  return [...ranking].sort((a, b) => b.votos - a.votos || orden(a.jugador_id) - orden(b.jugador_id) || a.jugador_id - b.jugador_id)[0].jugador_id
}

/** "17 h 42 min", "35 min" or null when closed. */
export function tiempoRestante(cierre, now = new Date()) {
  if (!cierre) return null
  const ms = new Date(cierre) - now
  if (ms <= 0) return null
  const h = Math.floor(ms / 3.6e6)
  const min = Math.floor((ms % 3.6e6) / 6e4)
  return h > 0 ? `${h} h ${min} min` : `${Math.max(1, min)} min`
}

/** Share of the votes, rounded so the list adds up as expected for the eye. */
export const porcentaje = (votos, total) => (total ? Math.round((votos / total) * 100) : 0)
