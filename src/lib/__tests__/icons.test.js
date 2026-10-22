import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ICONS, FILLED } from '../icons'

// Pictographic emoji (the ones that look different on iOS, Android and Windows)
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/u

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p)
  return /\.(jsx?|tsx?)$/.test(f) ? [p] : []
})
const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const fuentes = files(join(process.cwd(), 'src')).map((p) => ({ p, src: readFileSync(p, 'utf8') }))

describe('iconos', () => {
  it('la interfaz no usa emojis: todos los iconos son SVG de components/Icon.jsx', () => {
    const conEmoji = fuentes
      .flatMap(({ p, src }) => sinComentarios(src).split('\n').map((l, i) => ({ p, i: i + 1, l })))
      .filter(({ l }) => EMOJI.test(l))
      .map(({ p, i, l }) => `${p.replace(process.cwd(), '')}:${i} ${l.trim().slice(0, 80)}`)
    expect(conEmoji).toEqual([])
  })
  it('cada <Icon name="…"> existe en el set', () => {
    const usados = new Set(fuentes.flatMap(({ src }) => [...src.matchAll(/<Icon[^>]*?\bname="([^"]+)"/g)].map((m) => m[1])))
    // names chosen in data: icon: 'x' / icono: 'x' / name={cond ? 'a' : 'b'}
    for (const { src } of fuentes) {
      for (const m of src.matchAll(/\bicono?: '([a-z-]+)'/g)) usados.add(m[1])
      for (const m of src.matchAll(/<Icon[^>]*?\bname=\{[^}]*\}/g)) for (const n of m[0].matchAll(/[?:]\s*'([a-z][a-z-]+)'/g)) usados.add(n[1])
    }
    const faltan = [...usados].filter((n) => !ICONS[n] && !['yellow', 'red', 'second-yellow'].includes(n))
    expect(faltan).toEqual([])
    expect(usados.size > 30).toBe(true)
  })
  it('los iconos rellenos están en el set', () => {
    for (const n of FILLED) expect(!!ICONS[n]).toBe(true)
  })
})
