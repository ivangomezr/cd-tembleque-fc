/**
 * Turns a Supabase / PostgREST error into a message that is safe to show.
 *
 * - Validation errors raised by the database (SQLSTATE CD400, see migration
 *   20261017180000_data_integrity.sql) are written for users: shown as they are.
 * - Constraint violations are translated by constraint name.
 * - Anything else gets a generic message. Table names, SQL, constraint names and
 *   stack traces never reach the screen (they stay in the browser console).
 */

/** Messages by constraint / unique index name. */
export const CONSTRAINT_MESSAGES = {
  // Players
  jugadores_dorsal_unico: 'Ese dorsal ya lo lleva otro jugador en activo.',
  jugadores_dorsal_rango: 'El dorsal debe ser un número del 1 al 99.',
  jugadores_nombre_valido: 'El nombre del jugador es obligatorio (máximo 60 caracteres, sin caracteres especiales).',
  jugadores_posicion_check: 'Elige una posición válida.',
  jugadores_posicion_obligatoria: 'Elige la posición del jugador.',
  jugadores_estado_valido: 'El estado del jugador no es válido.',
  jugadores_capitania_valida: 'Elige primer capitán, segundo capitán o ninguno.',
  jugadores_foto_url_valida: 'La foto no es válida. Vuelve a subirla.',
  jugadores_privado_estado_desc_valido: 'La nota es demasiado larga (máximo 280 caracteres).',
  // Seasons
  temporadas_nombre_unico: 'Ya existe una temporada con ese nombre.',
  temporadas_nombre_valido: 'El nombre de la temporada es obligatorio (máximo 80 caracteres).',
  temporadas_anio_rango: 'El año de la temporada debe estar entre 2000 y 2100.',
  temporadas_zonas_rango: 'Las plazas de ascenso, promoción y descenso deben estar entre 0 y 30.',
  temporadas_duracion_rango: 'La duración del partido debe estar entre 1 y 120 minutos.',
  temporadas_una_activa: 'Solo puede haber una temporada activa.',
  // League teams
  equipos_liga_nombre_unico: 'Ya hay un equipo con ese nombre en la temporada.',
  equipos_liga_temporada_id_nombre_key: 'Ya hay un equipo con ese nombre en la temporada.',
  equipos_liga_un_propio: 'El club ya figura en esta temporada.',
  equipos_liga_nombre_valido: 'El nombre del equipo es obligatorio (máximo 80 caracteres).',
  equipos_liga_nombre_corto_valido: 'El nombre corto admite como máximo 16 caracteres.',
  equipos_liga_sancion_rango: 'La sanción debe estar entre 0 y 99 puntos.',
  equipos_liga_escudo_url_valida: 'El escudo no es válido. Vuelve a subirlo.',
  // League fixtures
  partidos_liga_enfrentamiento_unico: 'Ese enfrentamiento ya está registrado esta temporada.',
  partidos_liga_jornada_check: 'La jornada debe estar entre 1 y 99.',
  partidos_liga_jornada_rango: 'La jornada debe estar entre 1 y 99.',
  partidos_liga_goles_rango: 'Los goles deben estar entre 0 y 99.',
  partidos_liga_goles_local_check: 'Los goles deben estar entre 0 y 99.',
  partidos_liga_goles_visitante_check: 'Los goles deben estar entre 0 y 99.',
  partidos_liga_check: 'Un equipo no puede jugar contra sí mismo.',
  // Our matches
  partidos_jornada_unica: 'Ya hay un partido del club en esa jornada.',
  partidos_jornada_valida: 'Jornada no válida: los amistosos no llevan jornada y los de liga van de la 1 a la 99.',
  partidos_goles_rango: 'Los goles deben estar entre 0 y 99.',
  partidos_hora_formato: 'La hora debe tener el formato HH:MM.',
  partidos_campo_valido: 'El campo admite como máximo 120 caracteres.',
  partidos_temporada_obligatoria: 'El partido debe pertenecer a una temporada.',
  partidos_convocados_array: 'La convocatoria no es válida.',
  partidos_equipacion_check: 'Elige una equipación válida.',
  partidos_escudo_url_valida: 'El escudo no es válido. Vuelve a subirlo.',
  // Lineups, timeline, stats, votes
  alineaciones_jugadores_array: 'La alineación admite como máximo 11 jugadores.',
  alineaciones_partido_id_key: 'Este partido ya tiene alineación.',
  eventos_partido_minuto_check: 'El minuto debe estar entre 1 y 120.',
  eventos_partido_minuto_rango: 'El minuto debe estar entre 1 y 120.',
  eventos_partido_minuto_extra_check: 'El tiempo añadido va de 0 a 15 minutos.',
  eventos_partido_extra_rango: 'El tiempo añadido va de 0 a 15 minutos.',
  eventos_partido_nombre_rival_valido: 'El nombre del jugador rival admite como máximo 60 caracteres.',
  eventos_partido_jugadores_distintos: 'Entra y sale el mismo jugador.',
  eventos_partido_tipo_check: 'Tipo de evento no válido.',
  eventos_partido_equipo_check: 'Elige a qué equipo pertenece el evento.',
  estadisticas_minutos_check: 'Los minutos deben estar entre 0 y 120.',
  estadisticas_minutos_rango: 'Los minutos deben estar entre 0 y 120.',
  estadisticas_contadores_rango: 'Goles, asistencias, paradas y goles encajados deben estar entre 0 y 99.',
  estadisticas_tarjetas_rango: 'Un jugador puede ver como máximo 2 amarillas y 1 roja por partido.',
  estadisticas_doble_amarilla_expulsa: 'Dos amarillas suponen una expulsión: marca también la roja.',
  estadisticas_jugador_id_partido_id_key: 'Ya hay estadísticas de ese jugador en este partido.',
  votos_mvp_partido_id_votante_id_key: 'Ya has votado en este partido.',
  votos_mvp_check: 'No puedes votarte a ti mismo.',
  // Sponsors
  patrocinadores_nombre_valido: 'El nombre del patrocinador admite como máximo 80 caracteres.',
  patrocinadores_imagen_url_valida: 'La imagen no es válida. Vuelve a subirla.',
}

