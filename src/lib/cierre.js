/**
 * "Cerrar el partido": what has to be ready before a match is marked as played,
 * so that when fans get the notification and open the app they find the line-up,
 * the timeline, the stats and the MVP candidates (pure, no I/O).
 */
import { startersFromLineup, scoreFromEvents } from './timeline'
import { isHome } from './match'
import { yaEmpezado, candidatosNecesarios, necesitaCandidatos } from './validation'

export const TITULARES = 11

/** Final score from the timeline goals, as goles_local / goles_visitante. */
export function marcadorDesdeTimeline(partido, eventos = []) {
  const { propio, rival } = scoreFromEvents(eventos)
  return isHome(partido) ? { goles_local: propio, goles_visitante: rival } : { goles_local: rival, goles_visitante: propio }
}

/**
 * Checklist to close a match.
 * @param finalistas candidates chosen in the panel (or the saved ones)
 * @param timelineRevisada the admin confirms the timeline is complete
 * @returns {{ pasos: {clave, ok, texto}[], listo: boolean, marcador, necesitaCandidatos: boolean, necesarios: number, empezado: boolean }}
 */
export function estadoCierre({ partido, alineacion, eventos = [], finalistas = null, timelineRevisada = false, now = new Date() }) {
  const empezado = yaEmpezado(partido.fecha, partido.hora, now)
  const convocados = (partido.convocados || []).length
  const titulares = startersFromLineup(alineacion).length
  const pideCandidatos = necesitaCandidatos(partido, now)
  const necesarios = candidatosNecesarios(partido)
  const elegidos = (finalistas ?? partido.mvp_finalistas ?? []).length
  const marcador = marcadorDesdeTimeline(partido, eventos)

  const pasos = [
    { clave: 'empezado', ok: empezado, texto: empezado ? 'El partido ya ha empezado' : 'Se podrá cerrar cuando empiece el partido' },
    { clave: 'convocatoria', ok: convocados >= TITULARES, texto: convocados ? `Convocatoria: ${convocados} jugadores` : 'Falta la convocatoria' },
    { clave: 'alineacion', ok: titulares === TITULARES, texto: `Alineación titular: ${titulares}/${TITULARES}` },
    { clave: 'timeline', ok: !!timelineRevisada, texto: `Línea de tiempo: ${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'}${timelineRevisada ? ', revisada' : ', sin revisar'}` },
  ]
  if (pideCandidatos) {
    pasos.push({ clave: 'candidatos', ok: necesarios > 0 && elegidos === necesarios, texto: `Candidatos al MVP: ${elegidos}/${necesarios || 5}` })
  }
  return { pasos, listo: pasos.every((p) => p.ok), marcador, necesitaCandidatos: pideCandidatos, necesarios, empezado }
}
