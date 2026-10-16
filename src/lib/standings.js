/**
 * League table computation (pure, no I/O).
 *
 * Tie-break order, following the usual Spanish federation rules for leagues:
 *   1. Points
 *   2. If every match between the tied teams has been played (home and away):
 *      head-to-head points, then head-to-head goal difference
 *   3. Overall goal difference
 *   4. Goals scored
 *   5. Name (stable fallback)
 */

export const POINTS = { win: 3, draw: 1, loss: 0 }

const emptyRow = (team) => ({
  team,
  id: team.id,
  pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0,
  forma: [], // oldest → newest: 'V' | 'E' | 'D'
})

const byDate = (a, b) =>
  (a.jornada ?? 0) - (b.jornada ?? 0) || String(a.fecha ?? '').localeCompare(String(b.fecha ?? ''))

function apply(row, gf, gc) {
  row.pj++
  row.gf += gf
  row.gc += gc
  if (gf > gc) { row.pg++; row.pts += POINTS.win; row.forma.push('V') }
  else if (gf === gc) { row.pe++; row.pts += POINTS.draw; row.forma.push('E') }
  else { row.pp++; row.forma.push('D') }
}

/**
 * @param {Array} teams   [{ id, nombre, sancion_puntos? }]
 * @param {Array} results [{ local_id, visitante_id, goles_local, goles_visitante, jugado, jornada?, fecha? }]
 * @param {'total'|'home'|'away'} scope
 */
export function computeStandings(teams, results, scope = 'total') {
  const rows = new Map(teams.map((t) => [t.id, emptyRow(t)]))
  const played = results.filter((r) => r.jugado && rows.has(r.local_id) && rows.has(r.visitante_id)).sort(byDate)

  for (const r of played) {
    const gl = Number(r.goles_local) || 0
    const gv = Number(r.goles_visitante) || 0
    if (scope !== 'away') apply(rows.get(r.local_id), gl, gv)
    if (scope !== 'home') apply(rows.get(r.visitante_id), gv, gl)
  }

  const list = [...rows.values()].map((row) => {
    row.dg = row.gf - row.gc
    if (scope === 'total') row.pts -= Number(row.team.sancion_puntos) || 0
    row.forma = row.forma.slice(-5)
    return row
  })

  // Group by points and resolve ties
  const groups = new Map()
  list.forEach((row) => {
    if (!groups.has(row.pts)) groups.set(row.pts, [])
    groups.get(row.pts).push(row)
  })

  const sorted = [...groups.keys()]
    .sort((a, b) => b - a)
    .flatMap((pts) => resolveTie(groups.get(pts), played))

  return sorted.map((row, i) => ({ ...row, pos: i + 1 }))
}

const overall = (a, b) =>
  b.dg - a.dg || b.gf - a.gf || String(a.team.nombre).localeCompare(String(b.team.nombre))

function resolveTie(group, played) {
  if (group.length < 2) return group
  const ids = new Set(group.map((r) => r.id))
  const between = played.filter((r) => ids.has(r.local_id) && ids.has(r.visitante_id))
  const needed = group.length * (group.length - 1) // double round robin
  if (between.length < needed) return [...group].sort(overall)

  const h2h = new Map(group.map((r) => [r.id, { pts: 0, dg: 0 }]))
  for (const r of between) {
    const gl = Number(r.goles_local) || 0
    const gv = Number(r.goles_visitante) || 0
    const L = h2h.get(r.local_id)
    const V = h2h.get(r.visitante_id)
    L.dg += gl - gv
    V.dg += gv - gl
    if (gl > gv) L.pts += POINTS.win
    else if (gl < gv) V.pts += POINTS.win
    else { L.pts += POINTS.draw; V.pts += POINTS.draw }
  }
  return [...group].sort((a, b) => {
    const A = h2h.get(a.id), B = h2h.get(b.id)
    return B.pts - A.pts || B.dg - A.dg || overall(a, b)
  })
}

/**
 * Zone for a position. `config` = { ascenso, promocion, descenso } (counts).
 * Returns 'ascenso' | 'promocion' | 'descenso' | null.
 */
export function zoneFor(pos, total, config = {}) {
  const asc = Number(config.ascenso) || 0
  const pro = Number(config.promocion) || 0
  const des = Number(config.descenso) || 0
  if (pos <= asc) return 'ascenso'
  if (pos <= asc + pro) return 'promocion'
  if (des > 0 && pos > total - des) return 'descenso'
  return null
}

export const ZONES = {
  ascenso: { label: 'Ascenso directo', color: '#1f9d55' },
  promocion: { label: 'Promoción de ascenso', color: '#3a6fb0' },
  descenso: { label: 'Descenso', color: '#c0392b' },
}

/**
 * Converts our own matches (table `partidos`) into league results using team ids.
 * Matches whose rival is not in the league teams list (or friendlies) are ignored.
 */
export function ownMatchesAsResults(partidos, teams, clubName) {
  const own = teams.find((t) => t.es_propio) || teams.find((t) => t.nombre === clubName)
  if (!own) return []
  const byName = new Map(teams.map((t) => [norm(t.nombre), t.id]))
  return partidos
    .filter((p) => !p.amistoso)
    .map((p) => {
      const home = p.local === clubName
      const rivalId = byName.get(norm(home ? p.visitante : p.local))
      if (!rivalId) return null
      return {
        id: `own-${p.id}`,
        own: true,
        partido_id: p.id,
        jornada: p.jornada,
        fecha: p.fecha,
        hora: p.hora,
        jugado: p.jugado,
        local_id: home ? own.id : rivalId,
        visitante_id: home ? rivalId : own.id,
        goles_local: p.goles_local,
        goles_visitante: p.goles_visitante,
      }
    })
    .filter(Boolean)
}

export const norm = (s = '') =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
