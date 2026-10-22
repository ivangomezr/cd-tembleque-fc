/**
 * Club configuration — single place to change names, competition and branding.
 */
export const CLUB = {
  name: 'CD Tembleque FC',
  shortName: 'Tembleque',
  initials: 'CDT',
  crest: '/escudo.png',
  /** Width / height of public/escudo.png (383 × 512). Keeps every crest box in proportion. */
  crestRatio: 383 / 512,
  homeGround: 'Campo Municipal de Tembleque',
  /** Team photo for the home header (public/img, generated from the original at 640 and 1200 px). */
  photo: {
    webp640: '/img/equipo-640.webp',
    webp1200: '/img/equipo-1200.webp',
    jpg: '/img/equipo-1200.jpg',
    alt: 'Plantilla del CD Tembleque FC posando en el campo',
  },
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

/**
 * Club kits. `equipacion` on each match stores one of these keys.
 * Colours sampled from the 2026/27 shirts.
 */
export const KITS = {
  local: {
    label: 'Local',
    description: 'Azul',
    body: ['#0a56c8', '#0042a6'],        // top → bottom
    trim: '#ffffff',
    number: '#ffffff',
    numberStroke: '#01153A',
    pattern: 'slashes',                  // white diagonal lines, lower right
  },
  visitante: {
    label: 'Visitante',
    description: 'Rosa',
    body: ['#f3005a', '#f3005a', '#b3168c', '#3f6fd8'], // left → right gradient
    bodyDirection: 'horizontal',
    trim: '#ffffff',
    number: '#ffffff',
    numberStroke: '#9a0040',
    pattern: null,
  },
}
export const DEFAULT_KIT = 'local'

/**
 * Goalkeeper shirt that goes with each kit (same key as KITS), used for the
 * goalkeeper in the starting line-up.
 *  - Local: yellow body (#FAC614); the white details become the home blue.
 *  - Visitante: the pink becomes green (#A2BE7D), the blue stays; the pink
 *    tones of the blend and of the number outline follow the green.
 */
export const GK_KITS = {
  local: {
    label: 'Portero local',
    body: ['#FAC614', '#FAC614'],
    trim: KITS.local.body[0],
    number: KITS.local.body[0],
    numberStroke: '#01153A',
    pattern: 'slashes',
  },
  visitante: {
    label: 'Portero visitante',
    body: ['#A2BE7D', '#A2BE7D', '#7197AB', '#3f6fd8'],
    bodyDirection: 'horizontal',
    trim: '#ffffff',
    number: '#ffffff',
    numberStroke: '#4f6b33',
    pattern: null,
  },
}

/** Prefix for every localStorage key (avoids clashes with other apps on localhost). */
export const STORAGE_PREFIX = 'cdt_'

// Backwards-compatible aliases used across the codebase
export const EQUIPO_NOMBRE = CLUB.name
