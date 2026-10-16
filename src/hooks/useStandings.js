import { useMemo } from 'react'
import { useStore } from './useStore'
import { CLUB } from '../config/club'
import { computeStandings, ownMatchesAsResults } from '../lib/standings'

/** League table + all league results (our matches merged with the rest). */
export function useStandings(scope = 'total') {
  const { equipos, partidos, partidosLiga, temporada } = useStore()
  return useMemo(() => {
    const own = ownMatchesAsResults(partidos, equipos, CLUB.name)
    const results = [...partidosLiga, ...own]
    const table = computeStandings(equipos, results, scope)
    const zones = {
      ascenso: temporada?.zona_ascenso ?? 1,
      promocion: temporada?.zona_promocion ?? 0,
      descenso: temporada?.zona_descenso ?? 0,
    }
    const ownRow = table.find((r) => r.team.es_propio)
    return { table, results, zones, ownRow, equipos, temporada }
  }, [equipos, partidos, partidosLiga, temporada, scope])
}
