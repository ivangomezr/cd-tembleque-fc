import { describe, it, expect } from 'vitest'
import { mvpCierre, votacionAbierta, candidatosMvp, ganadorMvp, tiempoRestante, porcentaje } from '../mvp'

describe('cierre de la votación', () => {
  it('cierra a las 23:59:59 (hora española) del día siguiente al partido', () => {
    // Saturday 17 Oct 2026 (summer time, UTC+2) → closes Sunday 18 at 21:59:59 UTC
    expect(mvpCierre('2026-10-17').toISOString()).toBe('2026-10-18T21:59:59.000Z')
    // winter time (UTC+1)
    expect(mvpCierre('2026-11-14').toISOString()).toBe('2026-11-15T22:59:59.000Z')
    // the day of the clock change (25 Oct 2026)
    expect(mvpCierre('2026-10-24').toISOString()).toBe('2026-10-25T22:59:59.000Z')
    expect(mvpCierre('')).toBeNull()
  })
  it('abierta solo si el partido está marcado como jugado y no ha pasado el cierre', () => {
    const p = { jugado: true, fecha: '2026-10-17' }
    expect(votacionAbierta(p, new Date('2026-10-17T18:00:00Z'))).toBe(true)
    expect(votacionAbierta(p, new Date('2026-10-18T21:59:58Z'))).toBe(true)
    expect(votacionAbierta(p, new Date('2026-10-18T22:00:00Z'))).toBe(false)
    expect(votacionAbierta({ ...p, jugado: false }, new Date('2026-10-17T18:00:00Z'))).toBe(false)
  })
  it('tiempo restante legible', () => {
    const cierre = new Date('2026-10-18T21:59:59Z')
    expect(tiempoRestante(cierre, new Date('2026-10-18T04:17:59Z'))).toBe('17 h 42 min')
    expect(tiempoRestante(cierre, new Date('2026-10-18T21:30:00Z'))).toBe('29 min')
    expect(tiempoRestante(cierre, new Date('2026-10-19T00:00:00Z'))).toBeNull()
  })
})

describe('candidatos', () => {
  const partido = { id: 1, convocados: [1, 2, 3, 4, 5] }
  const jugadores = [1, 2, 3, 4, 5, 6].map((id) => ({ id, nombre: `J${id}`, dorsal: id }))
  const stats = [
    { partido_id: 1, jugador_id: 1, minutos: 90 },
    { partido_id: 1, jugador_id: 2, minutos: 60, asistencias: 1 },
    { partido_id: 1, jugador_id: 3, minutos: 30, goles: 1 },
    { partido_id: 1, jugador_id: 4, minutos: 45 },
  ]
  it('solo convocados; primero goles o asistencias, después por minutos', () => {
    expect(candidatosMvp(partido, jugadores, stats).map((j) => j.id)).toEqual([3, 2, 1, 4, 5])
  })
  it('sin convocatoria, los que jugaron minutos', () => {
    expect(candidatosMvp({ id: 1, convocados: [] }, jugadores, stats).map((j) => j.id)).toEqual([3, 2, 1, 4])
  })
  it('ganador: más votos; empate para quien va primero en el orden', () => {
    const c = candidatosMvp(partido, jugadores, stats)
    expect(ganadorMvp([{ jugador_id: 1, votos: 5 }, { jugador_id: 3, votos: 4 }], c)).toBe(1)
    expect(ganadorMvp([{ jugador_id: 1, votos: 4 }, { jugador_id: 3, votos: 4 }], c)).toBe(3)
    expect(ganadorMvp([], c)).toBeNull()
  })
  it('porcentajes', () => {
    expect(porcentaje(130, 316)).toBe(41)
    expect(porcentaje(0, 0)).toBe(0)
  })
})
