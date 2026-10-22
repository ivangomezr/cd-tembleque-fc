import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import PlayerCard from '../components/PlayerCard'
import { POSICIONES, CAPITANIA, byDorsal } from '../lib/players'
import PlayerAvatar from '../components/PlayerAvatar'
import AppLink from '../components/AppLink'
import Icon from '../components/Icon'

const FILTROS = ['Todos', ...POSICIONES]
const PLURAL = { Todos: 'Todos', Portero: 'Porteros', Defensa: 'Defensas', Centrocampista: 'Centrocampistas', Delantero: 'Delanteros' }

/** Squad: one card per player, ordered by shirt number. Tapping a card opens the player page. */
export default function Jugadores() {
  const nav = useNavigate()
  const { jugadores = [], loading } = useStore()
  const [filtro, setFiltro] = useState('Todos')

  const activos = jugadores.filter((j) => j.activo !== false)
  const lista = (filtro === 'Todos' ? activos : activos.filter((j) => j.posicion === filtro)).sort(byDorsal)
  const cuenta = (f) => (f === 'Todos' ? activos.length : activos.filter((j) => j.posicion === f).length)
  const capitanes = activos.filter((j) => CAPITANIA[j.capitania]).sort((a, b) => a.capitania - b.capitania || byDorsal(a, b))

  return (
    <div className="page squad anim-fade">
      <header className="squad-head">
        <h1 className="page-title" style={{ margin: 0 }}>Plantilla</h1>
        <span className="squad-count">{activos.length} jugadores</span>
      </header>

      {capitanes.length > 0 && (
        <section className="captains" aria-labelledby="captains-title">
          <h2 id="captains-title" className="captains__title with-icon"><Icon name="captain" /> Capitanes</h2>
          <ul className="captains__list">
            {capitanes.map((j) => (
              <li key={j.id}>
                <AppLink to={`/jugadores/${j.id}`} className="captains__item">
                  <span className="captains__avatar">
                    <PlayerAvatar jugador={j} size={40} />
                    <span className={`captains__band captains__band--${j.capitania}`} aria-hidden="true"><Icon name="captain-filled" size={14} /></span>
                  </span>
                  <span className="captains__who">
                    <span className="captains__name">{j.nombre}</span>
                    <span className="captains__role">{CAPITANIA[j.capitania].label}</span>
                  </span>
                </AppLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="squad-filters" role="group" aria-label="Filtrar por posición">
        {FILTROS.map((f) => (
          <button key={f} type="button" className={`chip${filtro === f ? ' active' : ''}`} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
            {PLURAL[f]} <span className="chip-count">{cuenta(f)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty" role="status">Cargando plantilla…</div>
      ) : !lista.length ? (
        <div className="empty">{activos.length ? 'No hay jugadores en esta posición.' : 'Todavía no hay jugadores en la plantilla.'}</div>
      ) : (
        <ul className="squad-grid" aria-label={`${PLURAL[filtro]} ordenados por dorsal`}>
          {lista.map((j, i) => (
            <li key={j.id}>
              <PlayerCard jugador={j} href={`/jugadores/${j.id}`} onOpen={() => nav(`/jugadores/${j.id}`)} priority={i < 4} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
