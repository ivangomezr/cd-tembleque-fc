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
  gol: { label: 'Gol', icon: 'ball', goal: true },
  gol_penalti: { label: 'Gol de penalti', icon: 'ball', goal: true, badge: 'P' },
  gol_propia: { label: 'Gol en propia', icon: 'ball', goal: true, badge: 'PP' },
  penalti_fallado: { label: 'Penalti fallado', icon: 'circle-x' },
  amarilla: { label: 'Tarjeta amarilla', icon: 'yellow' },
  segunda_amarilla: { label: 'Segunda amarilla', icon: 'second-yellow' },
  roja: { label: 'Tarjeta roja', icon: 'red' },
  cambio: { label: 'Cambio', icon: 'arrows-exchange' },
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

/** First minute of the second half (46' in a 90' match), where half-time substitutions are written. */
export const minutoDescanso = (duration = 90) => Math.floor(duration / 2) + 1

/** A substitution made at half-time: written as 46' (after the break) but it happens at 45'. */
export const esCambioDescanso = (e, duration = 90) =>
  e?.tipo === 'cambio' && !Number(e.minuto_extra) && Number(e.minuto) === minutoDescanso(duration)

/**
 * Effective minute for minutes played, capped to the regulation length (90+3 → 90, 45+2 → 45).
 * A half-time substitution counts at the end of the first half, so both players get 45'.
 */
const effMinute = (e, duration) =>
  esCambioDescanso(e, duration) ? Math.floor(duration / 2) : Math.min(Math.max(Number(e.minuto) || 0, 0), duration)

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

/**
 * Replays a match timeline and returns the first impossible step, or null.
 * Mirrors validacion.cronologia() in the database (migration 20261017180000):
 *   - nobody acts after being sent off (same minute is allowed);
 *   - a second yellow must be a «segunda_amarilla» after one «amarilla»;
 *   - nobody is sent off twice;
 *   - when the starting XI is known: the player going off must be on the pitch,
 *     the one coming on must not, and scorers / assisters / penalty takers must
 *     be playing at that minute. Cards can go to substitutes on the bench.
 *
 * @param {Array} events
 * @param {number[]} starters  starting XI ids ([] = unknown)
 * @param {(id:number)=>string} nameOf
 */
export function timelineIssue(events = [], starters = [], nameOf = (id) => `Jugador ${id}`) {
  const known = starters.length > 0
  const pitch = new Set(starters.map(Number))
  const sentOff = new Map() // id → time
  const yellows = new Map()
  const t = (e) => (Number(e.minuto) || 0) * 100 + (Number(e.minuto_extra) || 0)

  for (const e of sortEvents(events)) {
    const time = t(e)
    const at = minuteLabel(e)
    const ours = e.equipo === 'propio'
    const involved = (ours ? [e.jugador_id, e.jugador2_id] : e.tipo === 'gol_propia' ? [e.jugador_id] : [])
      .filter((x) => x != null).map(Number)
    for (const id of involved) {
      if (sentOff.has(id) && time > sentOff.get(id)) return `${nameOf(id)} no puede aparecer en el ${at}: ya había sido expulsado.`
    }
    const p = e.jugador_id != null ? Number(e.jugador_id) : null
    const p2 = e.jugador2_id != null ? Number(e.jugador2_id) : null

    if (ours && p != null) {
      if (e.tipo === 'amarilla') {
        if ((yellows.get(p) || 0) >= 1) return `${nameOf(p)} ya tenía una amarilla: la del ${at} regístrala como «2ª amarilla».`
        yellows.set(p, 1)
      } else if (e.tipo === 'segunda_amarilla') {
        if ((yellows.get(p) || 0) !== 1) return `${nameOf(p)} no tiene una amarilla anterior al ${at}.`
        if (sentOff.has(p)) return `${nameOf(p)} ya había sido expulsado.`
        yellows.set(p, 2); sentOff.set(p, time); pitch.delete(p)
      } else if (e.tipo === 'roja') {
        if (sentOff.has(p)) return `${nameOf(p)} ya había sido expulsado.`
        sentOff.set(p, time); pitch.delete(p)
      } else if (e.tipo === 'cambio') {
        if (known && p2 != null && !pitch.has(p2)) return `${nameOf(p2)} no estaba en el campo en el ${at} para ser sustituido.`
        if (known && pitch.has(p)) return `${nameOf(p)} ya estaba en el campo en el ${at}.`
        if (p2 != null) pitch.delete(p2)
        pitch.add(p)
      } else {
        for (const id of [p, p2].filter((x) => x != null)) {
          if (known && !pitch.has(id)) return `${nameOf(id)} no estaba en el campo en el ${at}.`
        }
      }
    } else if (ours && e.tipo === 'gol_propia' && p2 != null) {
      if (known && !pitch.has(p2)) return `${nameOf(p2)} no estaba en el campo en el ${at}.`
    } else if (!ours && e.tipo === 'gol_propia' && p != null) {
      if (known && !pitch.has(p)) return `${nameOf(p)} no estaba en el campo en el ${at}.`
    }
  }
  return null
}

/** Starting XI ids from an `alineaciones.jugadores` value (slots or plain ids). */
export function startersFromLineup(lineup) {
  const slots = lineup?.jugadores || []
  return slots
    .map((s) => (s && typeof s === 'object' ? s.jugador_id : s))
    .filter((id) => id != null)
    .map(Number)
}

/**
 * Per-player event summary for OUR players, used for the little badges on the pitch
 * and next to substitutes.
 * @returns {Record<number, { goles, penaltis, propia, amarillas, roja, segunda }>}
 */
export function eventsByPlayer(events = []) {
  const out = {}
  const get = (id) => (out[id] ||= { goles: 0, penaltis: 0, propia: 0, amarillas: 0, roja: false, segunda: false })
  for (const e of events) {
    if (!e.jugador_id) continue
    if (e.equipo === 'propio') {
      if (e.tipo === 'gol') get(e.jugador_id).goles++
      if (e.tipo === 'gol_penalti') { get(e.jugador_id).goles++; get(e.jugador_id).penaltis++ }
      if (e.tipo === 'amarilla') get(e.jugador_id).amarillas++
      if (e.tipo === 'segunda_amarilla') { get(e.jugador_id).amarillas++; get(e.jugador_id).segunda = true }
      if (e.tipo === 'roja') get(e.jugador_id).roja = true
    }
    // our player scoring in our own net is stored on the rival side
    if (e.equipo === 'rival' && e.tipo === 'gol_propia') get(e.jugador_id).propia++
  }
  return out
}
