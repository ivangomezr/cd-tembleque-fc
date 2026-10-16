/**
 * Match timeline helpers (pure, no I/O).
 *
 * Event shape (table `eventos_partido`):
 *   {
 *     id, partido_id,
 *     minuto: 1..120, minuto_extra: 0..15   // 45+2 → minuto 45, minuto_extra 2
 *     tipo: see EVENT_TYPES,
 *     equipo: 'propio' | 'rival',           // side the event belongs to on the timeline
 *     jugador_id,      // our player: scorer / booked player / player coming ON
 *     jugador2_id,     // our player: assist provider / player going OFF
 *     nombre_rival,    // free text for rival players (optional)
 *   }
 *
 * Own goals are shown on the side that BENEFITS from the goal:
 *   - equipo 'propio' + gol_propia → a rival player scored in his own net (goal for us)
 *   - equipo 'rival'  + gol_propia → one of our players scored in our net (jugador_id = our player)
 */

export const EVENT_TYPES = {
  gol: { label: 'Gol', icon: '⚽', goal: true },
  gol_penalti: { label: 'Gol de penalti', icon: '⚽', goal: true, badge: 'P' },
  gol_propia: { label: 'Gol en propia', icon: '⚽', goal: true, badge: 'PP' },
  penalti_fallado: { label: 'Penalti fallado', icon: '❌' },
  amarilla: { label: 'Tarjeta amarilla', icon: 'yellow' },
  segunda_amarilla: { label: 'Segunda amarilla', icon: 'second-yellow' },
  roja: { label: 'Tarjeta roja', icon: 'red' },
  cambio: { label: 'Cambio', icon: '🔄' },
}

export const isGoal = (e) => !!EVENT_TYPES[e.tipo]?.goal

export const minuteLabel = (e) =>
  `${e.minuto}${e.minuto_extra ? `+${e.minuto_extra}` : ''}'`

/** Chronological order; within the same minute keep insertion order. */
export const sortEvents = (events = []) =>
  [...events].sort(
    (a, b) =>
      (a.minuto ?? 0) - (b.minuto ?? 0) ||
      (a.minuto_extra ?? 0) - (b.minuto_extra ?? 0) ||
      String(a.created_at ?? a.id ?? '').localeCompare(String(b.created_at ?? b.id ?? ''))
  )

/** Goals per side according to the timeline. */
export function scoreFromEvents(events = []) {
  return events.reduce(
    (acc, e) => {
      if (isGoal(e)) acc[e.equipo === 'propio' ? 'propio' : 'rival']++
      return acc
    },
    { propio: 0, rival: 0 }
  )
}

/** Running score after each event: [{ event, propio, rival }]. */
export function withRunningScore(events = []) {
  let propio = 0, rival = 0
  return sortEvents(events).map((e) => {
    if (isGoal(e)) e.equipo === 'propio' ? propio++ : rival++
    return { event: e, propio, rival }
  })
}

/** Effective minute capped to the regulation length (90+3 → 90, 45+2 → 45). */
const effMinute = (e, duration) => Math.min(Math.max(Number(e.minuto) || 0, 0), duration)

/**
 * Minutes played, starts and goals conceded (goalkeepers) for OUR players.
 *
 * @param {object} args
 * @param {number[]} args.starters      ids of the starting XI
 * @param {Array}    args.events        timeline events
 * @param {number}   args.duration      regulation length (default 90)
 * @param {(id:number)=>boolean} args.isGoalkeeper
 * @returns {{ minutos: Record<number, number>, titular: Record<number, boolean>, golesEncajados: Record<number, number> }}
 */
export function computePlayerMinutes({ starters = [], events = [], duration = 90, isGoalkeeper = () => false }) {
  const minutos = {}
  const titular = {}
  const golesEncajados = {}
  const onPitch = new Map() // id → minute he came on

  const close = (id, minute) => {
    if (!onPitch.has(id)) return
    minutos[id] = (minutos[id] || 0) + Math.max(0, minute - onPitch.get(id))
    onPitch.delete(id)
  }

  starters.filter(Boolean).forEach((id) => {
    onPitch.set(id, 0)
    titular[id] = true
    minutos[id] = minutos[id] || 0
  })

  for (const e of sortEvents(events)) {
    const m = effMinute(e, duration)

    if (e.equipo === 'propio' && e.tipo === 'cambio') {
      if (e.jugador2_id) close(e.jugador2_id, m)
      if (e.jugador_id && !onPitch.has(e.jugador_id)) {
        onPitch.set(e.jugador_id, m)
        minutos[e.jugador_id] = minutos[e.jugador_id] || 0
        titular[e.jugador_id] = titular[e.jugador_id] || false
      }
    }

    if (e.equipo === 'propio' && (e.tipo === 'roja' || e.tipo === 'segunda_amarilla') && e.jugador_id) {
      close(e.jugador_id, m)
    }

    // Goals against → credit every goalkeeper on the pitch at that moment
    if (e.equipo === 'rival' && isGoal(e)) {
      for (const id of onPitch.keys()) {
        if (isGoalkeeper(id)) golesEncajados[id] = (golesEncajados[id] || 0) + 1
      }
    }
  }

  for (const id of [...onPitch.keys()]) close(id, duration)
  return { minutos, titular, golesEncajados }
}

/**
 * Per-player stats derived from the timeline (our players only).
 * @returns {Record<number, { goles, asistencias, tarjetas_amarillas, tarjetas_rojas }>}
 */
export function statsFromEvents(events = []) {
  const out = {}
  const get = (id) => (out[id] ||= { goles: 0, asistencias: 0, tarjetas_amarillas: 0, tarjetas_rojas: 0 })

  for (const e of events) {
    if (e.equipo !== 'propio') continue
    if ((e.tipo === 'gol' || e.tipo === 'gol_penalti') && e.jugador_id) {
      get(e.jugador_id).goles++
      if (e.jugador2_id) get(e.jugador2_id).asistencias++
    }
    if (e.tipo === 'gol_propia' && e.jugador2_id) get(e.jugador2_id).asistencias++
    if (e.tipo === 'amarilla' && e.jugador_id) get(e.jugador_id).tarjetas_amarillas++
    if (e.tipo === 'segunda_amarilla' && e.jugador_id) {
      get(e.jugador_id).tarjetas_amarillas++
      get(e.jugador_id).tarjetas_rojas++
    }
    if (e.tipo === 'roja' && e.jugador_id) get(e.jugador_id).tarjetas_rojas++
  }
  return out
}

/** Starting XI ids from an `alineaciones.jugadores` value (slots or plain ids). */
export function startersFromLineup(lineup) {
  const slots = lineup?.jugadores || []
  return slots
    .map((s) => (s && typeof s === 'object' ? s.jugador_id : s))
    .filter((id) => id != null)
    .map(Number)
}
