import { describe, it, expect } from 'vitest'
import { byDorsal, splitName, playerMatchLog, rankIn, candidatosCapitan } from '../players'

const CLUB = 'CD Tembleque FC'

describe('plantilla', () => {
  it('ordena por dorsal; sin dorsal al final y por nombre', () => {
    const js = [{ nombre: 'C', dorsal: 9 }, { nombre: 'B' }, { nombre: 'A', dorsal: 1 }, { nombre: 'A2' }]
    expect(js.sort(byDorsal).map((j) => j.nombre)).toEqual(['A', 'C', 'A2', 'B'])
  })
  it('separa nombre y apellidos', () => {
    expect(splitName('Iván Gómez')).toEqual({ first: 'Iván', last: 'Gómez' })
    expect(splitName('Juan Pablo de la Torre')).toEqual({ first: 'Juan', last: 'Pablo de la Torre' })
    expect(splitName('Chata')).toEqual({ first: '', last: 'Chata' })
  })
})

describe('ficha del jugador', () => {
  const partidos = [
    { id: 1, fecha: '2026-09-13', jornada: 1, local: CLUB, visitante: 'CD Mora', goles_local: 3, goles_visitante: 2, jugado: true, convocados: [8, 9], mvp_jugador_id: 8 },
    { id: 2, fecha: '2026-09-20', jornada: 2, local: 'Consuegra CF', visitante: CLUB, goles_local: 1, goles_visitante: 1, jugado: true, convocados: [8] },
    { id: 3, fecha: '2026-09-27', jornada: 3, local: CLUB, visitante: 'AD Turleque', goles_local: 0, goles_visitante: 1, jugado: true, convocados: [9] },
    { id: 4, fecha: '2026-10-04', jornada: 4, local: CLUB, visitante: 'CD Lillo', jugado: false, convocados: [8] },
  ]
  const stats = [
    { partido_id: 1, jugador_id: 8, titular: true, minutos: 90, goles: 1 },
    { partido_id: 2, jugador_id: 8, titular: false, minutos: 0 },
  ]
  it('lista todos los partidos jugados, del más reciente al más antiguo', () => {
    const log = playerMatchLog(8, partidos, stats)
    expect(log.map((r) => r.partido.id)).toEqual([3, 2, 1]) // the unplayed match 4 is left out
    expect(log[0]).toMatchObject({ rol: 'no convocado', resultado: 'derrota', stat: null })
    expect(log[2]).toMatchObject({ rol: 'titular', resultado: 'victoria', nuestros: 3, rivales: 2, rival: 'CD Mora', mvp: true })
    expect(log[1]).toMatchObject({ rol: 'sin minutos', resultado: 'empate', nuestros: 1, rivales: 1 })
  })
  it('convocado sin fila de estadísticas', () => {
    expect(playerMatchLog(9, partidos, stats).map((r) => r.rol)).toEqual(['convocado', 'no convocado', 'convocado'])
  })
  it('si tiene estadísticas cuenta como convocado aunque falte en la lista', () => {
    const log = playerMatchLog(8, [{ ...partidos[1], convocados: [] }], stats)
    expect(log[0].rol).toBe('sin minutos')
  })
  it('posición en la plantilla con empates', () => {
    const t = [{ id: 1, goles: 5 }, { id: 2, goles: 5 }, { id: 3, goles: 2 }, { id: 4, goles: 0 }]
    expect(rankIn(t, 2, 'goles')).toBe(1)
    expect(rankIn(t, 3, 'goles')).toBe(3)
    expect(rankIn(t, 4, 'goles')).toBeNull()
  })
})

describe('capitanes', () => {
  const jugadores = [
    { id: 1, nombre: 'Uno', dorsal: 1 }, { id: 4, nombre: 'Cuatro', dorsal: 4, capitania: 2 },
    { id: 7, nombre: 'Siete', dorsal: 7, capitania: 1 }, { id: 9, nombre: 'Nueve', dorsal: 9 }, { id: 3, nombre: 'Tres', dorsal: 3, capitania: 1 },
  ]
  it('entre los titulares, primero los primeros capitanes y luego los segundos', () => {
    expect(candidatosCapitan([1, 4, 7, 9, 3], jugadores).map((j) => j.id)).toEqual([3, 7, 4, 1, 9])
  })
  it('si no juega ningún capitán, cualquier titular', () => {
    expect(candidatosCapitan([1, 9], jugadores).map((j) => j.id)).toEqual([1, 9])
  })
  it('los suplentes no entran', () => {
    expect(candidatosCapitan([1], jugadores).map((j) => j.id)).toEqual([1])
  })
})
