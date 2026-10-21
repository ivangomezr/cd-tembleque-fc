/**
 * Data validation rules (pure, no I/O).
 *
 * Same rules as the database (migration 20261017180000_data_integrity.sql), so
 * the admin sees the problem before saving. The database still checks
 * everything: this file is a convenience, not the security boundary.
 * Rules and the reasoning behind them: docs/data-validation.md.
 *
 * Every validator throws a ValidationError with a message ready to show, or
 * returns the cleaned-up data.
 */
import { CLUB, COMPETITION } from '../config/club'
import { startersFromLineup, statsFromEvents, timelineIssue } from './timeline'
import { UserFacingError } from './dbErrors'
import { votacionAbierta } from './mvp'

export class ValidationError extends UserFacingError {
  constructor(message, field) {
    super(message, { field, code: 'VALIDATION' })
    this.name = 'ValidationError'
  }
}
const fail = (message, field) => { throw new ValidationError(message, field) }

// ── Limits (keep in sync with the migration) ────────────────────────────────
export const LIMITS = {
  nombreJugador: 60,
  nombreEquipo: 80,
  nombreCorto: 16,
  nombreTemporada: 80,
  campo: 120,
  nombreRival: 60,
  estadoDesc: 280,
  dorsal: [1, 99],
  goles: 99,
  jornada: [1, 99],
  año: [2000, 2100],
  duracion: [1, 120],
  zonas: 30,
  sancion: 99,
  convocados: 50,
  titulares: COMPETITION.playersPerSide,
  minutoMax: 120,
  extraMax: 15,
  prorroga: 30,
  contador: 99,
}
export const POSICIONES = ['Portero', 'Defensa', 'Centrocampista', 'Delantero']
export const ESTADOS_JUGADOR = ['disponible', 'lesionado', 'duda', 'sancionado', 'baja']
export const FORMACIONES_VALIDAS = ['4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '4-5-1', '3-5-2', '3-4-3', '5-3-2']

// ── Small helpers ───────────────────────────────────────────────────────────
const CONTROL = /[\u0000-\u001f\u007f]/
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/
const norm = (s) => String(s ?? '').trim().toLowerCase()

export const textoOk = (v, max) => typeof v === 'string' && v.trim() !== '' && v.trim().length <= max && !CONTROL.test(v)

/** https URL or site-relative path; data: URLs only in local mode (no database). */
export function urlOk(v, { local = false } = {}) {
  if (v == null || v === '') return true
  if (local && /^data:image\//.test(v)) return true
  return typeof v === 'string' && v.length <= 500 && /^(https:\/\/[^\s"'<>\\]+|\/[A-Za-z0-9._/-]+)$/.test(v)
}

const entero = (v) => (v === '' || v == null ? NaN : Number(v))
const isInt = (n) => Number.isInteger(n)
const enRango = (v, min, max) => { const n = entero(v); return isInt(n) && n >= min && n <= max }

export const isIsoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`))
export const isHora = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v)

/** Same window as validacion.fecha_en_temporada(): año − 1 … año + 1. */
export function fechaEnTemporada(fecha, temporada) {
  if (!fecha || !temporada?.año) return true
  return fecha >= `${temporada.año - 1}-01-01` && fecha <= `${temporada.año + 1}-12-31`
}

/** Has the match kicked off? (no time → start of that day, like the database) */
export function yaEmpezado(fecha, hora, now = new Date()) {
  if (!isIsoDate(fecha)) return false
  return new Date(`${fecha}T${isHora(hora) ? hora.slice(0, 5) : '00:00'}:00`) <= now
}

/**
 * Should the "played" box be ticked automatically? True once the match has
 * finished (kick-off + match length) and it is not marked as played yet.
 * For league fixtures without a time, from the day after.
 */
export function debeMarcarseJugado(p, now = new Date(), duracion = COMPETITION.matchDuration) {
  if (!p || p.jugado || !isIsoDate(p.fecha)) return false
  if (!isHora(p.hora)) return new Date(`${p.fecha}T00:00:00`).getTime() + 24 * 3600e3 <= now.getTime()
  return new Date(`${p.fecha}T${p.hora.slice(0, 5)}:00`).getTime() + duracion * 60e3 <= now.getTime()
}

const hoyIso = (now = new Date()) => {
  const z = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`
}

const nombreDe = (jugadores = []) => (id) => jugadores.find((j) => j.id === Number(id))?.nombre || `Jugador ${id}`

/** Validates a list of player ids (call-up or lineup). Returns the clean list. */
export function validarIds(ids, { jugadores = [], max = LIMITS.convocados, que = 'convocados' } = {}) {
  if (!Array.isArray(ids)) fail(`La lista de ${que} no es válida.`)
  if (ids.length > max) fail(`La lista de ${que} admite como máximo ${max} jugadores.`)
  const clean = ids.map(Number)
  if (clean.some((n) => !isInt(n) || n <= 0)) fail(`La lista de ${que} contiene identificadores no válidos.`)
  if (new Set(clean).size !== clean.length) fail(`Hay jugadores repetidos en la lista de ${que}.`)
  const missing = clean.find((id) => !jugadores.some((j) => j.id === id))
  if (missing) fail(`La lista de ${que} incluye un jugador que no existe (#${missing}).`)
  return clean
}

// ── Players ─────────────────────────────────────────────────────────────────
export function validarJugador(data, { jugadores = [], id = null, local = false } = {}) {
  const nombre = String(data.nombre ?? '').trim()
  if (!nombre) fail('El nombre es obligatorio.', 'nombre')
  if (nombre.length > LIMITS.nombreJugador) fail(`El nombre admite como máximo ${LIMITS.nombreJugador} caracteres.`, 'nombre')
  if (CONTROL.test(nombre)) fail('El nombre tiene caracteres no permitidos.', 'nombre')
  if (!POSICIONES.includes(data.posicion)) fail('Elige la posición del jugador.', 'posicion')
  const dorsal = data.dorsal === '' || data.dorsal == null ? null : entero(data.dorsal)
  if (dorsal != null && !enRango(dorsal, ...LIMITS.dorsal)) fail('El dorsal debe ser un número del 1 al 99.', 'dorsal')
  const activo = data.activo ?? jugadores.find((j) => j.id === id)?.activo ?? true
  if (dorsal != null && activo) {
    const otro = jugadores.find((j) => j.id !== id && j.activo !== false && Number(j.dorsal) === dorsal)
    if (otro) fail(`El dorsal #${dorsal} ya lo lleva ${otro.nombre}.`, 'dorsal')
  }
  const estado = data.estado || 'disponible'
  if (!ESTADOS_JUGADOR.includes(estado)) fail('El estado del jugador no es válido.', 'estado')
  const estado_desc = data.estado_desc ? String(data.estado_desc).trim() : null
  if (estado_desc && (estado_desc.length > LIMITS.estadoDesc || CONTROL_EXCEPT_NEWLINE.test(estado_desc))) {
    fail(`La nota admite como máximo ${LIMITS.estadoDesc} caracteres.`, 'estado_desc')
  }
  if (!urlOk(data.foto_url, { local })) fail('La foto no es válida. Vuelve a subirla.', 'foto_url')
  return { ...data, nombre, dorsal, estado, estado_desc }
}

// ── Seasons ─────────────────────────────────────────────────────────────────
export function validarTemporada(data, { temporadas = [], id = null, numEquipos = null } = {}) {
  const out = { ...data }
  if (data.nombre !== undefined) {
    out.nombre = String(data.nombre ?? '').trim()
    if (!textoOk(out.nombre, LIMITS.nombreTemporada)) fail('El nombre de la temporada es obligatorio (máximo 80 caracteres).', 'nombre')
    if (temporadas.some((t) => t.id !== id && norm(t.nombre) === norm(out.nombre))) fail('Ya existe una temporada con ese nombre.', 'nombre')
  }
  if (data.año !== undefined && !enRango(data.año, ...LIMITS.año)) fail('El año de la temporada debe estar entre 2000 y 2100.', 'año')
  for (const k of ['zona_ascenso', 'zona_promocion', 'zona_descenso']) {
    if (data[k] !== undefined && !enRango(data[k], 0, LIMITS.zonas)) fail('Las plazas deben ser un número entre 0 y 30.', k)
  }
  if (numEquipos && ['zona_ascenso', 'zona_promocion', 'zona_descenso'].every((k) => data[k] !== undefined)) {
    const total = Number(data.zona_ascenso) + Number(data.zona_promocion) + Number(data.zona_descenso)
    if (total > numEquipos) fail(`Las plazas suman ${total} y en el grupo hay ${numEquipos} equipos.`)
  }
  if (data.duracion_partido !== undefined && !enRango(data.duracion_partido, ...LIMITS.duracion)) {
    fail('La duración del partido debe estar entre 1 y 120 minutos.', 'duracion_partido')
  }
  return out
}

// ── League teams ────────────────────────────────────────────────────────────
export function validarEquipo(data, { equipos = [], id = null, local = false } = {}) {
  const nombre = String(data.nombre ?? '').trim()
  if (!textoOk(nombre, LIMITS.nombreEquipo)) fail('El nombre del equipo es obligatorio (máximo 80 caracteres).', 'nombre')
  if (equipos.some((e) => e.id !== id && norm(e.nombre) === norm(nombre))) fail('Ya existe un equipo con ese nombre.', 'nombre')
  const nombre_corto = data.nombre_corto ? String(data.nombre_corto).trim() || null : null
  if (nombre_corto && !textoOk(nombre_corto, LIMITS.nombreCorto)) fail('El nombre corto admite como máximo 16 caracteres.', 'nombre_corto')
  const sancion = data.sancion_puntos === '' || data.sancion_puntos == null ? 0 : entero(data.sancion_puntos)
  if (!enRango(sancion, 0, LIMITS.sancion)) fail('La sanción debe ser un número de puntos entre 0 y 99.', 'sancion_puntos')
  if (!urlOk(data.escudo_url, { local })) fail('El escudo no es válido. Vuelve a subirlo.', 'escudo_url')
  return { ...data, nombre, nombre_corto, sancion_puntos: sancion }
}

// ── League fixtures between other teams ─────────────────────────────────────
export function validarPartidoLiga(m, { partidosLiga = [], partidos = [], equipos = [], temporada = null, id = null, now = new Date() } = {}) {
  const local_id = Number(m.local_id), visitante_id = Number(m.visitante_id)
  if (!local_id || !visitante_id) fail('Elige los dos equipos.')
  if (local_id === visitante_id) fail('Un equipo no puede jugar contra sí mismo.')
  const L = equipos.find((e) => e.id === local_id), V = equipos.find((e) => e.id === visitante_id)
  if (!L || !V) fail('Uno de los equipos ya no existe. Recarga la página.')
  if (L.es_propio || V.es_propio) fail('Los partidos del club se registran en ⚽ Partidos.')
  const jornada = entero(m.jornada)
  if (!enRango(jornada, ...LIMITS.jornada)) fail('La jornada debe estar entre 1 y 99.', 'jornada')
  for (const t of [L, V]) {
    const otro = partidosLiga.find((r) => r.id !== id && !r.own && r.jornada === jornada && [r.local_id, r.visitante_id].includes(t.id))
    const nuestro = partidos.find((p) => !p.amistoso && p.jornada === jornada && [norm(p.local), norm(p.visitante)].includes(norm(t.nombre)))
    if (otro || nuestro) fail(`${t.nombre} ya juega otro partido en la jornada ${jornada}.`)
  }
  if (partidosLiga.some((r) => r.id !== id && !r.own && r.local_id === local_id && r.visitante_id === visitante_id)) {
    fail(`${L.nombre} ya recibió a ${V.nombre} esta temporada.`)
  }
  const fecha = m.fecha || null
  if (fecha && !isIsoDate(fecha)) fail('La fecha no es válida.', 'fecha')
  if (!fechaEnTemporada(fecha, temporada)) fail('La fecha queda fuera de la temporada.', 'fecha')
  const jugado = !!m.jugado
  if (jugado && fecha && fecha > hoyIso(now)) fail('No se puede marcar como jugado un partido con fecha futura.', 'jugado')
  const gl = jugado ? entero(m.goles_local || 0) : 0
  const gv = jugado ? entero(m.goles_visitante || 0) : 0
  if (!enRango(gl, 0, LIMITS.goles) || !enRango(gv, 0, LIMITS.goles)) fail('Los goles deben ser un número entre 0 y 99.')
  return { jornada, fecha, local_id, visitante_id, goles_local: gl, goles_visitante: gv, jugado }
}

// ── Our matches ─────────────────────────────────────────────────────────────
export function validarPartido(p, { partidos = [], partidosLiga = [], equipos = [], temporada = null, id = null, now = new Date(), stats = [], eventos = [], local = false } = {}) {
  if (!isIsoDate(p.fecha)) fail('La fecha del partido es obligatoria.', 'fecha')
  if (p.hora != null && p.hora !== '' && !isHora(p.hora)) fail('La hora debe tener el formato HH:MM.', 'hora')
  const loc = String(p.local ?? '').trim(), vis = String(p.visitante ?? '').trim()
  if (!textoOk(loc, LIMITS.nombreEquipo) || !textoOk(vis, LIMITS.nombreEquipo)) fail('Elige el equipo rival.', 'rival')
  if (norm(loc) === norm(vis)) fail('Un equipo no puede jugar contra sí mismo.', 'rival')
  const propio = equipos.find((e) => e.es_propio)?.nombre || CLUB.name
  if (![norm(loc), norm(vis)].includes(norm(propio))) fail(`Uno de los dos equipos debe ser ${propio}.`, 'rival')
  const rival = norm(loc) === norm(propio) ? vis : loc
  const amistoso = !!p.amistoso
  const jornada = amistoso ? 0 : entero(p.jornada)
  if (!amistoso) {
    if (!enRango(jornada, ...LIMITS.jornada)) fail('El número de jornada debe estar entre 1 y 99.', 'jornada')
    const rep = partidos.find((x) => x.id !== id && !x.amistoso && x.jornada === jornada)
    if (rep) fail(`La jornada ${jornada} ya está registrada (${rep.local} - ${rep.visitante}).`, 'jornada')
    if (equipos.length && !equipos.some((e) => !e.es_propio && norm(e.nombre) === norm(rival))) {
      fail(`«${rival}» no está entre los equipos del grupo. Añádelo antes en Liga › Equipos.`, 'rival')
    }
    const eq = equipos.find((e) => norm(e.nombre) === norm(rival))
    if (eq && partidosLiga.some((r) => !r.own && r.jornada === jornada && [r.local_id, r.visitante_id].includes(eq.id))) {
      fail(`${eq.nombre} ya juega otro partido en la jornada ${jornada}.`, 'jornada')
    }
  }
  if (!fechaEnTemporada(p.fecha, temporada)) fail('La fecha del partido queda fuera de la temporada.', 'fecha')
  const jugado = !!p.jugado
  if (jugado && !yaEmpezado(p.fecha, p.hora, now)) fail('No se puede marcar como jugado un partido que todavía no ha empezado.', 'jugado')
  const gl = entero(p.goles_local || 0), gv = entero(p.goles_visitante || 0)
  if (!enRango(gl, 0, LIMITS.goles) || !enRango(gv, 0, LIMITS.goles)) fail('Los goles deben ser un número entre 0 y 99.', 'goles')
  const campo = p.campo == null ? null : String(p.campo).trim() || null
  if (campo && !textoOk(campo, LIMITS.campo)) fail('El campo admite como máximo 120 caracteres.', 'campo')
  if (!urlOk(p.escudo_rival_url, { local })) fail('El escudo no es válido. Vuelve a subirlo.', 'escudo')
  // Lowering the score below the goals already given to players (no timeline)
  if (id && jugado && !eventos.length) {
    const nuestros = norm(loc) === norm(propio) ? gl : gv
    const suma = stats.filter((s) => s.partido_id === id).reduce((a, s) => a + (Number(s.goles) || 0), 0)
    if (suma > nuestros) fail('Las estadísticas de los jugadores suman más goles que el nuevo resultado. Corrígelas primero.', 'goles')
  }
  return { ...p, local: loc, visitante: vis, jornada, campo, goles_local: gl, goles_visitante: gv, jugado, amistoso }
}

/** Players with a role in the match (they cannot be dropped from the call-up). */
export function jugadoresEnUso({ alineacion = null, eventos = [], stats = [] } = {}) {
  const ids = new Set(startersFromLineup(alineacion))
  for (const e of eventos) {
    if (e.jugador_id && (e.equipo === 'propio' || e.tipo === 'gol_propia')) ids.add(Number(e.jugador_id))
    if (e.jugador2_id && e.equipo === 'propio') ids.add(Number(e.jugador2_id))
  }
  for (const s of stats) {
    if (s.minutos > 0 || s.titular || s.goles > 0 || s.asistencias > 0 || s.tarjetas_amarillas > 0 ||
        s.tarjetas_rojas > 0 || s.paradas > 0 || s.goles_encajados > 0) ids.add(Number(s.jugador_id))
  }
  return ids
}

export function validarConvocados(ids, { jugadores = [], alineacion = null, eventos = [], stats = [] } = {}) {
  const clean = validarIds(ids, { jugadores, max: LIMITS.convocados, que: 'convocados' })
  if (clean.length) {
    const fuera = [...jugadoresEnUso({ alineacion, eventos, stats })].find((id) => !clean.includes(id))
    if (fuera) fail(`${nombreDe(jugadores)(fuera)} tiene alineación, eventos o estadísticas en este partido: no se puede quitar de la convocatoria.`)
  }
  return clean
}

export function validarMvp(jugadorId, { partido, stats = [], jugadores = [] } = {}) {
  if (jugadorId == null) return null
  if (!partido?.jugado) fail('Solo se puede elegir MVP en un partido jugado.')
  const conv = (partido.convocados || []).map(Number)
  const jugo = stats.some((s) => s.partido_id === partido.id && s.jugador_id === Number(jugadorId) && s.minutos > 0)
  if (conv.length && !conv.includes(Number(jugadorId)) && !jugo) fail(`${nombreDe(jugadores)(jugadorId)} no participó en este partido.`)
  return Number(jugadorId)
}

// ── MVP candidates (migration 20261022000000_mvp_finalistas.sql) ────────────
export const MVP_CANDIDATOS = 5

/** How many candidates a match needs: 5, or the whole call-up when it's smaller. */
export const candidatosNecesarios = (partido) => Math.min(MVP_CANDIDATOS, (partido?.convocados || []).length)

/** Marking the match as played now would open a vote (so it needs the candidates). */
export const necesitaCandidatos = (partido, now = new Date()) => votacionAbierta({ ...partido, jugado: true }, now)

/** Checks the chosen candidates: exactly 5 (or the whole call-up), all called up. Empty = none chosen (null). */
export function validarFinalistas(ids, { partido, jugadores = [] } = {}) {
  if (ids == null || (Array.isArray(ids) && ids.length === 0)) return null
  const clean = validarIds(ids, { jugadores, max: MVP_CANDIDATOS, que: 'candidatos al MVP' })
  const conv = (partido?.convocados || []).map(Number)
  const fuera = clean.find((id) => !conv.includes(id))
  if (fuera) fail(`${nombreDe(jugadores)(fuera)} es candidato al MVP y tiene que estar convocado.`)
  const n = candidatosNecesarios(partido)
  if (clean.length !== n) fail(`Elige ${n} candidatos al MVP (has elegido ${clean.length}).`)
  return clean
}

/** A match about to be marked as played (while its vote would be open) needs its candidates. */
export function exigirFinalistas(partido, now = new Date()) {
  if (!partido?.jugado || !necesitaCandidatos(partido, now)) return
  const n = candidatosNecesarios(partido)
  if (!n) fail('Antes de marcar el partido como jugado, haz la convocatoria y elige los candidatos al MVP.', 'mvp_finalistas')
  if ((partido.mvp_finalistas || []).length !== n) fail(`Elige los ${n} candidatos al MVP antes de marcar el partido como jugado.`, 'mvp_finalistas')
}

// ── Lineups ─────────────────────────────────────────────────────────────────
export function validarAlineacion(formacion, slots, { partido = null, jugadores = [], eventos = [] } = {}) {
  if (!FORMACIONES_VALIDAS.includes(formacion)) fail('Formación no válida.')
  if (!Array.isArray(slots) || slots.length > LIMITS.titulares) fail('La alineación debe tener como máximo 11 posiciones.')
  for (const s of slots) {
    const okShape = s && typeof s === 'object' && !Array.isArray(s) &&
      Object.keys(s).every((k) => ['linea', 'posicion', 'jugador_id'].includes(k)) &&
      isInt(s.linea) && s.linea >= 0 && s.linea <= 5 && isInt(s.posicion) && s.posicion >= 0 && s.posicion <= 10 &&
      (s.jugador_id == null || (isInt(s.jugador_id) && s.jugador_id > 0))
    if (!okShape) fail('La alineación tiene posiciones no válidas.')
  }
  if (new Set(slots.map((s) => `${s.linea}:${s.posicion}`)).size !== slots.length) fail('Hay dos jugadores en la misma posición.')
  const ids = slots.map((s) => s.jugador_id).filter((x) => x != null)
  if (new Set(ids).size !== ids.length) fail('Un jugador aparece dos veces en la alineación.')
  validarIds(ids, { jugadores, max: LIMITS.titulares, que: 'titulares' })
  const conv = (partido?.convocados || []).map(Number)
  const fuera = conv.length ? ids.find((id) => !conv.includes(id)) : null
  if (fuera) fail(`${nombreDe(jugadores)(fuera)} no está convocado para este partido.`)
  const issue = timelineIssue(eventos, ids, nombreDe(jugadores))
  if (issue) fail(`La alineación no cuadra con la cronología: ${issue}`)
  return slots
}

// ── Timeline events ─────────────────────────────────────────────────────────
/** Minutes allowed for a match: league matches have no extra time; friendlies may have 2 × 15'. */
export function limitesMinuto(partido, temporada) {
  const dur = Number(temporada?.duracion_partido) || COMPETITION.matchDuration
  const max = Math.min(partido?.amistoso ? dur + LIMITS.prorroga : dur, LIMITS.minutoMax)
  const conAñadido = [Math.floor(dur / 2), Math.floor((dur + 1) / 2), dur, ...(partido?.amistoso ? [dur + 15, dur + 30] : [])]
  return { dur, max, conAñadido }
}

export function validarEvento(ev, { partido, temporada = null, eventos = [], alineacion = null, jugadores = [], id = null, now = new Date() } = {}) {
  if (!partido) fail('El partido ya no existe. Recarga la página.')
  if (!yaEmpezado(partido.fecha, partido.hora, now)) fail('No se pueden registrar eventos de un partido que todavía no ha empezado.')
  const minuto = entero(ev.minuto)
  const extra = ev.minuto_extra === '' || ev.minuto_extra == null ? 0 : entero(ev.minuto_extra)
  const { dur, max, conAñadido } = limitesMinuto(partido, temporada)
  if (!enRango(minuto, 1, max)) fail(`El minuto debe estar entre 1 y ${max}. El tiempo añadido se indica aparte (${dur}+2).`, 'minuto')
  if (!enRango(extra, 0, LIMITS.extraMax)) fail('El tiempo añadido va de 0 a 15 minutos.', 'minuto_extra')
  if (extra > 0 && !conAñadido.includes(minuto)) fail(`El tiempo añadido solo existe al final de cada parte (${Math.floor(dur / 2)}+, ${dur}+).`, 'minuto_extra')

  const ours = ev.equipo === 'propio'
  if (!['propio', 'rival'].includes(ev.equipo)) fail('Elige a qué equipo pertenece el evento.')
  const tipos = ['gol', 'gol_penalti', 'gol_propia', 'penalti_fallado', 'amarilla', 'segunda_amarilla', 'roja', 'cambio']
  if (!tipos.includes(ev.tipo)) fail('Tipo de evento no válido.')
  const j1 = ev.jugador_id ? Number(ev.jugador_id) : null
  const j2 = ev.jugador2_id ? Number(ev.jugador2_id) : null
  const nombre_rival = ev.nombre_rival ? String(ev.nombre_rival).trim() || null : null
  if (ours) {
    if (ev.tipo === 'gol_propia') { if (j1) fail('En un gol en propia del rival no se indica jugador nuestro como autor.') }
    else if (!j1) fail(ev.tipo === 'cambio' ? 'Indica el jugador que entra.' : 'Indica el jugador.')
    if (ev.tipo === 'cambio' && !j2) fail('Indica el jugador que sale.')
    if (j2 && !['cambio', 'gol', 'gol_penalti', 'gol_propia'].includes(ev.tipo)) fail('Este tipo de evento no lleva segundo jugador.')
    if (nombre_rival && ev.tipo !== 'gol_propia') fail('Este evento es de un jugador nuestro: no lleva nombre de rival.')
  } else {
    if (j2 || (j1 && ev.tipo !== 'gol_propia')) fail('Los eventos del rival no pueden llevar jugadores de nuestra plantilla.')
    if (ev.tipo === 'gol_propia' && !j1) fail('Indica qué jugador nuestro marcó en propia puerta.')
    if (ev.tipo === 'gol_propia' && nombre_rival) fail('Un gol en propia nuestro no lleva nombre de rival.')
  }
  if (j1 && j2 && j1 === j2) fail(ev.tipo === 'cambio' ? 'Entra y sale el mismo jugador.' : 'El mismo jugador no puede marcar y asistir.')
  if (nombre_rival && !textoOk(nombre_rival, LIMITS.nombreRival)) fail('El nombre del jugador rival admite como máximo 60 caracteres.')
  const nameOf = nombreDe(jugadores)
  for (const x of [j1, j2]) if (x && !jugadores.some((j) => j.id === x)) fail(`El jugador #${x} no existe.`)
  const conv = (partido.convocados || []).map(Number)
  const fuera = conv.length ? [j1, j2].find((x) => x && !conv.includes(x)) : null
  if (fuera) fail(`${nameOf(fuera)} no está convocado para este partido.`)

  const clean = { ...ev, minuto, minuto_extra: extra, jugador_id: j1, jugador2_id: j2, nombre_rival }
  // A new event is stored after the existing ones of the same minute (as in the database)
  const nuevo = { ...clean, id: id ?? undefined, created_at: id ? eventos.find((e) => e.id === id)?.created_at : '￿' }
  const issue = timelineIssue([...eventos.filter((e) => e.id !== id), nuevo], startersFromLineup(alineacion), nameOf)
  if (issue) fail(issue)
  return clean
}

export function validarBorrarEvento(id, { eventos = [], alineacion = null, jugadores = [] } = {}) {
  const issue = timelineIssue(eventos.filter((e) => e.id !== id), startersFromLineup(alineacion), nombreDe(jugadores))
  if (issue) fail(`No se puede borrar: ${issue}`)
}

// ── Per-player match stats ──────────────────────────────────────────────────
const CONTADORES = ['goles', 'asistencias', 'paradas', 'goles_encajados']

/**
 * @param {object} row  the full row as it will be stored (merge with the previous one first)
 */
export function validarEstadistica(row, { partido, temporada = null, eventos = [], alineacion = null, stats = [], jugadores = [] } = {}) {
  if (!partido) fail('El partido ya no existe. Recarga la página.')
  const nombre = nombreDe(jugadores)(row.jugador_id)
  const n = (k) => Number(row[k]) || 0
  for (const k of [...CONTADORES, 'minutos', 'tarjetas_amarillas', 'tarjetas_rojas']) {
    if (row[k] != null && row[k] !== '' && !isInt(Number(row[k]))) fail('Los valores deben ser números enteros.')
  }
  if (CONTADORES.some((k) => n(k) < 0 || n(k) > LIMITS.contador)) fail('Goles, asistencias, paradas y goles encajados deben estar entre 0 y 99.')
  if (n('tarjetas_amarillas') < 0 || n('tarjetas_amarillas') > 2 || n('tarjetas_rojas') < 0 || n('tarjetas_rojas') > 1) {
    fail('Un jugador puede ver como máximo 2 amarillas y 1 roja por partido.')
  }
  if (n('tarjetas_amarillas') === 2 && n('tarjetas_rojas') !== 1) fail('Dos amarillas suponen una expulsión: marca también la roja.')
  const dur = Number(temporada?.duracion_partido) || COMPETITION.matchDuration
  if (n('minutos') < 0 || n('minutos') > dur) fail(`${nombre}: los minutos deben estar entre 0 y ${dur}.`)
  if (!partido.jugado && (n('minutos') > 0 || row.titular)) fail('Un partido sin jugar no puede tener minutos ni titulares.')
  const conv = (partido.convocados || []).map(Number)
  const algo = n('minutos') > 0 || row.titular || [...CONTADORES, 'tarjetas_amarillas', 'tarjetas_rojas'].some((k) => n(k) > 0)
  if (conv.length && !conv.includes(Number(row.jugador_id)) && algo) fail(`${nombre} no está convocado para este partido.`)
  const titulares = startersFromLineup(alineacion)
  if (row.titular && !titulares.includes(Number(row.jugador_id))) fail(`${nombre} figura como titular pero no está en la alineación.`)
  if (n('minutos') > 0 && !titulares.includes(Number(row.jugador_id)) &&
      !eventos.some((e) => e.equipo === 'propio' && e.tipo === 'cambio' && Number(e.jugador_id) === Number(row.jugador_id))) {
    fail(`${nombre} tiene minutos pero no estaba en la alineación ni entró en un cambio.`)
  }
  if (eventos.length) {
    const d = statsFromEvents(eventos)[row.jugador_id] || { goles: 0, asistencias: 0, tarjetas_amarillas: 0, tarjetas_rojas: 0 }
    if (['goles', 'asistencias', 'tarjetas_amarillas', 'tarjetas_rojas'].some((k) => n(k) !== d[k])) {
      fail(`${nombre}: goles, asistencias y tarjetas deben coincidir con la cronología del partido.`)
    }
  }
  if (partido.jugado) {
    const propio = norm(partido.local) === norm(CLUB.name)
    const nuestros = Number(propio ? partido.goles_local : partido.goles_visitante) || 0
    const rivales = Number(propio ? partido.goles_visitante : partido.goles_local) || 0
    if (n('goles_encajados') > rivales) fail(`${nombre}: el equipo solo encajó ${rivales} goles.`)
    if (!eventos.length) {
      const otros = stats.filter((s) => s.partido_id === partido.id && s.jugador_id !== row.jugador_id)
      if (otros.reduce((a, s) => a + (Number(s.goles) || 0), 0) + n('goles') > nuestros) fail(`Los jugadores suman más goles que los que marcó el equipo (${nuestros}).`)
      if (otros.reduce((a, s) => a + (Number(s.asistencias) || 0), 0) + n('asistencias') > nuestros) fail(`Las asistencias no pueden superar los goles del equipo (${nuestros}).`)
    }
  }
  return row
}

// ── MVP votes ───────────────────────────────────────────────────────────────
export function validarVoto({ partido, votante, votadoId, stats = [], jugadores = [] } = {}) {
  if (!partido?.jugado) fail('Solo se vota en partidos ya jugados.')
  if (!votante) fail('Inicia sesión como jugador para votar.')
  if (votante.activo === false) fail('Solo pueden votar los jugadores en activo.')
  if (Number(votadoId) === Number(votante.id)) fail('No puedes votarte a ti mismo.')
  const conv = (partido.convocados || []).map(Number)
  const jugo = stats.some((s) => s.partido_id === partido.id && s.jugador_id === Number(votadoId) && s.minutos > 0)
  if (!conv.includes(Number(votadoId)) && !jugo) fail(`${nombreDe(jugadores)(votadoId)} no participó en este partido.`)
}
