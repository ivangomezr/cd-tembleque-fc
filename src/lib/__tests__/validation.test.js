import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validarJugador, validarPartido, validarPartidoLiga, validarEvento, validarBorrarEvento, validarAlineacion,
  validarEstadistica, validarConvocados, validarVoto, validarTemporada, validarEquipo, debeMarcarseJugado,
  limitesMinuto, urlOk, FORMACIONES_VALIDAS, ESTADOS_JUGADOR, POSICIONES,
  validarFinalistas, exigirFinalistas, candidatosNecesarios, necesitaCandidatos,
} from '../validation'
import { timelineIssue } from '../timeline'
import { ESTADOS, POSICIONES as POSICIONES_UI } from '../players'

/** Message of the error thrown by fn, or null when it does not throw. */
const err = (fn) => { try { fn() } catch (e) { return e.message } return null }

const CLUB_NAME = 'CD Tembleque FC'
const now = new Date('2026-10-17T12:00:00')
const temporada = { id: 1, nombre: 'Segunda 2026/27', año: 2026, duracion_partido: 90 }
const equipos = [
  { id: 10, nombre: CLUB_NAME, es_propio: true },
  { id: 11, nombre: 'Rival A' }, { id: 12, nombre: 'Rival B' }, { id: 13, nombre: 'Rival C' }, { id: 14, nombre: 'Rival D' },
]
const jugadores = [
  { id: 1, nombre: 'Portero Uno', posicion: 'Portero', dorsal: 1, activo: true },
  { id: 2, nombre: 'Defensa Dos', posicion: 'Defensa', dorsal: 2, activo: true },
  { id: 3, nombre: 'Medio Ocho', posicion: 'Centrocampista', dorsal: 8, activo: true },
  { id: 4, nombre: 'Delantero Nueve', posicion: 'Delantero', dorsal: 9, activo: true },
  { id: 5, nombre: 'Suplente Once', posicion: 'Delantero', dorsal: 11, activo: true },
  { id: 6, nombre: 'No Convocado', posicion: 'Defensa', dorsal: 15, activo: true },
  { id: 7, nombre: 'Retirado Siete', posicion: 'Defensa', dorsal: 7, activo: false },
]
const partido = {
  id: 100, temporada_id: 1, jornada: 1, fecha: '2026-09-13', hora: '17:00', local: CLUB_NAME, visitante: 'Rival A',
  jugado: true, goles_local: 2, goles_visitante: 1, amistoso: false, convocados: [1, 2, 3, 4, 5],
}
const slot = (linea, posicion, jugador_id) => ({ linea, posicion, jugador_id })
const alineacion = { formacion: '4-4-2', jugadores: [slot(0, 0, 1), slot(1, 0, 2), slot(1, 1, 3), slot(1, 2, 4)] }
let seq = 0
const ev = (o) => ({ id: ++seq, created_at: String(seq).padStart(4, '0'), partido_id: 100, minuto_extra: 0, jugador_id: null, jugador2_id: null, nombre_rival: null, ...o })
const ctxEvento = (eventos = []) => ({ partido, temporada, eventos, alineacion, jugadores, now })

