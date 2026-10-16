import { useState, useEffect } from 'react'
import { store } from '../lib/store'

let initialized = false
let initPromise = null

/** Subscribes a component to the store and triggers the first load once per app. */
export function useStore() {
  const [, setTick] = useState(0)
  const [loading, setLoading] = useState(!initialized)

  useEffect(() => {
    if (!initialized) {
      initialized = true
      initPromise = store.init().finally(() => setLoading(false))
    } else if (initPromise) {
      initPromise.finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return store.subscribe(() => setTick((t) => t + 1))
  }, [])

  return {
    jugadores: store.getJugadores(),
    partidos: store.getPartidos(),
    stats: store.getStats(),
    equipos: store.getEquipos(),
    partidosLiga: store.getPartidosLiga(),
    temporada: store.getTemporadaActiva(),
    loading,
    store,
  }
}
