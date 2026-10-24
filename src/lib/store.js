/**
 * Store — talks to Supabase when the env vars are set, otherwise falls back to
 * localStorage so the app can be developed and demoed without a backend.
 *
 * Getters are synchronous and read from an in-memory cache; mutations are async,
 * update the cache and notify subscribers (see hooks/useStore.js).
 */
import { supabase, SUPABASE_READY } from './supabase'
import { CLUB, COMPETITION, STORAGE_PREFIX, DEFAULT_KIT } from '../config/club'
import { computePlayerMinutes, statsFromEvents, startersFromLineup } from './timeline'
import { computeStandings, ownMatchesAsResults } from './standings'
import { dbError } from './dbErrors'
import { mvpCierre, votacionAbierta, candidatosMvp, ganadorMvp } from './mvp'
import {
  ValidationError, validarJugador, validarTemporada, validarEquipo, validarPartido, validarPartidoLiga,
  validarConvocados, validarMvp, validarAlineacion, validarEvento, validarBorrarEvento, validarEstadistica,
  validarVoto, textoOk, urlOk, validarFinalistas, exigirFinalistas, validarCapitan,
} from './validation'
import { estadoCierre } from './cierre'

const USE_SUPABASE = SUPABASE_READY

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────────────────────────────────────
const key = (k) => STORAGE_PREFIX + k
function load(k, fallback) {
  try { const v = localStorage.getItem(key(k)); return v ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function save(k, val) {
  try { localStorage.setItem(key(k), JSON.stringify(val)) } catch { /* quota / private mode */ }
}
const nextId = (rows) => Math.max(0, ...rows.map((r) => Number(r.id) || 0)) + 1
const matches = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v)

/**
 * Tiny data adapter with the same API for Supabase and localStorage.
 * `where` is an equality filter object, e.g. { partido_id: 3 }.
 */
const db = {
  async select(table, where = {}, columns = '*') {
    if (USE_SUPABASE) {
      let q = supabase.from(table).select(columns)
      Object.entries(where).forEach(([k, v]) => { q = v === null ? q.is(k, null) : q.eq(k, v) })
      const { data, error } = await q
      if (error) console.error(`[db] select ${table}`, error)
      return data || []
    }
    return load(table, []).filter((r) => matches(r, where))
  },
  async insert(table, row) {
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from(table).insert(row).select().single()
      if (error) throw dbError('insert', table, error)
      return data
    }
    const rows = load(table, [])
    const created = { id: nextId(rows), created_at: new Date().toISOString(), ...row }
    save(table, [...rows, created])
    return created
  },
  async update(table, where, patch) {
    if (USE_SUPABASE) {
      let q = supabase.from(table).update(patch)
      Object.entries(where).forEach(([k, v]) => { q = q.eq(k, v) })
      const { error } = await q
      if (error) throw dbError('update', table, error)
      return
    }
    save(table, load(table, []).map((r) => (matches(r, where) ? { ...r, ...patch } : r)))
  },
  async upsert(table, rows, conflictKeys) {
    if (!rows.length) return []
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from(table).upsert(rows, { onConflict: conflictKeys.join(',') }).select()
      if (error) throw dbError('upsert', table, error)
      return data || []
    }
    let all = load(table, [])
    const out = []
    for (const row of rows) {
      const where = Object.fromEntries(conflictKeys.map((k) => [k, row[k]]))
      const existing = all.find((r) => matches(r, where))
      if (existing) {
        const merged = { ...existing, ...row }
        all = all.map((r) => (r === existing ? merged : r))
        out.push(merged)
      } else {
        const created = { id: nextId(all), created_at: new Date().toISOString(), ...row }
        all.push(created)
        out.push(created)
      }
    }
    save(table, all)
    return out
  },
  async remove(table, where) {
    if (USE_SUPABASE) {
      let q = supabase.from(table).delete()
      Object.entries(where).forEach(([k, v]) => { q = q.eq(k, v) })
      const { error } = await q
      if (error) throw dbError('delete', table, error)
      return
    }
    save(table, load(table, []).filter((r) => !matches(r, where)))
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache
// ─────────────────────────────────────────────────────────────────────────────
let _jugadores = []
let _partidos = []
let _stats = []
let _equipos = []      // league teams of the active season
let _partidosLiga = [] // league fixtures between OTHER teams
let _temporadaActiva = null
let _privado = new Map() // jugador_id → estado_desc (members only)

let listeners = []
const notify = () => listeners.forEach((fn) => fn())
const tid = () => _temporadaActiva?.id ?? null

// ─────────────────────────────────────────────────────────────────────────────
// Activity log
// ─────────────────────────────────────────────────────────────────────────────
// Who is acting, for the local (no-Supabase) log only. With Supabase the actor is
// set on the server from the JWT (trigger activity_log_actor) and cannot be spoofed.
let actorProvider = () => null
export function setActorProvider(fn) { actorProvider = fn }

async function log(accion, entidad, detalle = '') {
  const entrada = { accion, entidad, detalle: detalle || '', temporada_id: tid() }
  try {
    if (USE_SUPABASE) {
      const { error } = await supabase.from('activity_log').insert(entrada)
      if (error) console.warn('[log]', error.message)
    } else {
      const actor = actorProvider()
      save('activity_log', [{ id: Date.now(), ...entrada, jugador_id: actor?.jugador_id ?? null, jugador_nombre: actor?.nombre || 'Local', created_at: new Date().toISOString() }, ...load('activity_log', [])].slice(0, 200))
    }
  } catch (e) { console.error('[log]', e) }
}

const normalizeStat = (s) => ({
  ...s,
  goles: s.goles || 0,
  asistencias: s.asistencias || 0,
  tarjetas_amarillas: s.tarjetas_amarillas || 0,
  tarjetas_rojas: s.tarjetas_rojas || 0,
  paradas: s.paradas || 0,
  goles_encajados: s.goles_encajados || 0,
  minutos: s.minutos || 0,
  titular: !!s.titular,
})

/** Columns of `jugadores` readable by visitors (see migration 20261017120000_db_hardening). */
/** Player columns anyone may read (must match the column grants for anon in the migrations). */
export const JUGADOR_PUBLIC_COLUMNS = 'id, nombre, posicion, dorsal, foto_url, estado, activo, created_at, capitania'

const sortEquipos = (list) => [...list].sort((a, b) => a.nombre.localeCompare(b.nombre))

// ─────────────────────────────────────────────────────────────────────────────
// Public store
// ─────────────────────────────────────────────────────────────────────────────
export const store = {
  subscribe(fn) {
    listeners.push(fn)
    return () => { listeners = listeners.filter((l) => l !== fn) }
  },

  // ── Getters ────────────────────────────────────────────────────────────────
  getJugadores: () => [..._jugadores],
  getPartidos: () => [..._partidos],
  getStats: () => [..._stats],
  getEquipos: () => [..._equipos],
  getPartidosLiga: () => [..._partidosLiga],
  getTemporadaActiva: () => _temporadaActiva,
  getStatsPartido: (partido_id) => _stats.filter((s) => s.partido_id === partido_id),

  /** Crest of a league team by name (used for rivals without an uploaded crest). */
  crestFor(name) {
    if (!name) return null
    const n = name.trim().toLowerCase()
    return _equipos.find((e) => e.nombre.trim().toLowerCase() === n)?.escudo_url || null
  },

  // ── Init ───────────────────────────────────────────────────────────────────
  async init() {
    await store.initTemporada()
    const filtro = tid() ? { temporada_id: tid() } : {}
    const [jugadores, partidos, stats, equipos, partidosLiga] = await Promise.all([
      db.select('jugadores', {}, JUGADOR_PUBLIC_COLUMNS), // players are global; private data loaded separately
      db.select('partidos', filtro),
      db.select('estadisticas', filtro),
      db.select('equipos_liga', filtro),
      db.select('partidos_liga', filtro),
    ])
    _jugadores = jugadores.map((j) => ({ ...j, estado: j.estado || 'disponible', estado_desc: j.estado_desc || _privado.get(j.id) || null }))
    _partidos = partidos.map((p) => ({ ...p, jugado: !!p.jugado, convocados: p.convocados || [], equipacion: p.equipacion || DEFAULT_KIT }))
    _stats = stats.map(normalizeStat)
    _equipos = sortEquipos(equipos)
    _partidosLiga = partidosLiga
    await store.ensureOwnTeam()
    notify()
  },

  // ── Seasons ────────────────────────────────────────────────────────────────
  async getTemporadas() {
    const list = await db.select('temporadas')
    return list.sort((a, b) => (b.año || 0) - (a.año || 0))
  },

  async initTemporada() {
    let temps = await db.select('temporadas', { activa: true })
    if (!temps.length && !USE_SUPABASE) {
      const created = await db.insert('temporadas', {
        nombre: `${COMPETITION.name} ${COMPETITION.season}`,
        año: new Date().getFullYear(),
        activa: true,
        zona_ascenso: 1,
        zona_promocion: 1,
        zona_descenso: 0,
      })
      temps = [created]
    }
    _temporadaActiva = temps[0] || null
    return _temporadaActiva
  },

  async updateTemporada(id, patch) {
    const zonas = ['zona_ascenso', 'zona_promocion', 'zona_descenso'].some((k) => k in patch)
    patch = validarTemporada(patch, { numEquipos: zonas ? _equipos.length : null })
    await db.update('temporadas', { id }, patch)
    if (_temporadaActiva?.id === id) _temporadaActiva = { ..._temporadaActiva, ...patch }
    await log('Editó', 'Temporada', _temporadaActiva?.nombre)
    notify()
  },

  async cerrarTemporadaYCrearNueva(nombreNueva, añoNuevo) {
    ;({ nombre: nombreNueva } = validarTemporada({ nombre: nombreNueva, año: añoNuevo }, { temporadas: await store.getTemporadas() }))
    const prev = _temporadaActiva
    await db.update('temporadas', { activa: true }, { activa: false })
    const nueva = await db.insert('temporadas', {
      nombre: nombreNueva,
      año: añoNuevo,
      activa: true,
      zona_ascenso: prev?.zona_ascenso ?? 1,
      zona_promocion: prev?.zona_promocion ?? 1,
      zona_descenso: prev?.zona_descenso ?? 0,
    })
    _temporadaActiva = nueva
    _partidos = []
    _stats = []
    _equipos = []
    _partidosLiga = []
    await store.ensureOwnTeam()
    await log('Nueva temporada', 'Temporada', nombreNueva)
    notify()
    return nueva
  },

  async getDatosTemporada(temporada_id) {
    const [partidos, stats, equipos, partidosLiga] = await Promise.all([
      db.select('partidos', { temporada_id }),
      db.select('estadisticas', { temporada_id }),
      db.select('equipos_liga', { temporada_id }),
      db.select('partidos_liga', { temporada_id }),
    ])
    const results = [...partidosLiga, ...ownMatchesAsResults(partidos, equipos, CLUB.name)]
    const clasificacion = computeStandings(equipos, results).map((r) => ({ equipo: r.team.nombre, pts: r.pts, pos: r.pos, propio: !!r.team.es_propio }))
    return { partidos, stats: stats.map(normalizeStat), equipos, partidosLiga, clasificacion }
  },

  /** Loads members-only player details (RLS returns nothing to visitors). */
  async loadJugadoresPrivado() {
    if (!USE_SUPABASE) return
    const rows = await db.select('jugadores_privado')
    _privado = new Map(rows.map((r) => [r.jugador_id, r.estado_desc]))
    _jugadores = _jugadores.map((j) => ({ ...j, estado_desc: _privado.get(j.id) ?? null }))
    notify()
  },

  /** Forget members-only details (on sign-out). */
  clearJugadoresPrivado() {
    if (!USE_SUPABASE || !_privado.size) return
    _privado = new Map()
    _jugadores = _jugadores.map((j) => ({ ...j, estado_desc: null }))
    notify()
  },

  // ── Players ────────────────────────────────────────────────────────────────
  async addJugador(j) {
    j = validarJugador(j, { jugadores: _jugadores, local: !USE_SUPABASE })
    const row = await db.insert('jugadores', { nombre: j.nombre, posicion: j.posicion, dorsal: j.dorsal ?? null, foto_url: j.foto_url || null, estado: 'disponible', capitania: j.capitania ?? null })
    _jugadores = [..._jugadores, row]
    await log('Añadió', 'Jugador', j.nombre)
    notify()
  },
  async updateJugador(id, data) {
    // Fields a form doesn't show keep their current value (the admin list doesn't edit the status)
    const actual = _jugadores.find((j) => j.id === id) || {}
    data = { estado: actual.estado, estado_desc: _privado.get(id) ?? actual.estado_desc, capitania: actual.capitania ?? null, ...data }
    data = validarJugador(data, { jugadores: _jugadores, id, local: !USE_SUPABASE })
    const patch = {
      nombre: data.nombre,
      posicion: data.posicion,
      dorsal: data.dorsal,
      foto_url: data.foto_url || null,
      estado: data.estado || 'disponible',
      capitania: data.capitania,
    }
    const estado_desc = data.estado_desc || null
    if (USE_SUPABASE) {
      await db.update('jugadores', { id }, patch)
      // Private details live in jugadores_privado (members only)
      await db.upsert('jugadores_privado', [{ jugador_id: id, estado_desc }], ['jugador_id'])
    } else {
      await db.update('jugadores', { id }, { ...patch, estado_desc })
    }
    _privado.set(id, estado_desc)
    _jugadores = _jugadores.map((j) => (j.id === id ? { ...j, ...patch, estado_desc } : j))
    await log('Editó', 'Jugador', data.nombre)
    notify()
  },
  async deleteJugador(id) {
    const j = _jugadores.find((x) => x.id === id)
    await db.remove('jugadores', { id })
    if (!USE_SUPABASE) {
      // The database does this with a trigger (validacion.jugadores_limpiar)
      await db.remove('estadisticas', { jugador_id: id })
      for (const p of _partidos.filter((x) => (x.convocados || []).includes(id))) {
        await db.update('partidos', { id: p.id }, { convocados: p.convocados.filter((x) => x !== id) })
      }
      for (const a of load('alineaciones', []).filter((x) => (x.jugadores || []).some((s) => s?.jugador_id === id))) {
        await db.update('alineaciones', { id: a.id }, { jugadores: a.jugadores.map((s) => (s?.jugador_id === id ? { ...s, jugador_id: null } : s)) })
      }
    }
    _partidos = _partidos.map((p) => ((p.convocados || []).includes(id) ? { ...p, convocados: p.convocados.filter((x) => x !== id) } : p))
    _jugadores = _jugadores.filter((x) => x.id !== id)
    _stats = _stats.filter((s) => s.jugador_id !== id)
    await log('Eliminó', 'Jugador', j?.nombre || String(id))
    notify()
  },
  async subirFotoJugador(_jugador_id, archivo) {
    // Portrait size for the squad cards and the player page
    return store.uploadToCloudinary(archivo, 'tembleque/avatares', { maxWidth: 720, maxHeight: 960, quality: 0.8 })
  },

  // ── Our matches ────────────────────────────────────────────────────────────
  async addPartido(p) {
    exigirFinalistas({ ...p, convocados: [] }) // a new match has no call-up yet
    p = validarPartido(p, { partidos: _partidos, partidosLiga: _partidosLiga, equipos: _equipos, temporada: _temporadaActiva, local: !USE_SUPABASE })
    const row = await db.insert('partidos', {
      jornada: p.jornada,
      fecha: p.fecha,
      hora: p.hora || null,
      local: p.local,
      visitante: p.visitante,
      campo: p.campo,
      jugado: !!p.jugado,
      goles_local: p.goles_local || 0,
      goles_visitante: p.goles_visitante || 0,
      amistoso: !!p.amistoso,
      escudo_rival_url: p.escudo_rival_url || null,
      convocados: [],
      equipacion: p.equipacion || DEFAULT_KIT,
      temporada_id: tid(),
    })
    _partidos = [..._partidos, { ...row, convocados: row.convocados || [] }]
    await log('Añadió', 'Partido', `J${p.jornada} ${p.local} - ${p.visitante}`)
    notify()
    return row
  },

  async updatePartido(id, data) {
    const fields = ['jornada', 'fecha', 'hora', 'local', 'visitante', 'campo', 'jugado', 'goles_local',
      'goles_visitante', 'amistoso', 'escudo_rival_url', 'convocados', 'mvp_jugador_id', 'equipacion', 'mvp_finalistas', 'capitan_id']
    const patch = Object.fromEntries(fields.filter((f) => data[f] !== undefined).map((f) => [f, data[f]]))
    if (patch.hora === '') patch.hora = null
    const before = _partidos.find((x) => x.id === id)
    if (!before) throw new ValidationError('El partido ya no existe. Recarga la página.')
    const core = ['jornada', 'fecha', 'hora', 'local', 'visitante', 'campo', 'jugado', 'goles_local', 'goles_visitante', 'amistoso', 'escudo_rival_url']
    if (core.some((f) => f in patch)) {
      const eventos = 'goles_local' in patch || 'goles_visitante' in patch ? await store.getEventos(id) : []
      const clean = validarPartido({ ...before, ...patch }, {
        partidos: _partidos, partidosLiga: _partidosLiga, equipos: _equipos, temporada: _temporadaActiva, id, stats: _stats, eventos, local: !USE_SUPABASE,
      })
      core.filter((f) => f in patch).forEach((f) => { patch[f] = clean[f] })
    }
    if ('mvp_jugador_id' in patch) {
      if (patch.mvp_jugador_id != null && votacionAbierta({ ...before, ...patch })) {
        throw new ValidationError('El MVP se decide por votación hasta las 23:59 del día siguiente al partido.')
      }
      patch.mvp_jugador_id = validarMvp(patch.mvp_jugador_id, { partido: { ...before, ...patch }, stats: _stats, jugadores: _jugadores })
    }
    if ('equipacion' in patch && !['local', 'visitante'].includes(patch.equipacion)) throw new ValidationError('Elige una equipación válida.')
    if ('convocados' in patch) patch.convocados = await store.validarConvocatoria(id, patch.convocados)
    if ('capitan_id' in patch) {
      const titulares = startersFromLineup(await store.getAlineacion(id))
      patch.capitan_id = validarCapitan(patch.capitan_id, { titulares, jugadores: _jugadores })
    }
    if ('mvp_finalistas' in patch) patch.mvp_finalistas = validarFinalistas(patch.mvp_finalistas, { partido: { ...before, ...patch }, jugadores: _jugadores })
    if (patch.jugado && !before.jugado) exigirFinalistas({ ...before, ...patch })
    await db.update('partidos', { id }, patch)
    _partidos = _partidos.map((p) => (p.id === id ? { ...p, ...patch } : p))
    await log('Editó', 'Partido', `J${patch.jornada ?? before?.jornada} ${patch.local ?? before?.local} - ${patch.visitante ?? before?.visitante}`)
    // Minutes are (re)computed every time a match is (or stays) played
    if (patch.jugado ?? before?.jugado) await store.recalcularPartido(id)
    notify()
  },

  /**
   * "Cerrar el partido": marks it as played in one go, with the score taken from
   * the timeline and (when the vote opens) the MVP candidates, once the line-up and
   * timeline are in place. Stats and minutes are recalculated by updatePartido.
   * @returns the final score { goles_local, goles_visitante }
   */
  async cerrarPartido(partido_id, { mvp_finalistas = null } = {}) {
    const partido = _partidos.find((p) => p.id === partido_id)
    if (!partido) throw new ValidationError('El partido ya no existe. Recarga la página.')
    if (partido.jugado) throw new ValidationError('Este partido ya está cerrado.')
    const [alineacion, eventos] = await Promise.all([store.getAlineacion(partido_id), store.getEventos(partido_id)])
    const estado = estadoCierre({ partido, alineacion, eventos, finalistas: mvp_finalistas, timelineRevisada: true })
    const pendiente = estado.pasos.find((p) => !p.ok)
    if (pendiente) throw new ValidationError(`Antes de cerrar el partido: ${pendiente.texto.charAt(0).toLowerCase()}${pendiente.texto.slice(1)}.`)
    const patch = { jugado: true, ...estado.marcador }
    if (estado.necesitaCandidatos && mvp_finalistas) patch.mvp_finalistas = mvp_finalistas
    await store.updatePartido(partido_id, patch)
    return estado.marcador
  },

  /** Checks a call-up against the lineup, timeline and stats of the match. */
  async validarConvocatoria(partido_id, convocados) {
    const [alineacion, eventos] = await Promise.all([store.getAlineacion(partido_id), store.getEventos(partido_id)])
    const clean = validarConvocados(convocados, { jugadores: _jugadores, alineacion, eventos, stats: _stats.filter((s) => s.partido_id === partido_id) })
    const candidato = (_partidos.find((p) => p.id === partido_id)?.mvp_finalistas || []).map(Number).find((id) => !clean.includes(id))
    if (candidato) throw new ValidationError(`${_jugadores.find((j) => j.id === candidato)?.nombre || 'Ese jugador'} es candidato al MVP y tiene que estar convocado.`)
    return clean
  },

  async updateConvocados(partido_id, convocados) {
    convocados = await store.validarConvocatoria(partido_id, convocados)
    await db.update('partidos', { id: partido_id }, { convocados })
    _partidos = _partidos.map((p) => (p.id === partido_id ? { ...p, convocados } : p))
    if (_partidos.find((p) => p.id === partido_id)?.jugado) await store.recalcularPartido(partido_id)
    notify()
  },

  /** Kept for backwards compatibility: marking a match as played triggers a recalculation. */
  async registrarPartidoJugado(partido_id) {
    await store.recalcularPartido(partido_id)
  },

  async deletePartido(id) {
    const p = _partidos.find((x) => x.id === id)
    await db.remove('partidos', { id })
    if (!USE_SUPABASE) {
      await db.remove('estadisticas', { partido_id: id })
      await db.remove('eventos_partido', { partido_id: id })
      await db.remove('alineaciones', { partido_id: id })
    }
    _partidos = _partidos.filter((x) => x.id !== id)
    _stats = _stats.filter((s) => s.partido_id !== id)
    await log('Eliminó', 'Partido', `J${p?.jornada} ${p?.local} - ${p?.visitante}`)
    notify()
  },

  async uploadEscudoRival(_partidoId, archivo) {
    return store.uploadToCloudinary(archivo, 'tembleque/escudos-rivales', { maxWidth: 300, maxHeight: 300, quality: 0.8 })
  },

  // ── Timeline events ────────────────────────────────────────────────────────
  async getEventos(partido_id) {
    return db.select('eventos_partido', { partido_id })
  },
  /** Context needed to validate a change to the timeline of a match. */
  async contextoPartido(partido_id) {
    const [eventos, alineacion] = await Promise.all([store.getEventos(partido_id), store.getAlineacion(partido_id)])
    return { partido: _partidos.find((p) => p.id === partido_id), temporada: _temporadaActiva, eventos, alineacion, jugadores: _jugadores }
  },

  async addEvento(ev) {
    const v = validarEvento(ev, await store.contextoPartido(ev.partido_id))
    const row = await db.insert('eventos_partido', {
      partido_id: ev.partido_id,
      minuto: v.minuto,
      minuto_extra: v.minuto_extra,
      tipo: v.tipo,
      equipo: v.equipo,
      jugador_id: v.jugador_id,
      jugador2_id: v.jugador2_id,
      nombre_rival: v.nombre_rival,
      temporada_id: tid(),
    })
    await store.recalcularPartido(ev.partido_id)
    await log('Evento', 'Timeline', `${ev.tipo} ${ev.minuto}'`)
    notify()
    return row
  },
  async updateEvento(id, partido_id, ev) {
    const v = validarEvento(ev, { ...(await store.contextoPartido(partido_id)), id })
    await db.update('eventos_partido', { id }, {
      minuto: v.minuto,
      minuto_extra: v.minuto_extra,
      tipo: v.tipo,
      equipo: v.equipo,
      jugador_id: v.jugador_id,
      jugador2_id: v.jugador2_id,
      nombre_rival: v.nombre_rival,
    })
    await store.recalcularPartido(partido_id)
    notify()
  },
  async deleteEvento(id, partido_id) {
    validarBorrarEvento(id, await store.contextoPartido(partido_id))
    await db.remove('eventos_partido', { id })
    await store.recalcularPartido(partido_id)
    notify()
  },

  /**
   * Rebuilds the per-player rows in `estadisticas` for one match:
   *   - minutos / titular from the lineup + substitutions + red cards
   *   - goles, asistencias, tarjetas and goles_encajados from the timeline
   *     (only when the match has timeline events, so manual stats are not wiped)
   *   - paradas is always kept as entered manually
   */
  async recalcularPartido(partido_id) {
    const partido = _partidos.find((p) => p.id === partido_id)
    if (!partido) return
    const [lineup, eventos] = await Promise.all([store.getAlineacion(partido_id), store.getEventos(partido_id)])
    const existing = _stats.filter((s) => s.partido_id === partido_id)

    if (!partido.jugado) {
      // Back to "pending": minutes no longer count
      if (existing.some((s) => s.minutos)) {
        const rows = existing.map((s) => ({ jugador_id: s.jugador_id, partido_id, minutos: 0, titular: false, temporada_id: tid() }))
        const saved = await db.upsert('estadisticas', rows, ['jugador_id', 'partido_id'])
        mergeStats(saved)
      }
      return
    }

    const starters = startersFromLineup(lineup)
    const isGoalkeeper = (id) => _jugadores.find((j) => j.id === id)?.posicion === 'Portero'
    const { minutos, titular, golesEncajados } = computePlayerMinutes({
      starters,
      events: eventos,
      duration: _temporadaActiva?.duracion_partido || COMPETITION.matchDuration,
      isGoalkeeper,
    })
    const derived = statsFromEvents(eventos)
    const useTimeline = eventos.length > 0

    const ids = new Set([
      ...(partido.convocados || []).map(Number),
      ...starters,
      ...Object.keys(minutos).map(Number),
      ...Object.keys(derived).map(Number),
      ...existing.map((s) => s.jugador_id),
    ])

    const rows = [...ids].filter((id) => _jugadores.some((j) => j.id === id)).map((jugador_id) => {
      const prev = existing.find((s) => s.jugador_id === jugador_id) || {}
      const d = derived[jugador_id] || { goles: 0, asistencias: 0, tarjetas_amarillas: 0, tarjetas_rojas: 0 }
      return {
        jugador_id,
        partido_id,
        temporada_id: tid(),
        minutos: minutos[jugador_id] || 0,
        titular: !!titular[jugador_id],
        paradas: prev.paradas || 0,
        goles: useTimeline ? d.goles : prev.goles || 0,
        asistencias: useTimeline ? d.asistencias : prev.asistencias || 0,
        tarjetas_amarillas: useTimeline ? d.tarjetas_amarillas : prev.tarjetas_amarillas || 0,
        tarjetas_rojas: useTimeline ? d.tarjetas_rojas : prev.tarjetas_rojas || 0,
        goles_encajados: useTimeline ? golesEncajados[jugador_id] || 0 : prev.goles_encajados || 0,
      }
    })
    const saved = await db.upsert('estadisticas', rows, ['jugador_id', 'partido_id'])
    mergeStats(saved)
  },

  // ── Manual stats (saves, or everything when no timeline exists) ────────────
  async upsertStat(data) {
    const prev = _stats.find((s) => s.jugador_id === data.jugador_id && s.partido_id === data.partido_id) || {}
    const ctx = await store.contextoPartido(data.partido_id)
    validarEstadistica({ minutos: 0, titular: false, ...prev, ...data, paradas: data.paradas || 0, goles_encajados: data.goles_encajados || 0 },
      { ...ctx, stats: _stats })
    const row = {
      jugador_id: data.jugador_id,
      partido_id: data.partido_id,
      goles: data.goles,
      asistencias: data.asistencias,
      tarjetas_amarillas: data.tarjetas_amarillas,
      tarjetas_rojas: data.tarjetas_rojas,
      paradas: data.paradas || 0,
      goles_encajados: data.goles_encajados || 0,
      temporada_id: tid(),
    }
    const saved = await db.upsert('estadisticas', [row], ['jugador_id', 'partido_id'])
    mergeStats(saved)
    const j = _jugadores.find((x) => x.id === data.jugador_id)
    const p = _partidos.find((x) => x.id === data.partido_id)
    await log('Stats', 'Estadísticas', `${j?.nombre} en J${p?.jornada}`)
    notify()
  },
  async deleteStat(jugador_id, partido_id) {
    await db.remove('estadisticas', { jugador_id, partido_id })
    _stats = _stats.filter((s) => !(s.jugador_id === jugador_id && s.partido_id === partido_id))
    notify()
  },

  // ── Lineups ────────────────────────────────────────────────────────────────
  async getAlineacion(partido_id) {
    const rows = await db.select('alineaciones', { partido_id })
    return rows[0] || null
  },
  async saveAlineacion(partido_id, formacion, jugadoresAlin) {
    const ctx = await store.contextoPartido(partido_id)
    validarAlineacion(formacion, jugadoresAlin, ctx)
    await db.upsert('alineaciones', [{ partido_id, formacion, jugadores: jugadoresAlin, temporada_id: tid() }], ['partido_id'])
    // A captain who is no longer in the XI loses the armband (the database does the same)
    const cap = _partidos.find((p) => p.id === partido_id)?.capitan_id
    if (cap && !startersFromLineup({ jugadores: jugadoresAlin }).includes(cap)) {
      if (!USE_SUPABASE) await db.update('partidos', { id: partido_id }, { capitan_id: null })
      _partidos = _partidos.map((p) => (p.id === partido_id ? { ...p, capitan_id: null } : p))
    }
    if (_partidos.find((p) => p.id === partido_id)?.jugado) await store.recalcularPartido(partido_id)
    const p = _partidos.find((x) => x.id === partido_id)
    await log('Alineación', 'Alineación', `J${p?.jornada} — ${formacion}`)
    notify()
  },

  // ── League teams ───────────────────────────────────────────────────────────
  /** Makes sure our club exists in the league teams of the active season. */
  async ensureOwnTeam() {
    if (!tid() || _equipos.some((e) => e.es_propio)) return
    try {
      const row = await db.insert('equipos_liga', {
        nombre: CLUB.name, nombre_corto: CLUB.shortName, escudo_url: CLUB.crest, es_propio: true, sancion_puntos: 0, temporada_id: tid(),
      })
      _equipos = sortEquipos([..._equipos, row])
    } catch (e) { console.warn('[equipos] could not create own team', e) }
  },
  async addEquipo(data) {
    data = validarEquipo(data, { equipos: _equipos, local: !USE_SUPABASE })
    const row = await db.insert('equipos_liga', {
      nombre: data.nombre.trim(),
      nombre_corto: data.nombre_corto?.trim() || null,
      escudo_url: data.escudo_url || null,
      sancion_puntos: Number(data.sancion_puntos) || 0,
      es_propio: false,
      temporada_id: tid(),
    })
    _equipos = sortEquipos([..._equipos, row])
    await log('Añadió', 'Equipo', data.nombre)
    notify()
  },
  async updateEquipo(id, data) {
    const old = _equipos.find((e) => e.id === id)
    data = validarEquipo({ ...data, escudo_url: data.escudo_url ?? old?.escudo_url ?? null }, { equipos: _equipos, id, local: !USE_SUPABASE })
    const patch = {
      nombre: data.nombre.trim(),
      nombre_corto: data.nombre_corto?.trim() || null,
      escudo_url: data.escudo_url ?? old?.escudo_url ?? null,
      sancion_puntos: Number(data.sancion_puntos) || 0,
    }
    await db.update('equipos_liga', { id }, patch)
    _equipos = sortEquipos(_equipos.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    // Keep our own match records consistent if a rival is renamed
    if (old && old.nombre !== patch.nombre) {
      for (const p of _partidos.filter((x) => x.local === old.nombre || x.visitante === old.nombre)) {
        const upd = { local: p.local === old.nombre ? patch.nombre : p.local, visitante: p.visitante === old.nombre ? patch.nombre : p.visitante }
        await db.update('partidos', { id: p.id }, upd)
        _partidos = _partidos.map((x) => (x.id === p.id ? { ...x, ...upd } : x))
      }
    }
    await log('Editó', 'Equipo', patch.nombre)
    notify()
  },
  async deleteEquipo(id) {
    const e = _equipos.find((x) => x.id === id)
    if (e?.es_propio) return
    await db.remove('equipos_liga', { id })
    if (!USE_SUPABASE) {
      save('partidos_liga', load('partidos_liga', []).filter((m) => m.local_id !== id && m.visitante_id !== id))
    }
    _equipos = _equipos.filter((x) => x.id !== id)
    _partidosLiga = _partidosLiga.filter((m) => m.local_id !== id && m.visitante_id !== id)
    await log('Eliminó', 'Equipo', e?.nombre)
    notify()
  },
  async uploadEscudoEquipo(archivo) {
    return store.uploadToCloudinary(archivo, 'tembleque/escudos-liga', { maxWidth: 300, maxHeight: 300, quality: 0.8 })
  },

  // ── League fixtures between other teams ────────────────────────────────────
  async addPartidoLiga(m) {
    const v = validarPartidoLiga(m, { partidosLiga: _partidosLiga, partidos: _partidos, equipos: _equipos, temporada: _temporadaActiva })
    const row = await db.insert('partidos_liga', { ...v, temporada_id: tid() })
    _partidosLiga = [..._partidosLiga, row]
    notify()
    return row
  },
  async updatePartidoLiga(id, m) {
    const patch = validarPartidoLiga(m, { partidosLiga: _partidosLiga, partidos: _partidos, equipos: _equipos, temporada: _temporadaActiva, id })
    await db.update('partidos_liga', { id }, patch)
    _partidosLiga = _partidosLiga.map((x) => (x.id === id ? { ...x, ...patch } : x))
    await log('Resultado', 'Liga', `J${patch.jornada}`)
    notify()
  },
  async deletePartidoLiga(id) {
    await db.remove('partidos_liga', { id })
    _partidosLiga = _partidosLiga.filter((x) => x.id !== id)
    notify()
  },

  // ── MVP (voted by everyone) ────────────────────────────────────────────────
  /**
   * State of the MVP vote of a match.
   * @returns {{ abierta: boolean, cierra: Date|null, total: number, ranking: {jugador_id:number, votos:number}[], miVoto: number|null, mvpJugadorId: number|null }}
   */
  async getVotacionMvp(partido_id) {
    const partido = _partidos.find((p) => p.id === partido_id)
    if (USE_SUPABASE) {
      const { data, error } = await supabase.rpc('mvp_votacion', { p_partido_id: partido_id })
      if (error) throw dbError('rpc', 'mvp_votacion', error)
      const v = normalizeVotacion(data)
      // The server saves the winner when voting closes: keep the cache in sync
      if (partido && v.mvpJugadorId && partido.mvp_jugador_id !== v.mvpJugadorId) {
        _partidos = _partidos.map((p) => (p.id === partido_id ? { ...p, mvp_jugador_id: v.mvpJugadorId } : p))
        notify()
      }
      return v
    }
    return localVotacion(partido)
  },

  /** Casts (or changes) this person's vote. Anyone can vote: no account needed. */
  async votarMvp(partido_id, jugador_id) {
    const partido = _partidos.find((p) => p.id === partido_id)
    const candidatos = candidatosMvp(partido, _jugadores, _stats)
    if (!votacionAbierta(partido)) throw new ValidationError('La votación de este partido no está abierta.')
    if (!candidatos.some((c) => c.id === jugador_id)) throw new ValidationError('Solo se puede votar a jugadores convocados para este partido.')
    if (USE_SUPABASE) {
      await voterSessionProvider()
      const { data, error } = await supabase.rpc('votar_mvp', { p_partido_id: partido_id, p_jugador_id: jugador_id })
      if (error) throw dbError('rpc', 'votar_mvp', error)
      return normalizeVotacion(data)
    }
    const all = load('mvp_votos', []).filter((v) => !(v.partido_id === partido_id && v.user_id === LOCAL_VOTER))
    save('mvp_votos', [...all, { partido_id, user_id: LOCAL_VOTER, votado_id: jugador_id }])
    return localVotacion(partido)
  },

  // ── Sponsors ───────────────────────────────────────────────────────────────
  async getPatrocinadores() {
    const list = await db.select('patrocinadores')
    return list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  },
  async addPatrocinador(nombre, archivo) {
    nombre = nombre ? String(nombre).trim() || null : null
    if (nombre && !textoOk(nombre, 80)) throw new ValidationError('El nombre del patrocinador admite como máximo 80 caracteres.')
    let imagen_url = null
    if (archivo && USE_SUPABASE) {
      imagen_url = await store.uploadToCloudinary(archivo, 'tembleque/patrocinadores', { maxWidth: 600, maxHeight: 600, quality: 0.8 })
    }
    if (!urlOk(imagen_url)) throw new ValidationError('La imagen no es válida. Vuelve a subirla.')
    return db.insert('patrocinadores', { nombre, imagen_url })
  },
  async deletePatrocinador(id) {
    await db.remove('patrocinadores', { id })
  },

  // ── Activity log ───────────────────────────────────────────────────────────
  async getLog() {
    if (USE_SUPABASE) {
      const { data } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100)
      return data || []
    }
    return load('activity_log', [])
  },

  // ── Image upload (Cloudinary) ──────────────────────────────────────────────
  async comprimirImagen(archivo, { maxWidth = 800, maxHeight = 800, quality = 0.75 } = {}) {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(archivo)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let { width, height } = img
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        // PNG keeps transparency (crests); photos go as JPEG
        const type = archivo.type === 'image/png' ? 'image/png' : 'image/jpeg'
        canvas.toBlob((blob) => resolve(blob || archivo), type, quality)
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(archivo) }
      img.src = url
    })
  },
  async uploadToCloudinary(archivo, folder = 'tembleque', opciones = {}) {
    const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
    const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
    const blob = await store.comprimirImagen(archivo, opciones)
    if (!cloud || !preset) {
      // Local/demo mode: keep the image inline as a data URL
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    }
    const formData = new FormData()
    formData.append('file', blob)
    formData.append('upload_preset', preset)
    formData.append('folder', folder)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: formData })
    if (!res.ok) { console.error('[cloudinary] upload failed'); return null }
    const data = await res.json()
    return data.secure_url
  },
}

