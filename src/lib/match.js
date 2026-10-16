import { CLUB } from '../config/club'

/** True when our club is the home side of the match. */
export const isHome = (p) => p?.local === CLUB.name

/** Rival name for one of our matches. */
export const rivalName = (p) => (isHome(p) ? p.visitante : p.local)

/** Goals scored / conceded from our point of view. */
export function ourScore(p) {
  const home = isHome(p)
  return {
    nuestros: Number(home ? p.goles_local : p.goles_visitante) || 0,
    rivales: Number(home ? p.goles_visitante : p.goles_local) || 0,
  }
}

/** 'victoria' | 'empate' | 'derrota' | null (not played). */
export function matchResult(p) {
  if (!p?.jugado) return null
  const { nuestros, rivales } = ourScore(p)
  return nuestros > rivales ? 'victoria' : nuestros < rivales ? 'derrota' : 'empate'
}

export const RESULT_COLORS = {
  victoria: '#1f9d55',
  empate: '#d69e2e',
  derrota: '#c0392b',
}

export const teamInitials = (name = '?') =>
  name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

/**
 * Both sides of a match, already ordered home → away, with crest URLs.
 * `crestFor(name)` resolves a crest for a rival from the league teams.
 */
export function matchSides(p, crestFor = () => null) {
  const rivalCrest = p.escudo_rival_url || crestFor(rivalName(p)) || null
  const us = { name: CLUB.name, crest: CLUB.crest, ours: true }
  const them = { name: rivalName(p), crest: rivalCrest, ours: false }
  return isHome(p)
    ? { home: us, away: them, homeGoals: p.goles_local, awayGoals: p.goles_visitante }
    : { home: them, away: us, homeGoals: p.goles_local, awayGoals: p.goles_visitante }
}

/** Parse "YYYY-MM-DD" + "HH:MM" as local time. */
export function kickoff(p) {
  if (!p?.fecha) return null
  return new Date(`${p.fecha}T${p.hora || '23:59'}:00`)
}