const BY_CODE = {
  '23505': 'Ese dato ya existe.',
  '23514': 'Algún dato está fuera de los valores permitidos.',
  '23502': 'Falta un dato obligatorio.',
  '22P02': 'Algún dato tiene un formato no válido.',
  '22003': 'Un número es demasiado grande.',
  '22001': 'Un texto es demasiado largo.',
  '22007': 'La fecha o la hora no son válidas.',
  '22008': 'La fecha o la hora no son válidas.',
  '42501': 'No tienes permiso para hacer esto. Si tu sesión ha caducado, vuelve a entrar.',
  PGRST301: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  PGRST303: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
}

export const GENERIC_MESSAGE = 'No se pudo guardar. Inténtalo de nuevo.'

const constraintOf = (error) => {
  const text = `${error?.message || ''} ${error?.details || ''}`
  return /constraint "([^"]+)"/.exec(text)?.[1] || null
}

/**
 * @param {{code?: string, message?: string, details?: string, hint?: string}|Error} error
 * @returns {string} message safe to show to the user
 */
export function friendlyDbMessage(error) {
  if (!error) return GENERIC_MESSAGE
  const code = String(error.code || '')
  if (code === 'CD400' && error.message) return error.message
  if (code === '23503') {
    return /still referenced|is referenced/i.test(`${error.message} ${error.details}`)
      ? 'No se puede borrar: hay otros datos que dependen de esto.'
      : 'Hace referencia a algo que ya no existe. Recarga la página.'
  }
  const constraint = constraintOf(error)
  if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint]
  if (BY_CODE[code]) return BY_CODE[code]
  if (/jwt|token/i.test(error.message || '')) return BY_CODE.PGRST301
  if (error.name === 'TypeError' || /failed to fetch|network/i.test(error.message || '')) {
    return 'Sin conexión con el servidor. Comprueba la conexión e inténtalo de nuevo.'
  }
  return GENERIC_MESSAGE
}

/** Error to throw from the data layer: friendly message, raw error kept in `cause`. */
export class UserFacingError extends Error {
  constructor(message, { cause, code, field } = {}) {
    super(message)
    this.name = 'UserFacingError'
    this.userMessage = true
    this.code = code
    this.field = field
    if (cause) this.cause = cause
  }
}

/** Wraps a PostgREST error (op/table only go to the console, never to the UI). */
export function dbError(op, table, error) {
  console.error(`[db] ${op} ${table}`, error)
  return new UserFacingError(friendlyDbMessage(error), { cause: error, code: error?.code })
}

/** What to show for any error caught in the UI. */
export const messageFor = (e) => (e?.userMessage ? e.message : GENERIC_MESSAGE)
