import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../hooks/useStore'
import { useAuth } from '../hooks/useAuth'
import Sheet from './Sheet'
import PlayerAvatar from './PlayerAvatar'
import { messageFor } from '../lib/dbErrors'
import { haptics } from '../lib/haptics'
import { votacionAbierta, tiempoRestante, porcentaje, candidatosMvp } from '../lib/mvp'
import { compartirMvp } from '../lib/shareMvp'

const corto = (nombre = '') => {
  const [a, ...r] = nombre.trim().split(/\s+/)
  return r.length ? `${a[0]}. ${r.join(' ')}` : a
}

/** Live state of the MVP vote of a match (refreshes every 30 s while open). */
export function useVotacionMvp(partido) {
  const { store } = useStore()
  const [votacion, setVotacion] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const id = partido?.id
  const abierta = votacionAbierta(partido, now)

  const refresh = useCallback(() => {
    if (!id || !partido?.jugado) return Promise.resolve()
    return store.getVotacionMvp(id).then(setVotacion).catch((e) => console.error('[mvp]', e))
  }, [id, partido?.jugado, store])

  useEffect(() => { setVotacion(null); refresh() }, [refresh])
  useEffect(() => {
    if (!abierta) return
    const t = setInterval(() => { setNow(new Date()); refresh() }, 30000)
    return () => clearInterval(t)
  }, [abierta, refresh])

  return { votacion, setVotacion, refresh, now, abierta: votacion ? votacion.abierta && abierta : abierta }
}

/** Bottom sheet to pick the best player: called-up players, those with goals/assists first. */
export function MvpVoteSheet({ partido, votacion, onVoted, onClose }) {
  const { jugadores, stats, store } = useStore()
  const candidatos = candidatosMvp(partido, jugadores, stats)
  const [sel, setSel] = useState(votacion?.miVoto ?? null)
  const [todos, setTodos] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const visibles = todos || candidatos.length <= 6 ? candidatos : candidatos.slice(0, 6)
  const elegido = candidatos.find((c) => c.id === sel)

  const votar = async () => {
    if (!sel) return
    setEnviando(true)
    setError('')
    try {
      const v = await store.votarMvp(partido.id, sel)
      haptics.success?.()
      onVoted(v, elegido)
    } catch (e) {
      haptics.error?.()
      setError(messageFor(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Sheet title="¿Quién ha sido el mejor?" onClose={onClose}>
      <p className="mvp-sheet__sub">{partido.local} {partido.goles_local}-{partido.goles_visitante} {partido.visitante} · un voto por persona</p>
      {!candidatos.length ? (
        <p className="empty">Todavía no está la convocatoria de este partido.</p>
      ) : (
        <>
          <div className="mvp-grid" role="radiogroup" aria-label="Jugadores">
            {visibles.map((j) => (
              <button key={j.id} type="button" role="radio" aria-checked={sel === j.id}
                className={`mvp-pick${sel === j.id ? ' mvp-pick--sel' : ''}`} onClick={() => setSel(j.id)}>
                <PlayerAvatar jugador={j} size={48} />
                <span className="mvp-pick__name">{corto(j.nombre)}</span>
                <span className="mvp-pick__meta">
                  {j.goles > 0 && `⚽ ${j.goles} `}{j.asistencias > 0 && `🅰️ ${j.asistencias} `}
                  {!(j.goles || j.asistencias) && (j.posicion === 'Portero' ? 'Portero' : j.dorsal != null ? `#${j.dorsal}` : '')}
                  {j.minutos > 0 && ` · ${j.minutos}'`}
                </span>
              </button>
            ))}
          </div>
          {!todos && candidatos.length > 6 && (
            <button type="button" className="mvp-more" onClick={() => setTodos(true)}>Ver los {candidatos.length} convocados ▾</button>
          )}
        </>
      )}
      {error && <div className="alert-error" style={{ marginTop: 10 }}>⚠️ {error}</div>}
      <button type="button" className="btn btn-primary btn-block mvp-confirm" disabled={!sel || enviando} onClick={votar}>
        {enviando ? 'Enviando…' : elegido ? (votacion?.miVoto && votacion.miVoto !== sel ? `Cambiar mi voto a ${corto(elegido.nombre)}` : `Votar a ${corto(elegido.nombre)}`) : 'Elige un jugador'}
      </button>
      <p className="mvp-note">Sin registro · puedes cambiar tu voto hasta que cierre la votación</p>
    </Sheet>
  )
}

/** Live (or final) percentages. */
export function MvpResults({ votacion, max = 5, titulo = 'Votación en directo' }) {
  const { jugadores } = useStore()
  if (!votacion) return null
  const filas = votacion.ranking.slice(0, max).map((r) => ({ ...r, jugador: jugadores.find((j) => j.id === r.jugador_id) })).filter((r) => r.jugador)
  return (
    <div className="mvp-results">
      <div className="mvp-results__head">
        <span>{titulo}</span>
        <span>{votacion.total} {votacion.total === 1 ? 'voto' : 'votos'}</span>
      </div>
      {!filas.length ? <p className="mvp-results__empty">Todavía no hay votos. ¡Sé el primero!</p> : (
        <ol className="mvp-results__list">
          {filas.map((r) => {
            const pct = porcentaje(r.votos, votacion.total)
            return (
              <li key={r.jugador_id} className={votacion.miVoto === r.jugador_id ? 'mine' : ''}>
                <PlayerAvatar jugador={r.jugador} size={34} />
                <div className="mvp-results__bar">
                  <span className="mvp-results__name">{r.jugador.nombre}{votacion.miVoto === r.jugador_id && <small> · tu voto</small>}</span>
                  <span className="mvp-results__track" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                </div>
                <b aria-label={`${pct} por ciento, ${r.votos} votos`}>{pct}%</b>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/** Winner card, shown once voting has closed. Admins can share it on Instagram. */
export function MvpWinner({ partido, votacion }) {
  const { jugadores, store } = useStore()
  const { isAdmin } = useAuth()
  const [compartiendo, setCompartiendo] = useState(false)
  const id = votacion?.mvpJugadorId ?? partido?.mvp_jugador_id
  const j = jugadores.find((x) => x.id === id)
  if (!j) return null
  const votos = votacion?.ranking.find((r) => r.jugador_id === id)?.votos || 0
  const pct = porcentaje(votos, votacion?.total || 0)
  const compartir = async () => {
    setCompartiendo(true)
    try { await compartirMvp({ partido, jugador: j, porcentaje: pct, total: votacion?.total || 0, crestFor: store.crestFor }) }
    catch (e) { if (e?.name !== 'AbortError') window.alert(messageFor(e)) }
    finally { setCompartiendo(false) }
  }
  return (
    <div className="mvp-winner">
      <PlayerAvatar jugador={j} size={68} />
      <div style={{ minWidth: 0 }}>
        <span className="mvp-winner__tag">MVP · {partido.amistoso ? 'Amistoso' : `Jornada ${partido.jornada}`}</span>
        <div className="mvp-winner__name">{j.nombre}</div>
        {votacion?.total > 0 && <div className="mvp-winner__meta">{pct}% de {votacion.total} {votacion.total === 1 ? 'voto' : 'votos'}</div>}
      </div>
      {isAdmin && (
        <button type="button" className="mvp-winner__share" onClick={compartir} disabled={compartiendo} aria-label="Compartir el MVP en Instagram">
          {compartiendo ? '…' : '📲'}
        </button>
      )}
    </div>
  )
}

export { tiempoRestante }
