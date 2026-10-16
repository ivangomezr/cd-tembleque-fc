/**
 * Club configuration — single place to change names, competition and branding.
 */
export const CLUB = {
  name: 'CD Tembleque FC',
  shortName: 'Tembleque',
  initials: 'CDT',
  crest: '/escudo.png',
  homeGround: 'Campo Municipal de Tembleque',
}

export const COMPETITION = {
  name: 'Segunda Autonómica',
  region: 'Castilla-La Mancha',
  group: 'Grupo 4',
  season: '2026/27',
  /** Regulation match length in minutes (used to compute minutes played). */
  matchDuration: 90,
  /** Players on the pitch per side. */
  playersPerSide: 11,
}

export const COMPETITION_LABEL = `${COMPETITION.name} · ${COMPETITION.group}`
export const COMPETITION_FULL = `${COMPETITION.name} CLM · ${COMPETITION.group} · ${COMPETITION.season}`

/** Prefix for every localStorage key (avoids clashes with other apps on localhost). */
export const STORAGE_PREFIX = 'cdt_'

// Backwards-compatible aliases used across the codebase
export const EQUIPO_NOMBRE = CLUB.name
