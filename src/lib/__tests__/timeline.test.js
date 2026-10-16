import { describe, it, expect } from 'vitest'
import { computePlayerMinutes, statsFromEvents, scoreFromEvents, sortEvents, startersFromLineup, eventsByPlayer } from '../timeline'

const XI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const GK = (id) => id === 1 || id === 12

describe('computePlayerMinutes', () => {
  it('gives 90 minutes to every starter when there are no events', () => {
    const { minutos, titular } = computePlayerMinutes({ starters: XI })
    XI.forEach((id) => expect(minutos[id]).toBe(90))
    expect(titular[1]).toBe(true)
  })

  it('splits minutes on a substitution', () => {
    const events = [{ id: 1, tipo: 'cambio', equipo: 'propio', minuto: 60, jugador_id: 14, jugador2_id: 9 }]
    const { minutos, titular } = computePlayerMinutes({ starters: XI, events })
    expect(minutos[9]).toBe(60)
    expect(minutos[14]).toBe(30)
    expect(titular[14]).toBe(false)
  })

  it('caps added time to the regulation length', () => {
    const events = [{ id: 1, tipo: 'cambio', equipo: 'propio', minuto: 90, minuto_extra: 3, jugador_id: 15, jugador2_id: 10 }]
    const { minutos } = computePlayerMinutes({ starters: XI, events })
    expect(minutos[10]).toBe(90)
    expect(minutos[15]).toBe(0)
  })

  it('stops the clock for a sent-off player and ignores rival events', () => {
    const events = [
      { id: 1, tipo: 'roja', equipo: 'propio', minuto: 70, jugador_id: 4 },
      { id: 2, tipo: 'cambio', equipo: 'rival', minuto: 46 },
      { id: 3, tipo: 'segunda_amarilla', equipo: 'propio', minuto: 80, jugador_id: 5 },
    ]
    const { minutos } = computePlayerMinutes({ starters: XI, events })
    expect(minutos[4]).toBe(70)
    expect(minutos[5]).toBe(80)
    expect(minutos[6]).toBe(90)
  })

  it('handles a sub who is later subbed off', () => {
    const events = [
      { id: 1, tipo: 'cambio', equipo: 'propio', minuto: 30, jugador_id: 14, jugador2_id: 9 },
      { id: 2, tipo: 'cambio', equipo: 'propio', minuto: 75, jugador_id: 16, jugador2_id: 14 },
    ]
    const { minutos } = computePlayerMinutes({ starters: XI, events })
    expect(minutos[14]).toBe(45)
    expect(minutos[16]).toBe(15)
  })

  it('credits goals conceded to the goalkeeper on the pitch', () => {
    const events = [
      { id: 1, tipo: 'gol', equipo: 'rival', minuto: 20 },
      { id: 2, tipo: 'cambio', equipo: 'propio', minuto: 46, jugador_id: 12, jugador2_id: 1 },
      { id: 3, tipo: 'gol_penalti', equipo: 'rival', minuto: 88 },
      { id: 4, tipo: 'gol', equipo: 'propio', minuto: 89, jugador_id: 9 },
    ]
    const { golesEncajados, minutos } = computePlayerMinutes({ starters: XI, events, isGoalkeeper: GK })
    expect(golesEncajados[1]).toBe(1)
    expect(golesEncajados[12]).toBe(1)
    expect(minutos[1]).toBe(46)
    expect(minutos[12]).toBe(44)
  })
})

describe('statsFromEvents', () => {
  it('derives goals, assists and cards for our players only', () => {
    const events = [
      { tipo: 'gol', equipo: 'propio', jugador_id: 9, jugador2_id: 7 },
      { tipo: 'gol_penalti', equipo: 'propio', jugador_id: 9 },
      { tipo: 'gol', equipo: 'rival', nombre_rival: 'Dorsal 10' },
      { tipo: 'amarilla', equipo: 'propio', jugador_id: 4 },
      { tipo: 'segunda_amarilla', equipo: 'propio', jugador_id: 4 },
      { tipo: 'gol_propia', equipo: 'propio', nombre_rival: 'Defensa rival' },
    ]
    const s = statsFromEvents(events)
    expect(s[9].goles).toBe(2)
    expect(s[7].asistencias).toBe(1)
    expect(s[4]).toEqual({ goles: 0, asistencias: 0, tarjetas_amarillas: 2, tarjetas_rojas: 1 })
  })
})

describe('helpers', () => {
  it('scores own goals for the benefiting side', () => {
    expect(scoreFromEvents([
      { tipo: 'gol', equipo: 'propio' },
      { tipo: 'gol_propia', equipo: 'propio' },
      { tipo: 'gol_propia', equipo: 'rival' },
      { tipo: 'amarilla', equipo: 'rival' },
    ])).toEqual({ propio: 2, rival: 1 })
  })

  it('sorts by minute and added time', () => {
    const sorted = sortEvents([
      { id: 'a', minuto: 46 },
      { id: 'b', minuto: 45, minuto_extra: 2 },
      { id: 'c', minuto: 45 },
    ])
    expect(sorted.map((e) => e.id)).toEqual(['c', 'b', 'a'])
  })

  it('reads starters from lineup slots', () => {
    expect(startersFromLineup({ jugadores: [{ jugador_id: 3 }, { jugador_id: null }, 5] })).toEqual([3, 5])
    expect(startersFromLineup(null)).toEqual([])
  })
})

describe('eventsByPlayer', () => {
  it('summarises goals, penalties, own goals and cards for badges', () => {
    const b = eventsByPlayer([
      { tipo: 'gol', equipo: 'propio', jugador_id: 9 },
      { tipo: 'gol_penalti', equipo: 'propio', jugador_id: 9 },
      { tipo: 'gol_propia', equipo: 'rival', jugador_id: 4 },
      { tipo: 'amarilla', equipo: 'propio', jugador_id: 4 },
      { tipo: 'segunda_amarilla', equipo: 'propio', jugador_id: 4 },
      { tipo: 'amarilla', equipo: 'rival', nombre_rival: 'Dorsal 3' },
    ])
    expect(b[9]).toMatchObject({ goles: 2, penaltis: 1, propia: 0 })
    expect(b[4]).toMatchObject({ propia: 1, amarillas: 2, segunda: true })
  })
})
