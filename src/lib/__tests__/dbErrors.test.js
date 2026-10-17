import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { friendlyDbMessage, messageFor, dbError, CONSTRAINT_MESSAGES, GENERIC_MESSAGE } from '../dbErrors'
import { ValidationError } from '../validation'

// Words that would reveal how the database is built
const INTERNAL = /(public\.|validacion\.|relation|constraint|violates|duplicate key|select |insert |jsonb|_fkey|_key\b|_check\b|_rango\b|stack)/i

describe('errores de la base de datos → mensajes para personas', () => {
  it('las validaciones del servidor (CD400) se muestran tal cual', () => {
    const e = { code: 'CD400', message: 'Defensa Dos no puede aparecer en el 80\': ya había sido expulsado.', hint: 'cronologia_expulsado' }
    expect(friendlyDbMessage(e)).toBe(e.message)
  })
  it('las restricciones se traducen por su nombre', () => {
    expect(friendlyDbMessage({ code: '23505', message: 'duplicate key value violates unique constraint "jugadores_dorsal_unico"', details: 'Key (dorsal)=(9) already exists.' }))
      .toBe('Ese dorsal ya lo lleva otro jugador en activo.')
    expect(friendlyDbMessage({ code: '23514', message: 'new row for relation "estadisticas" violates check constraint "estadisticas_doble_amarilla_expulsa"' }))
      .toMatch(/expulsión/)
  })
  it('una restricción desconocida no muestra su nombre ni la tabla', () => {
    const msg = friendlyDbMessage({ code: '23514', message: 'new row for relation "secreta" violates check constraint "secreta_x"', details: 'Failing row contains (1, hola).' })
    expect(INTERNAL.test(msg)).toBe(false)
    expect(msg.includes('secreta')).toBe(false)
    expect(msg.includes('hola')).toBe(false)
  })
  it('claves foráneas: al crear y al borrar', () => {
    expect(friendlyDbMessage({ code: '23503', message: 'insert or update on table "eventos_partido" violates foreign key constraint "eventos_partido_jugador_id_fkey"', details: 'Key (jugador_id)=(999) is not present in table "jugadores".' }))
      .toMatch(/ya no existe/)
    expect(friendlyDbMessage({ code: '23503', message: 'update or delete on table "temporadas" violates foreign key constraint "partidos_temporada_id_fkey" on table "partidos"', details: 'Key (id)=(1) is still referenced from table "partidos".' }))
      .toMatch(/No se puede borrar/)
  })
  it('permisos, sesión caducada, formato y red', () => {
    expect(friendlyDbMessage({ code: '42501', message: 'new row violates row-level security policy for table "partidos"' })).toMatch(/permiso/)
    expect(friendlyDbMessage({ code: 'PGRST301', message: 'JWT expired' })).toMatch(/caducado/)
    expect(friendlyDbMessage({ code: '22P02', message: 'invalid input syntax for type integer: "abc"' })).toMatch(/formato/)
    expect(friendlyDbMessage(new TypeError('Failed to fetch'))).toMatch(/conexión/)
  })
  it('cualquier otra cosa: mensaje genérico', () => {
    expect(friendlyDbMessage({ code: 'XX000', message: 'internal error at plpgsql line 42' })).toBe(GENERIC_MESSAGE)
    expect(friendlyDbMessage(null)).toBe(GENERIC_MESSAGE)
  })
  it('dbError guarda el error original solo para la consola', () => {
    const raw = { code: '23505', message: 'duplicate key value violates unique constraint "temporadas_nombre_unico"' }
    const original = console.error
    console.error = () => {}
    const e = dbError('insert', 'temporadas', raw)
    console.error = original
    expect(e.message).toBe('Ya existe una temporada con ese nombre.')
    expect(e.cause).toBe(raw)
    expect(messageFor(e)).toBe(e.message)
  })
  it('messageFor oculta errores de programación y muestra los de validación', () => {
    expect(messageFor(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(GENERIC_MESSAGE)
    expect(messageFor(new ValidationError('El dorsal debe ser un número del 1 al 99.'))).toMatch(/dorsal/)
  })
  it('ningún mensaje traducido revela detalles internos', () => {
    for (const msg of Object.values(CONSTRAINT_MESSAGES)) expect(INTERNAL.test(msg)).toBe(false)
  })
})

describe('cada regla de la base de datos tiene su mensaje', () => {
  it('restricciones e índices únicos de la migración de integridad', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261017180000_data_integrity.sql'), 'utf8')
    const names = [
      ...[...sql.matchAll(/add constraint (\w+)/g)].map((m) => m[1]),
      ...[...sql.matchAll(/create unique index (\w+)/g)].map((m) => m[1]),
    ]
    expect(names.length > 30).toBe(true)
    expect(names.filter((n) => !CONSTRAINT_MESSAGES[n])).toEqual([])
  })
})
