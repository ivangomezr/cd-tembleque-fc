import { describe, it, expect } from 'vitest'
import { computeStandings, zoneFor, ownMatchesAsResults } from '../standings'

const teams = [
  { id: 1, nombre: 'CD Tembleque FC', es_propio: true },
  { id: 2, nombre: 'Villacañas' },
  { id: 3, nombre: 'Mora' },
  { id: 4, nombre: 'Consuegra', sancion_puntos: 3 },
]
const m = (jornada, local_id, visitante_id, goles_local, goles_visitante) =>
  ({ jornada, local_id, visitante_id, goles_local, goles_visitante, jugado: true })

describe('computeStandings', () => {
  it('awards 3/1/0 points and computes goal difference', () => {
    const t = computeStandings(teams, [m(1, 1, 2, 2, 0), m(1, 3, 4, 1, 1)])
    const us = t.find((r) => r.id === 1)
    expect(us).toMatchObject({ pos: 1, pj: 1, pg: 1, pts: 3, gf: 2, gc: 0, dg: 2, forma: ['V'] })
    expect(t.find((r) => r.id === 3).pts).toBe(1)
  })

  it('applies points deductions', () => {
    const t = computeStandings(teams, [m(1, 4, 2, 3, 0)])
    expect(t.find((r) => r.id === 4).pts).toBe(0)
  })

  it('ignores unplayed matches', () => {
    const t = computeStandings(teams, [{ ...m(1, 1, 2, 5, 0), jugado: false }])
    expect(t.every((r) => r.pj === 0)).toBe(true)
  })

  it('uses head-to-head only when both legs between the tied teams are played', () => {
    const three = teams.slice(0, 3)
    // Mora beat Villacañas at home; Villacañas thrashed us. Both end on 4 points.
    const base = [m(1, 3, 2, 1, 0), m(2, 2, 1, 4, 0), m(3, 1, 3, 1, 0)]

    // Only one leg of Mora–Villacañas played → overall goal difference decides
    let t = computeStandings(three, base)
    expect(t.find((r) => r.id === 2).pts).toBe(3)

    const withReturnLeg = [...base, m(4, 2, 3, 0, 0)]
    t = computeStandings(three, withReturnLeg)
    const mora = t.find((r) => r.id === 3)
    const vill = t.find((r) => r.id === 2)
    expect(mora.pts).toBe(vill.pts)
    expect(vill.dg).toBeGreaterThan(mora.dg)
    expect(mora.pos).toBeLessThan(vill.pos) // h2h: Mora 4 pts vs Villacañas 1
  })

  it('falls back to goal difference when the head-to-head is incomplete', () => {
    const three = teams.slice(0, 3)
    const res = [m(1, 3, 2, 1, 0), m(2, 2, 1, 5, 0), m(3, 1, 3, 1, 0), m(4, 1, 2, 0, 0), m(4, 3, 1, 0, 0)]
    const t = computeStandings(three, res)
    const mora = t.find((r) => r.id === 3)
    const vill = t.find((r) => r.id === 2)
    expect(mora.pts).toBe(vill.pts)
    expect(vill.pos).toBeLessThan(mora.pos)
  })

  it('keeps only the last five results in the form guide', () => {
    const many = Array.from({ length: 7 }, (_, i) => m(i + 1, 1, 2, i % 2, 0))
    const us = computeStandings(teams, many).find((r) => r.id === 1)
    expect(us.forma).toHaveLength(5)
  })

  it('supports home/away tables', () => {
    const res = [m(1, 1, 2, 1, 0), m(2, 3, 1, 2, 0)]
    expect(computeStandings(teams, res, 'home').find((r) => r.id === 1).pts).toBe(3)
    expect(computeStandings(teams, res, 'away').find((r) => r.id === 1).pts).toBe(0)
  })
})

describe('zoneFor', () => {
  it('marks promotion, play-off and relegation spots', () => {
    const cfg = { ascenso: 1, promocion: 2, descenso: 3 }
    expect(zoneFor(1, 18, cfg)).toBe('ascenso')
    expect(zoneFor(3, 18, cfg)).toBe('promocion')
    expect(zoneFor(10, 18, cfg)).toBeNull()
    expect(zoneFor(16, 18, cfg)).toBe('descenso')
  })
})

describe('ownMatchesAsResults', () => {
  it('maps our matches to team ids and skips friendlies', () => {
    const partidos = [
      { id: 7, jornada: 1, local: 'CD Tembleque FC', visitante: 'Villacañas', goles_local: 1, goles_visitante: 1, jugado: true },
      { id: 8, jornada: 2, local: 'Mora', visitante: 'CD Tembleque FC', goles_local: 0, goles_visitante: 2, jugado: true },
      { id: 9, jornada: 0, local: 'CD Tembleque FC', visitante: 'Amigos FC', jugado: true, amistoso: true },
    ]
    const r = ownMatchesAsResults(partidos, teams, 'CD Tembleque FC')
    expect(r).toHaveLength(2)
    expect(r[1]).toMatchObject({ local_id: 3, visitante_id: 1, own: true, partido_id: 8 })
  })
})
