import { useState } from 'react'
import Icon from './Icon'
import MvpCandidatosPicker from './MvpCandidatosPicker'
import { estadoCierre } from '../lib/cierre'
import { statsFromEvents } from '../lib/timeline'
import { ourScore, rivalName } from '../lib/match'
import { validarFinalistas } from '../lib/validation'
import { messageFor } from '../lib/dbErrors'
import { enviarNotificacionResultado } from '../lib/push'
import { haptics } from '../lib/haptics'

/**
 * Admin panel on the match page: checklist and the button that marks the match
 * as played. Nothing is published (result, MVP vote, notification) until the
 * line-up, the timeline and the MVP candidates are ready.
 */
export default function CierrePartido({ partido, alineacion, eventos, jugadores, store, isSuperAdmin, onEditarAlineacion, onEditarConvocatoria }) {
  const [revisada, setRevisada] = useState(false)
  const [finalistas, setFinalistas] = useState(() => (partido.mvp_finalistas || []).map(Number))
  const [enviando, setEnviando] = useState(false)
  const [guardandoCand, setGuardandoCand] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const estado = estadoCierre({ partido, alineacion, eventos, finalistas, timelineRevisada: revisada })
  const guardados = (partido.mvp_finalistas || []).map(Number)
  const candidatosGuardados = guardados.length === estado.necesarios && finalistas.length === guardados.length && finalistas.every((id) => guardados.includes(id))
  // goals and assists so far, from the timeline (stats are calculated when the match is closed)
  const statsTimeline = Object.entries(statsFromEvents(eventos)).map(([id, s]) => ({ ...s, partido_id: partido.id, jugador_id: Number(id), minutos: 0 }))
  const { goles_local: gl, goles_visitante: gv } = estado.marcador
  const { nuestros, rivales } = ourScore({ ...partido, ...estado.marcador })
  const res = nuestros > rivales ? 'Victoria' : nuestros < rivales ? 'Derrota' : 'Empate'

  const guardarCandidatos = async () => {
    setError(''); setAviso('')
    try {
      validarFinalistas(finalistas, { partido, jugadores })
      setGuardandoCand(true)
      await store.updatePartido(partido.id, { mvp_finalistas: finalistas })
      setAviso('Candidatos guardados. Cualquier admin puede ya cerrar el partido.')
    } catch (e) { setError(messageFor(e)) } finally { setGuardandoCand(false) }
  }

  const cerrar = async () => {
    setError(''); setAviso('')
    if (!window.confirm(`Se publicará el resultado ${partido.local} ${gl}-${gv} ${partido.visitante}, se calcularán las estadísticas, se abrirá la votación del MVP y se avisará a la afición. ¿Cerrar el partido?`)) return
    setEnviando(true)
    try {
      await store.cerrarPartido(partido.id, { mvp_finalistas: estado.necesitaCandidatos && isSuperAdmin ? finalistas : null })
      haptics.success?.()
      enviarNotificacionResultado({ partido_id: partido.id, rival: rivalName(partido), resultado: `${res} ${nuestros}-${rivales}` })
    } catch (e) {
      haptics.error?.()
      setError(messageFor(e))
    } finally {
      setEnviando(false)
    }
  }

  const accion = (clave) => ({
    convocatoria: onEditarConvocatoria && { texto: 'Editar', fn: onEditarConvocatoria },
    alineacion: onEditarAlineacion && { texto: 'Editar', fn: onEditarAlineacion },
  }[clave])

  return (
    <section className="card cierre" aria-labelledby="cierre-title">
      <div className="section-head">
        <h2 id="cierre-title" className="with-icon"><Icon name="list-check" /> Cerrar el partido</h2>
        <span className="cierre__badge">Solo admins</span>
      </div>
      <p className="cierre__intro">
        Cuando todo esté listo, ciérralo: se publica el resultado, se calculan las estadísticas, se abre la votación del MVP y se avisa a la afición.
      </p>

      <ul className="cierre__pasos">
        {estado.pasos.map((p) => {
          const a = !p.ok && accion(p.clave)
          return (
            <li key={p.clave} className={p.ok ? 'ok' : ''}>
              <Icon name={p.ok ? 'check' : 'point'} size={16} />
              <span>{p.texto}</span>
              {a && <button type="button" className="cierre__link" onClick={a.fn}>{a.texto}</button>}
            </li>
          )
        })}
      </ul>

      <label className="cierre__check">
        <input type="checkbox" checked={revisada} onChange={(e) => setRevisada(e.target.checked)} />
        <span>He revisado la línea de tiempo: están todos los goles (con asistencias), tarjetas y cambios.</span>
      </label>

      <div className="cierre__marcador" aria-label={`Resultado según la línea de tiempo: ${partido.local} ${gl}, ${partido.visitante} ${gv}`}>
        <span>Resultado según la línea de tiempo</span>
        <strong>{gl} - {gv}</strong>
      </div>

      {estado.necesitaCandidatos && (isSuperAdmin ? (
        <>
          <MvpCandidatosPicker partido={partido} jugadores={jugadores} stats={statsTimeline} necesarios={estado.necesarios}
            value={finalistas} onChange={(v) => { setFinalistas(v); setAviso('') }} />
          {!candidatosGuardados && finalistas.length === estado.necesarios && (
            <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: -6, marginBottom: 12 }} onClick={guardarCandidatos} disabled={guardandoCand}>
              {guardandoCand ? 'Guardando…' : 'Guardar candidatos sin cerrar el partido'}
            </button>
          )}
        </>
      ) : (
        <p className="cierre__nota">
          <Icon name="star" /> {guardados.length
            ? <>Candidatos al MVP: {guardados.map((id) => jugadores.find((j) => j.id === id)?.nombre).filter(Boolean).join(', ')}.</>
            : 'Un superadmin tiene que elegir los candidatos al MVP antes de cerrar el partido.'}
        </p>
      ))}

      {aviso && <p className="cierre__nota cierre__nota--ok" role="status"><Icon name="check" /> {aviso}</p>}
      {error && <div className="alert-error"><Icon name="alert-triangle" /> {error}</div>}
      <button type="button" className="btn btn-primary btn-block" onClick={cerrar} disabled={!estado.listo || enviando}>
        {enviando ? <><Icon name="loader" spin /> Cerrando…</> : <span className="with-icon"><Icon name="check" /> Confirmar partido jugado</span>}
      </button>
      {!estado.listo && <p className="cierre__falta">Completa los puntos pendientes para poder cerrarlo.</p>}
    </section>
  )
}
