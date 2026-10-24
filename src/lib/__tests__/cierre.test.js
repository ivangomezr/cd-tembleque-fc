import { describe, it, expect } from 'vitest'
import { estadoCierre, marcadorDesdeTimeline } from '../cierre'
import { CLUB } from '../../config/club'

const now = new Date('2026-10-24T18:00:00Z') // Saturday evening
const ids = (n) => Array.from({ length: n }, (_, i) => i + 1)
const lineup = (n) => ({ formacion: '4-4-2', jugadores: ids(n).map((id, i) => ({ linea: i === 0 ? 0 : 1, posicion: i, jugador_id: id })) })
const base = { id: 1, fecha: '2026-10-24', hora: '17:00', local: CLUB.name, visitante: 'CD Mora', jugado: false, convocados: ids(16) }
const goles = [
  { tipo: 'gol', equipo: 'propio', minuto: 10 }, { tipo: 'gol_penalti', equipo: 'propio', minuto: 50 },
  { tipo: 'gol', equipo: 'rival', minuto: 70 }, { tipo: 'amarilla', equipo: 'propio', minuto: 80 },
]

describe('cerrar el partido', () => {
  it('el resultado sale de los goles de la línea de tiempo, en casa y fuera', () => {
    expect(marcadorDesdeTimeline(base, goles)).toEqual({ goles_local: 2, goles_visitante: 1 })
    expect(marcadorDesdeTimeline({ ...base, local: 'CD Mora', visitante: CLUB.name }, goles)).toEqual({ goles_local: 1, goles_visitante: 2 })
    expect(marcadorDesdeTimeline(base, [])).toEqual({ goles_local: 0, goles_visitante: 0 })
  })
  it('listo solo con convocatoria, once titular, línea de tiempo revisada y 5 candidatos', () => {
    const ok = { partido: base, alineacion: lineup(11), eventos: goles, finalistas: [1, 2, 3, 4, 5], timelineRevisada: true, now }
    expect(estadoCierre(ok).listo).toBe(true)
    expect(estadoCierre({ ...ok, alineacion: lineup(10) }).listo).toBe(false)
    expect(estadoCierre({ ...ok, timelineRevisada: false }).listo).toBe(false)
    expect(estadoCierre({ ...ok, finalistas: [1, 2, 3] }).listo).toBe(false)
    expect(estadoCierre({ ...ok, partido: { ...base, convocados: ids(9) } }).listo).toBe(false)
  })
  it('no se puede cerrar antes de que empiece', () => {
    const e = estadoCierre({ partido: { ...base, hora: '21:00' }, alineacion: lineup(11), eventos: [], finalistas: [1, 2, 3, 4, 5], timelineRevisada: true, now })
    expect(e.listo).toBe(false)
    expect(e.pasos.find((p) => p.clave === 'empezado').ok).toBe(false)
  })
  it('usa los candidatos ya guardados si no se pasan otros', () => {
    const e = estadoCierre({ partido: { ...base, mvp_finalistas: [1, 2, 3, 4, 5] }, alineacion: lineup(11), eventos: [], timelineRevisada: true, now })
    expect(e.listo).toBe(true)
  })
  it('un partido antiguo (votación ya cerrada) no pide candidatos', () => {
    const e = estadoCierre({ partido: { ...base, fecha: '2026-10-10' }, alineacion: lineup(11), eventos: [], timelineRevisada: true, now })
    expect(e.necesitaCandidatos).toBe(false)
    expect(e.listo).toBe(true)
  })
})
