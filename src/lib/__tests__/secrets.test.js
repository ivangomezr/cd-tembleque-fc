import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Everything under src/ ends up in the public bundle. Make sure no privileged
// credential or service-role usage can sneak in.
const files = []
;(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { if (f !== '__tests__') walk(p) }
    else if (/\.(jsx?|tsx?)$/.test(f)) files.push(p)
  }
})(join(process.cwd(), 'src'))

describe('frontend never uses privileged credentials', () => {
  it('scans the frontend sources', () => {
    expect(files.length > 10).toBe(true)
  })
  for (const pattern of [/service_role/i, /SERVICE_ROLE/, /sb_secret_/, /VITE_[A-Z_]*SECRET_KEY/]) {
    it(`no match for ${pattern}`, () => {
      const hits = files.filter((f) => pattern.test(readFileSync(f, 'utf8')))
      expect(hits).toEqual([])
    })
  }
  it('.env.example exposes no service key to the browser', () => {
    const env = readFileSync(join(process.cwd(), '.env.example'), 'utf8')
    expect(/^VITE_.*(SERVICE|SECRET_KEY)/m.test(env)).toBe(false)
  })
})
