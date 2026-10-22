import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Visitors (anon) can only read the player columns granted one by one in the
// migrations. If the app asks for a column that isn't granted, the request
// fails or the value never comes back after a reload.
const root = process.cwd()
const store = readFileSync(join(root, 'src/lib/store.js'), 'utf8')
const pedidas = store.match(/JUGADOR_PUBLIC_COLUMNS = '([^']+)'/)[1].split(',').map((c) => c.trim())
const migraciones = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n')
const concedidas = new Set([...migraciones.matchAll(/grant select\s*\(([^)]+)\)\s*on public\.jugadores to anon/gi)]
  .flatMap((m) => m[1].split(',').map((c) => c.trim())))

describe('columnas públicas de jugadores', () => {
  it('cada columna que la app lee para los visitantes está concedida a anon', () => {
    expect(pedidas.filter((c) => !concedidas.has(c))).toEqual([])
  })
  it('incluye la capitanía', () => {
    expect(pedidas.includes('capitania')).toBe(true)
  })
})
