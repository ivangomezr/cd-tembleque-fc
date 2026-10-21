import PlayerAvatar from './PlayerAvatar'
import { candidatosMvp } from '../lib/mvp'

const corto = (nombre = '') => {
  const [a, ...r] = nombre.trim().split(/\s+/)
  return r.length ? `${a[0]}. ${r.join(' ')}` : a
}

/**
 * Superadmin picks the players fans can vote as MVP, from the call-up
 * (players with goals or assists first, then by minutes).
 */
export default function MvpCandidatosPicker({ partido, jugadores, stats, value = [], onChange, necesarios, disabled = false }) {
  const convocados = candidatosMvp({ ...partido, mvp_finalistas: null }, jugadores, stats)
  const lleno = value.length >= necesarios
  const toggle = (id) => {
    if (disabled) return
    if (value.includes(id)) onChange(value.filter((x) => x !== id))
    else if (!lleno) onChange([...value, id])
  }
  return (
    <fieldset className="mvp-candidatos" disabled={disabled}>
      <legend className="mvp-candidatos__head">
        <span className="label" style={{ margin: 0 }}>⭐ Candidatos al MVP</span>
        <span className={`mvp-candidatos__count${value.length === necesarios ? ' ok' : ''}`} aria-live="polite">{value.length}/{necesarios}</span>
      </legend>
      <p className="mvp-candidatos__help">
        Solo se podrá votar a estos jugadores. {necesarios < 5 ? `Hay ${necesarios} convocados: entran todos.` : 'Elige 5 de los convocados.'}
      </p>
      <div className="mvp-candidatos__grid">
        {convocados.map((j) => {
          const sel = value.includes(j.id)
          return (
            <button key={j.id} type="button" role="checkbox" aria-checked={sel} aria-disabled={!sel && lleno}
              className={`mvp-pick mvp-pick--sm${sel ? ' mvp-pick--sel' : ''}${!sel && lleno ? ' mvp-pick--off' : ''}`}
              onClick={() => toggle(j.id)}>
              <PlayerAvatar jugador={j} size={36} />
              <span className="mvp-pick__name">{corto(j.nombre)}</span>
              <span className="mvp-pick__meta">
                {j.goles > 0 && `⚽ ${j.goles} `}{j.asistencias > 0 && `🅰️ ${j.asistencias} `}
                {!(j.goles || j.asistencias) && (j.dorsal != null ? `#${j.dorsal}` : j.posicion || '')}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
