/**
 * Season totals per player from `estadisticas` rows (friendlies excluded by default).
 *
 * A match counts as "played" when the player has minutes. For matches where no
 * lineup was entered (nobody has minutes), having a stats row counts as played,
 * so old/manual data still works.
 */
export function playerTotals(jugadores, stats, partidos, { includeFriendlies = false } = {}) {
  const valid = new Set(partidos.filter((p) => p.jugado && (includeFriendlies || !p.amistoso)).map((p) => p.id))
  const rows = stats.filter((s) => valid.has(s.partido_id))
  const matchHasMinutes = new Set(rows.filter((s) => s.minutos > 0).map((s) => s.partido_id))

  return jugadores.map((j) => {
    const ss = rows.filter((s) => s.jugador_id === j.id)
    const jugados = ss.filter((s) => s.minutos > 0 || !matchHasMinutes.has(s.partido_id))
    const sum = (k) => ss.reduce((a, s) => a + (Number(s[k]) || 0), 0)
    const minutos = sum('minutos')
    const goles = sum('goles')
    return {
      ...j,
      convocatorias: ss.length,
      partidos: jugados.length,
      titularidades: ss.filter((s) => s.titular).length,
      minutos,
      goles,
      asistencias: sum('asistencias'),
      tarjetas_amarillas: sum('tarjetas_amarillas'),
      tarjetas_rojas: sum('tarjetas_rojas'),
      paradas: sum('paradas'),
      goles_encajados: sum('goles_encajados'),
      minutosPorGol: goles > 0 && minutos > 0 ? Math.round(minutos / goles) : null,
    }
  })
}

/** "1.234'" style formatting for minutes. */
export const fmtMin = (m) => `${(m || 0).toLocaleString('es-ES')}'`