function mergeStats(saved) {
  for (const row of saved.map(normalizeStat)) {
    const i = _stats.findIndex((s) => s.jugador_id === row.jugador_id && s.partido_id === row.partido_id)
    if (i >= 0) _stats[i] = { ..._stats[i], ...row }
    else _stats.push(row)
  }
  _stats = [..._stats]
}

// ── MVP helpers ─────────────────────────────────────────────────────────────
// Session used to vote (set by the app: anonymous Supabase session if needed)
let voterSessionProvider = async () => null
export function setVoterSessionProvider(fn) { voterSessionProvider = fn }

const LOCAL_VOTER = 'este-dispositivo'

function normalizeVotacion(d) {
  return {
    abierta: !!d?.abierta,
    cierra: d?.cierra ? new Date(d.cierra) : null,
    total: Number(d?.total) || 0,
    ranking: (d?.ranking || []).map((r) => ({ jugador_id: Number(r.jugador_id), votos: Number(r.votos) })),
    miVoto: d?.mi_voto != null ? Number(d.mi_voto) : null,
    mvpJugadorId: d?.mvp_jugador_id != null ? Number(d.mvp_jugador_id) : null,
  }
}

/** Local demo mode: same rules, votes kept in this browser. */
function localVotacion(partido) {
  if (!partido) return normalizeVotacion(null)
  const votos = load('mvp_votos', []).filter((v) => v.partido_id === partido.id)
  const conteo = {}
  votos.forEach((v) => { conteo[v.votado_id] = (conteo[v.votado_id] || 0) + 1 })
  const ranking = Object.entries(conteo).map(([id, n]) => ({ jugador_id: Number(id), votos: n })).sort((a, b) => b.votos - a.votos)
  const abierta = votacionAbierta(partido)
  let mvp = partido.mvp_jugador_id ?? null
  if (!abierta && partido.jugado && mvp == null && ranking.length) {
    mvp = ganadorMvp(ranking, candidatosMvp(partido, _jugadores, _stats))
    save('partidos', load('partidos', []).map((p) => (p.id === partido.id ? { ...p, mvp_jugador_id: mvp } : p)))
    _partidos = _partidos.map((p) => (p.id === partido.id ? { ...p, mvp_jugador_id: mvp } : p))
    notify()
  }
  return {
    abierta, cierra: mvpCierre(partido.fecha), total: votos.length, ranking,
    miVoto: votos.find((v) => v.user_id === LOCAL_VOTER)?.votado_id ?? null, mvpJugadorId: mvp,
  }
}