// ─────────────────────────────────────────────────────────────────────────────
describe('jugadores', () => {
  it('acepta un jugador válido y limpia el nombre', () => {
    expect(validarJugador({ nombre: '  Nuevo  ', posicion: 'Delantero', dorsal: '99' }, { jugadores }).nombre).toBe('Nuevo')
  })
  it('dorsal: límites 1 y 99, sin decimales ni texto', () => {
    expect(err(() => validarJugador({ nombre: 'A', posicion: 'Defensa', dorsal: 1 }, { jugadores: [] }))).toBeNull()
    for (const d of [0, 100, 1.5, 'abc', -3]) expect(err(() => validarJugador({ nombre: 'A', posicion: 'Defensa', dorsal: d }, { jugadores: [] }))).toMatch(/1 al 99/)
  })
  it('dorsal sin rellenar es válido (opcional)', () => {
    expect(validarJugador({ nombre: 'A', posicion: 'Defensa', dorsal: '' }, { jugadores }).dorsal).toBeNull()
  })
  it('dorsal repetido entre jugadores en activo', () => {
    expect(err(() => validarJugador({ nombre: 'A', posicion: 'Defensa', dorsal: 9 }, { jugadores }))).toMatch(/Delantero Nueve/)
  })
  it('se puede reutilizar el dorsal de un jugador que ya no está en activo', () => {
    expect(err(() => validarJugador({ nombre: 'A', posicion: 'Defensa', dorsal: 7 }, { jugadores }))).toBeNull()
  })
  it('al editar, el jugador conserva su propio dorsal', () => {
    expect(err(() => validarJugador({ nombre: 'Delantero Nueve', posicion: 'Delantero', dorsal: 9 }, { jugadores, id: 4 }))).toBeNull()
  })
  it('nombre obligatorio, máximo 60 y sin caracteres de control', () => {
    expect(err(() => validarJugador({ nombre: '   ', posicion: 'Defensa' }, { jugadores }))).toMatch(/obligatorio/)
    expect(err(() => validarJugador({ nombre: 'x'.repeat(61), posicion: 'Defensa' }, { jugadores }))).toMatch(/60/)
    expect(err(() => validarJugador({ nombre: 'Ana\u0007\u001b[2J', posicion: 'Defensa' }, { jugadores }))).toMatch(/caracteres/)
  })
  it('posición y estado deben existir', () => {
    expect(err(() => validarJugador({ nombre: 'A', posicion: 'Libero' }, { jugadores }))).toMatch(/posición/)
    expect(err(() => validarJugador({ nombre: 'A', posicion: 'Defensa', estado: 'hackeado' }, { jugadores }))).toMatch(/estado/)
  })
  it('foto: solo https (o data: en modo local, sin base de datos)', () => {
    expect(err(() => validarJugador({ nombre: 'A', posicion: 'Defensa', foto_url: 'javascript:alert(1)' }, { jugadores }))).toMatch(/foto/)
    expect(err(() => validarJugador({ nombre: 'A', posicion: 'Defensa', foto_url: 'data:image/png;base64,AA' }, { jugadores }))).toMatch(/foto/)
    expect(err(() => validarJugador({ nombre: 'A', posicion: 'Defensa', foto_url: 'data:image/png;base64,AA' }, { jugadores, local: true }))).toBeNull()
    expect(err(() => validarJugador({ nombre: 'A', posicion: 'Defensa', foto_url: 'https://res.cloudinary.com/x/a.jpg' }, { jugadores }))).toBeNull()
  })
  it('urls con comillas o espacios no pasan', () => {
    expect(urlOk('https://x.com/a.jpg" onerror="alert(1)')).toBe(false)
    expect(urlOk('https://x.com/a b.jpg')).toBe(false)
    expect(urlOk('/escudo.png')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('temporadas y equipos', () => {
  it('año, duración y plazas dentro de rango', () => {
    expect(err(() => validarTemporada({ nombre: 'X', año: 1999 }))).toMatch(/2000 y 2100/)
    expect(err(() => validarTemporada({ duracion_partido: 0 }))).toMatch(/1 y 120/)
    expect(err(() => validarTemporada({ zona_ascenso: -1 }))).toMatch(/plazas/i)
  })
  it('las plazas no pueden sumar más que equipos hay', () => {
    expect(err(() => validarTemporada({ zona_ascenso: 3, zona_promocion: 2, zona_descenso: 2 }, { numEquipos: 6 }))).toMatch(/suman 7/)
  })
  it('nombre de temporada único (sin distinguir mayúsculas)', () => {
    expect(err(() => validarTemporada({ nombre: ' segunda 2026/27 ', año: 2027 }, { temporadas: [temporada] }))).toMatch(/Ya existe/)
  })
  it('equipo: nombre único, nombre corto ≤ 16, sanción 0-99', () => {
    expect(err(() => validarEquipo({ nombre: ' rival a ' }, { equipos }))).toMatch(/Ya existe/)
    expect(err(() => validarEquipo({ nombre: 'Nuevo', nombre_corto: 'x'.repeat(17) }, { equipos }))).toMatch(/16/)
    expect(err(() => validarEquipo({ nombre: 'Nuevo', sancion_puntos: -3 }, { equipos }))).toMatch(/0 y 99/)
    expect(validarEquipo({ nombre: ' Nuevo ', sancion_puntos: '' }, { equipos })).toMatchObject({ nombre: 'Nuevo', sancion_puntos: 0 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('partidos del club', () => {
  const base = { jornada: 2, fecha: '2026-09-20', hora: '17:00', local: CLUB_NAME, visitante: 'Rival B', campo: 'Municipal', goles_local: 0, goles_visitante: 0 }
  const ctx = { partidos: [partido], partidosLiga: [], equipos, temporada, now }
  it('acepta un partido válido', () => { expect(err(() => validarPartido(base, ctx))).toBeNull() })
  it('jornada repetida', () => { expect(err(() => validarPartido({ ...base, jornada: 1 }, ctx))).toMatch(/jornada 1 ya está/) })
  it('jornada entre 1 y 99 (los amistosos van sin jornada)', () => {
    expect(err(() => validarPartido({ ...base, jornada: 0 }, ctx))).toMatch(/1 y 99/)
    expect(validarPartido({ ...base, jornada: 7, amistoso: true, visitante: 'Fantasma CF' }, ctx).jornada).toBe(0)
  })
  it('el rival de liga debe estar en el grupo (un amistoso no)', () => {
    expect(err(() => validarPartido({ ...base, visitante: 'Fantasma CF' }, ctx))).toMatch(/no está entre los equipos/)
  })
  it('el club debe jugar y no contra sí mismo', () => {
    expect(err(() => validarPartido({ ...base, local: 'Rival A' }, ctx))).toMatch(/debe ser/)
    expect(err(() => validarPartido({ ...base, visitante: ' cd tembleque fc ' }, ctx))).toMatch(/sí mismo/)
  })
  it('no se marca jugado antes de empezar', () => {
    expect(err(() => validarPartido({ ...base, fecha: '2026-10-17', hora: '18:00', jugado: true }, ctx))).toMatch(/todavía no ha empezado/)
    expect(err(() => validarPartido({ ...base, fecha: '2026-10-17', hora: '11:00', jugado: true }, ctx))).toBeNull()
  })
  it('fecha dentro de la temporada y hora con formato HH:MM', () => {
    expect(err(() => validarPartido({ ...base, fecha: '2030-01-01' }, ctx))).toMatch(/fuera de la temporada/)
    expect(err(() => validarPartido({ ...base, hora: '25:00' }, ctx))).toMatch(/HH:MM/)
    expect(err(() => validarPartido({ ...base, hora: "17:00'; drop table partidos;--" }, ctx))).toMatch(/HH:MM/)
  })
  it('goles entre 0 y 99', () => {
    expect(err(() => validarPartido({ ...base, goles_local: 100 }, ctx))).toMatch(/0 y 99/)
    expect(err(() => validarPartido({ ...base, goles_local: -1 }, ctx))).toMatch(/0 y 99/)
  })
  it('el rival no puede tener otro partido esa jornada', () => {
    const partidosLiga = [{ id: 1, jornada: 2, local_id: 12, visitante_id: 13 }]
    expect(err(() => validarPartido(base, { ...ctx, partidosLiga }))).toMatch(/Rival B ya juega/)
  })
  it('no se baja el resultado por debajo de los goles de las estadísticas', () => {
    const stats = [{ partido_id: 100, jugador_id: 4, goles: 2 }]
    expect(err(() => validarPartido({ ...partido, goles_local: 1 }, { ...ctx, id: 100, stats }))).toMatch(/suman más goles/)
  })
})

describe('marcado automático de «jugado»', () => {
  it('se marca cuando el partido ya terminó (inicio + duración)', () => {
    expect(debeMarcarseJugado({ fecha: '2026-10-17', hora: '10:00', jugado: false }, now, 90)).toBe(true)
    expect(debeMarcarseJugado({ fecha: '2026-10-17', hora: '11:00', jugado: false }, now, 90)).toBe(false)
  })
  it('sin hora, desde el día siguiente', () => {
    expect(debeMarcarseJugado({ fecha: '2026-10-17', jugado: false }, now)).toBe(false)
    expect(debeMarcarseJugado({ fecha: '2026-10-16', jugado: false }, now)).toBe(true)
  })
  it('nunca para partidos ya jugados, futuros o sin fecha', () => {
    expect(debeMarcarseJugado({ fecha: '2026-09-01', hora: '10:00', jugado: true }, now)).toBe(false)
    expect(debeMarcarseJugado({ fecha: '2026-12-01', hora: '10:00', jugado: false }, now)).toBe(false)
    expect(debeMarcarseJugado({ fecha: '', jugado: false }, now)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('liga (partidos entre otros equipos)', () => {
  const ctx = { partidosLiga: [{ id: 1, jornada: 1, local_id: 12, visitante_id: 13 }], partidos: [partido], equipos, temporada, now }
  it('un equipo juega una vez por jornada (también contra el club)', () => {
    expect(err(() => validarPartidoLiga({ jornada: 1, local_id: 14, visitante_id: 12 }, ctx))).toMatch(/Rival B ya juega/)
    expect(err(() => validarPartidoLiga({ jornada: 1, local_id: 14, visitante_id: 11 }, ctx))).toMatch(/Rival A ya juega/)
  })
  it('el club no se registra aquí y nadie juega contra sí mismo', () => {
    expect(err(() => validarPartidoLiga({ jornada: 3, local_id: 10, visitante_id: 12 }, ctx))).toMatch(/Partidos/)
    expect(err(() => validarPartidoLiga({ jornada: 3, local_id: 12, visitante_id: 12 }, ctx))).toMatch(/sí mismo/)
  })
  it('cada equipo recibe a otro una sola vez; la vuelta sí', () => {
    expect(err(() => validarPartidoLiga({ jornada: 5, local_id: 12, visitante_id: 13 }, ctx))).toMatch(/ya recibió/)
    expect(err(() => validarPartidoLiga({ jornada: 5, local_id: 13, visitante_id: 12 }, ctx))).toBeNull()
  })
  it('no se marca jugado con fecha futura; sin jugar, los goles quedan a 0', () => {
    expect(err(() => validarPartidoLiga({ jornada: 3, local_id: 12, visitante_id: 14, fecha: '2026-11-01', jugado: true }, ctx))).toMatch(/futura/)
    expect(validarPartidoLiga({ jornada: 3, local_id: 12, visitante_id: 14, goles_local: 5 }, ctx).goles_local).toBe(0)
  })
  it('goles entre 0 y 99 y jornada entre 1 y 99', () => {
    expect(err(() => validarPartidoLiga({ jornada: 3, local_id: 12, visitante_id: 14, jugado: true, goles_local: 100 }, ctx))).toMatch(/0 y 99/)
    expect(err(() => validarPartidoLiga({ jornada: 0, local_id: 12, visitante_id: 14 }, ctx))).toMatch(/1 y 99/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('cronología: minutos y forma de cada evento', () => {
  it('liga: del 1 al 90; amistoso: hasta 120 (prórroga)', () => {
    expect(limitesMinuto(partido, temporada).max).toBe(90)
    expect(limitesMinuto({ ...partido, amistoso: true }, temporada).max).toBe(120)
    expect(err(() => validarEvento(ev({ minuto: 0, tipo: 'amarilla', equipo: 'rival' }), ctxEvento()))).toMatch(/entre 1 y 90/)
    expect(err(() => validarEvento(ev({ minuto: 91, tipo: 'amarilla', equipo: 'rival' }), ctxEvento()))).toMatch(/90\+2/)
    expect(err(() => validarEvento(ev({ minuto: 90, minuto_extra: 4, tipo: 'amarilla', equipo: 'rival' }), ctxEvento()))).toBeNull()
  })
  it('el tiempo añadido solo al final de cada parte y como máximo 15', () => {
    expect(err(() => validarEvento(ev({ minuto: 45, minuto_extra: 3, tipo: 'amarilla', equipo: 'rival' }), ctxEvento()))).toBeNull()
    expect(err(() => validarEvento(ev({ minuto: 60, minuto_extra: 3, tipo: 'amarilla', equipo: 'rival' }), ctxEvento()))).toMatch(/final de cada parte/)
    expect(err(() => validarEvento(ev({ minuto: 90, minuto_extra: 16, tipo: 'amarilla', equipo: 'rival' }), ctxEvento()))).toMatch(/0 a 15/)
  })
  it('no se registran eventos antes de que empiece el partido', () => {
    const futuro = { ...partido, fecha: '2026-11-01', jugado: false }
    expect(err(() => validarEvento(ev({ minuto: 10, tipo: 'gol', equipo: 'rival' }), { ...ctxEvento(), partido: futuro }))).toMatch(/no ha empezado/)
  })
  it('quién va en cada tipo de evento', () => {
    expect(err(() => validarEvento(ev({ minuto: 50, tipo: 'gol', equipo: 'propio' }), ctxEvento()))).toMatch(/Indica el jugador/)
    expect(err(() => validarEvento(ev({ minuto: 50, tipo: 'gol', equipo: 'rival', jugador_id: 4 }), ctxEvento()))).toMatch(/rival no pueden/)
    expect(err(() => validarEvento(ev({ minuto: 50, tipo: 'cambio', equipo: 'propio', jugador_id: 5 }), ctxEvento()))).toMatch(/sale/)
    expect(err(() => validarEvento(ev({ minuto: 50, tipo: 'cambio', equipo: 'propio', jugador_id: 4, jugador2_id: 4 }), ctxEvento()))).toMatch(/mismo jugador/)
    expect(err(() => validarEvento(ev({ minuto: 50, tipo: 'amarilla', equipo: 'propio', jugador_id: 3, jugador2_id: 2 }), ctxEvento()))).toMatch(/segundo jugador/)
    expect(err(() => validarEvento(ev({ minuto: 50, tipo: 'gol_propia', equipo: 'rival' }), ctxEvento()))).toMatch(/propia puerta/)
  })
  it('solo jugadores convocados y existentes', () => {
    expect(err(() => validarEvento(ev({ minuto: 50, tipo: 'amarilla', equipo: 'propio', jugador_id: 6 }), ctxEvento()))).toMatch(/no está convocado/)
    expect(err(() => validarEvento(ev({ minuto: 50, tipo: 'amarilla', equipo: 'propio', jugador_id: 999 }), ctxEvento()))).toMatch(/no existe/)
  })
  it('nombre del rival: máximo 60 y sin caracteres de control', () => {
    expect(err(() => validarEvento(ev({ minuto: 50, tipo: 'gol', equipo: 'rival', nombre_rival: 'x'.repeat(61) }), ctxEvento()))).toMatch(/60/)
  })
})

describe('cronología: orden del partido', () => {
  const gol30 = ev({ minuto: 30, tipo: 'gol', equipo: 'propio', jugador_id: 4, jugador2_id: 3 })
  const amarilla45 = ev({ minuto: 45, minuto_extra: 3, tipo: 'amarilla', equipo: 'propio', jugador_id: 2 })
  it('dos amarillas simples al mismo jugador', () => {
    expect(err(() => validarEvento(ev({ minuto: 70, tipo: 'amarilla', equipo: 'propio', jugador_id: 2 }), ctxEvento([amarilla45])))).toMatch(/2ª amarilla/)
  })
  it('2ª amarilla sin amarilla previa', () => {
    expect(err(() => validarEvento(ev({ minuto: 70, tipo: 'segunda_amarilla', equipo: 'propio', jugador_id: 3 }), ctxEvento([amarilla45])))).toMatch(/no tiene una amarilla/)
  })
  it('un expulsado no vuelve a aparecer', () => {
    const segunda = ev({ minuto: 70, tipo: 'segunda_amarilla', equipo: 'propio', jugador_id: 2 })
    expect(err(() => validarEvento(ev({ minuto: 80, tipo: 'gol', equipo: 'propio', jugador_id: 2 }), ctxEvento([amarilla45, segunda])))).toMatch(/expulsado/)
    // same minute is allowed (e.g. a goal and then a card in the 70th)
    expect(err(() => validarEvento(ev({ minuto: 70, tipo: 'roja', equipo: 'propio', jugador_id: 3 }), ctxEvento([amarilla45, segunda])))).toBeNull()
  })
  it('cambios: sale quien está en el campo, entra quien no', () => {
    expect(err(() => validarEvento(ev({ minuto: 60, tipo: 'cambio', equipo: 'propio', jugador_id: 3, jugador2_id: 4 }), ctxEvento([gol30])))).toMatch(/ya estaba en el campo/)
    expect(err(() => validarEvento(ev({ minuto: 60, tipo: 'cambio', equipo: 'propio', jugador_id: 4, jugador2_id: 5 }), ctxEvento([gol30])))).toMatch(/no estaba en el campo/)
  })
  it('el sustituido ya no marca; el que entra sí', () => {
    const cambio = ev({ minuto: 60, tipo: 'cambio', equipo: 'propio', jugador_id: 5, jugador2_id: 4 })
    expect(err(() => validarEvento(ev({ minuto: 75, tipo: 'gol', equipo: 'propio', jugador_id: 4 }), ctxEvento([gol30, cambio])))).toMatch(/no estaba en el campo en el 75'/)
    expect(err(() => validarEvento(ev({ minuto: 75, tipo: 'gol', equipo: 'propio', jugador_id: 5 }), ctxEvento([gol30, cambio])))).toBeNull()
  })
  it('las tarjetas pueden ser para suplentes en el banquillo', () => {
    expect(err(() => validarEvento(ev({ minuto: 20, tipo: 'amarilla', equipo: 'propio', jugador_id: 5 }), ctxEvento()))).toBeNull()
  })
  it('no se borra la amarilla de la que depende una 2ª amarilla', () => {
    const segunda = ev({ minuto: 70, tipo: 'segunda_amarilla', equipo: 'propio', jugador_id: 2 })
    expect(err(() => validarBorrarEvento(amarilla45.id, { eventos: [amarilla45, segunda], alineacion, jugadores }))).toMatch(/No se puede borrar/)
  })
  it('sin alineación guardada no se comprueba quién está en el campo', () => {
    expect(timelineIssue([ev({ minuto: 10, tipo: 'cambio', equipo: 'propio', jugador_id: 5, jugador2_id: 4 })], [])).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('alineación y convocatoria', () => {
  const ctx = { partido, jugadores, eventos: [] }
  it('alineación válida', () => { expect(err(() => validarAlineacion('4-4-2', alineacion.jugadores, ctx))).toBeNull() })
  it('formación desconocida, más de 11 posiciones o claves extra', () => {
    expect(err(() => validarAlineacion('9-9-9', alineacion.jugadores, ctx))).toMatch(/Formación/)
    const doce = Array.from({ length: 12 }, (_, i) => slot(1, i % 10, null))
    expect(err(() => validarAlineacion('4-4-2', doce, ctx))).toMatch(/11/)
    expect(err(() => validarAlineacion('4-4-2', [{ ...slot(0, 0, 1), x: '<script>' }], ctx))).toMatch(/no válidas/)
    expect(err(() => validarAlineacion('4-4-2', [slot(0, 0, '1')], ctx))).toMatch(/no válidas/)
  })
  it('jugador repetido, misma posición o no convocado', () => {
    expect(err(() => validarAlineacion('4-4-2', [slot(0, 0, 1), slot(1, 0, 1)], ctx))).toMatch(/dos veces/)
    expect(err(() => validarAlineacion('4-4-2', [slot(1, 0, 2), slot(1, 0, 3)], ctx))).toMatch(/misma posición/)
    expect(err(() => validarAlineacion('4-4-2', [slot(0, 0, 6)], ctx))).toMatch(/no está convocado/)
  })
  it('la alineación no puede contradecir la cronología', () => {
    const eventos = [ev({ minuto: 30, tipo: 'gol', equipo: 'propio', jugador_id: 4 })]
    expect(err(() => validarAlineacion('4-4-2', [slot(0, 0, 1), slot(1, 0, 2)], { ...ctx, eventos }))).toMatch(/no cuadra/)
  })
  it('convocatoria: listas maliciosas', () => {
    for (const bad of ['"1"', [1, 1], [999], [-1], [1.5], [{ id: 1 }], Array.from({ length: 51 }, (_, i) => i + 1)]) {
      expect(err(() => validarConvocados(bad, { jugadores }))).not.toBeNull()
    }
  })
  it('no se quita de la convocatoria a quien ya tiene eventos o estadísticas', () => {
    const eventos = [ev({ minuto: 30, tipo: 'gol', equipo: 'propio', jugador_id: 4 })]
    expect(err(() => validarConvocados([1, 2, 3], { jugadores, eventos }))).toMatch(/Delantero Nueve/)
    expect(err(() => validarConvocados([], { jugadores, eventos }))).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('estadísticas', () => {
  const ctx = (o = {}) => ({ partido, temporada, eventos: [], alineacion, stats: [], jugadores, ...o })
  const row = (o) => ({ jugador_id: 4, partido_id: 100, minutos: 0, titular: false, goles: 0, asistencias: 0, tarjetas_amarillas: 0, tarjetas_rojas: 0, paradas: 0, goles_encajados: 0, ...o })
  it('coherentes con la cronología', () => {
    const eventos = [ev({ minuto: 30, tipo: 'gol', equipo: 'propio', jugador_id: 4, jugador2_id: 3 })]
    expect(err(() => validarEstadistica(row({ minutos: 90, titular: true, goles: 1 }), ctx({ eventos })))).toBeNull()
    expect(err(() => validarEstadistica(row({ minutos: 90, titular: true, goles: 2 }), ctx({ eventos })))).toMatch(/coincidir con la cronología/)
  })
  it('minutos: no más que la duración, y solo si jugó', () => {
    expect(err(() => validarEstadistica(row({ minutos: 91, titular: true }), ctx()))).toMatch(/entre 0 y 90/)
    expect(err(() => validarEstadistica(row({ jugador_id: 5, minutos: 30 }), ctx()))).toMatch(/ni entró en un cambio/)
    expect(err(() => validarEstadistica(row({ minutos: 10, titular: true }), ctx({ partido: { ...partido, jugado: false } })))).toMatch(/sin jugar/)
  })
  it('titular solo si está en la alineación', () => {
    expect(err(() => validarEstadistica(row({ jugador_id: 5, titular: true }), ctx()))).toMatch(/titular/)
  })
  it('tarjetas: máximo 2 amarillas y 1 roja; dos amarillas = expulsión', () => {
    expect(err(() => validarEstadistica(row({ tarjetas_amarillas: 3 }), ctx()))).toMatch(/2 amarillas/)
    expect(err(() => validarEstadistica(row({ tarjetas_amarillas: 2 }), ctx()))).toMatch(/expulsión/)
    expect(err(() => validarEstadistica(row({ tarjetas_amarillas: 2, tarjetas_rojas: 1 }), ctx()))).toBeNull()
  })
  it('sin cronología, los goles no superan el resultado', () => {
    const stats = [{ partido_id: 100, jugador_id: 3, goles: 2, asistencias: 0 }]
    expect(err(() => validarEstadistica(row({ goles: 1 }), ctx({ stats })))).toMatch(/más goles/)
    expect(err(() => validarEstadistica(row({ goles_encajados: 2, jugador_id: 1 }), ctx()))).toMatch(/solo encajó 1/)
  })
  it('valores negativos o no enteros', () => {
    expect(err(() => validarEstadistica(row({ goles: -1 }), ctx()))).toMatch(/entre 0 y 99/)
    expect(err(() => validarEstadistica(row({ goles: 1.5 }), ctx()))).toMatch(/enteros/)
  })
  it('jugadores no convocados no suman nada', () => {
    expect(err(() => validarEstadistica(row({ jugador_id: 6, paradas: 2 }), ctx()))).toMatch(/no está convocado/)
    expect(err(() => validarEstadistica(row({ jugador_id: 6 }), ctx()))).toBeNull()
  })
})

describe('votos MVP', () => {
  const votante = jugadores[0]
  it('voto válido', () => { expect(err(() => validarVoto({ partido, votante, votadoId: 3, jugadores }))).toBeNull() })
  it('no a uno mismo, ni a quien no participó, ni en partido sin jugar, ni si no está en activo', () => {
    expect(err(() => validarVoto({ partido, votante, votadoId: 1, jugadores }))).toMatch(/ti mismo/)
    expect(err(() => validarVoto({ partido, votante, votadoId: 6, jugadores }))).toMatch(/no participó/)
    expect(err(() => validarVoto({ partido: { ...partido, jugado: false }, votante, votadoId: 3, jugadores }))).toMatch(/ya jugados/)
    expect(err(() => validarVoto({ partido, votante: jugadores[6], votadoId: 3, jugadores }))).toMatch(/en activo/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('las listas coinciden con la base de datos y la interfaz', () => {
  const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20261017180000_data_integrity.sql'), 'utf8')
  const lineupUi = readFileSync(join(process.cwd(), 'src/components/Alineacion.jsx'), 'utf8')
  it('formaciones', () => {
    const ui = [...lineupUi.matchAll(/^\s+'(\d(?:-\d)+)': \[/gm)].map((m) => m[1])
    expect(ui).toEqual(FORMACIONES_VALIDAS)
    for (const f of FORMACIONES_VALIDAS) expect(migration.includes(`'${f}'`)).toBe(true)
  })
  it('estados y posiciones', () => {
    for (const e of ESTADOS_JUGADOR) expect(migration.includes(`'${e}'`)).toBe(true)
    expect(Object.keys(ESTADOS)).toEqual(ESTADOS_JUGADOR)
    expect(POSICIONES_UI).toEqual(POSICIONES)
    expect(POSICIONES).toEqual(['Portero', 'Defensa', 'Centrocampista', 'Delantero'])
  })
})

describe('candidatos al MVP', () => {
  const now = new Date('2026-10-20T20:00:00Z')
  const jugadores = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, nombre: `Jugador ${id}` }))
  const partido = { id: 1, fecha: '2026-10-20', convocados: [1, 2, 3, 4, 5, 6] }
  const elegir = (ids, p = partido) => validarFinalistas(ids, { partido: p, jugadores })

  it('5 de los convocados', () => {
    expect(elegir([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5])
    expect(candidatosNecesarios(partido)).toBe(5)
  })
  it('ni más ni menos de 5', () => {
    expect(() => elegir([1, 2, 3, 4])).toThrow('Elige 5 candidatos al MVP (has elegido 4).')
    expect(() => elegir([1, 2, 3, 4, 5, 6])).toThrow('como máximo 5')
  })
  it('con menos de 5 convocados, todos', () => {
    const p = { ...partido, convocados: [1, 2, 3] }
    expect(candidatosNecesarios(p)).toBe(3)
    expect(elegir([1, 2, 3], p)).toEqual([1, 2, 3])
    expect(() => elegir([1, 2], p)).toThrow('Elige 3 candidatos')
  })
  it('solo convocados, sin repetidos ni identificadores raros', () => {
    expect(() => elegir([1, 2, 3, 4, 7])).toThrow('Jugador 7 es candidato al MVP y tiene que estar convocado.')
    expect(() => elegir([1, 1, 2, 3, 4])).toThrow('repetidos')
    expect(() => elegir([1, 2, 3, 4, 'x'])).toThrow('no válidos')
    expect(() => elegir('1,2,3')).toThrow('no es válida')
  })
  it('vacío = sin elegir', () => {
    expect(elegir([])).toBeNull()
    expect(elegir(null)).toBeNull()
  })
  it('marcar como jugado exige los candidatos mientras la votación estaría abierta', () => {
    expect(() => exigirFinalistas({ ...partido, jugado: true }, now)).toThrow('Elige los 5 candidatos al MVP antes de marcar el partido como jugado.')
    expect(() => exigirFinalistas({ ...partido, jugado: true, convocados: [] }, now)).toThrow('haz la convocatoria')
    expect(() => exigirFinalistas({ ...partido, jugado: true, mvp_finalistas: [1, 2, 3, 4, 5] }, now)).not.toThrow()
  })
  it('un partido antiguo (votación ya cerrada) no los necesita', () => {
    expect(necesitaCandidatos({ ...partido, fecha: '2026-10-10' }, now)).toBe(false)
    expect(() => exigirFinalistas({ ...partido, fecha: '2026-10-10', jugado: true }, now)).not.toThrow()
  })
})
