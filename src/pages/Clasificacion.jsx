import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStandings } from '../hooks/useStandings'
import { useStore } from '../hooks/useStore'
import { zoneFor, ZONES } from '../lib/standings'
import { CLUB, COMPETITION } from '../config/club'
import TeamCrest from '../components/TeamCrest'

const SCOPES = [
  { key: 'total', label: 'Total' },
  { key: 'home', label: 'Local' },
  { key: 'away', label: 'Visitante' },
]

const FORM_COLORS = { V: '#1f9d55', E: '#d69e2e', D: '#c0392b' }

export default function Clasificacion() {
  const [view, setView] = useState('tabla')
  const { loading } = useStore()
  const { table, equipos, results } = useStandings('total')
  const jugadas = results.filter((r) => r.jugado)
  const jornadaActual = Math.max(0, ...jugadas.map((r) => r.jornada || 0))
  const totalJornadas = equipos.length > 1 ? 2 * (equipos.length - 1) : 0

  return (
    <div className="page anim-fade">
      <Hero jornadaActual={jornadaActual} totalJornadas={totalJornadas} table={table} />

      <div className="segmented" style={{ marginBottom: '1rem' }}>
        <button className={view === 'tabla' ? 'active' : ''} onClick={() => setView('tabla')}>🏆 Clasificación</button>
        <button className={view === 'jornadas' ? 'active' : ''} onClick={() => setView('jornadas')}>📅 Jornadas</button>
      </div>

      {!loading && equipos.length < 2 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: 56, marginBottom: '1rem' }}>🏆</div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--primary)', marginBottom: 8 }}>La liga aún no está configurada</div>
          <div style={{ color: 'var(--gris-mid)', fontSize: 14 }}>Añade los equipos del {COMPETITION.group} desde Panel Admin › Liga.</div>
        </div>
      ) : view === 'tabla' ? (
        <Tabla />
      ) : (
        <Jornadas jornadaInicial={Math.max(1, jornadaActual)} totalJornadas={totalJornadas} />
      )}
    </div>
  )
}

function Hero({ jornadaActual, totalJornadas, table }) {
  const own = table.find((r) => r.team.es_propio)
  const leader = table[0]
  return (
    <div className="hero-navy" style={{ padding: '1.1rem 1.25rem', marginBottom: '1rem', position: 'relative', overflow: 'hidden' }}>
      <img src={CLUB.crest} alt="" aria-hidden style={{ position: 'absolute', right: -24, top: -18, width: 150, opacity: 0.08, pointerEvents: 'none' }} />
      <div style={{ fontSize: 11, color: 'var(--on-navy)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {COMPETITION.region} · Temporada {COMPETITION.season}
      </div>
      <h1 style={{ fontSize: 28, lineHeight: 1.05, margin: '2px 0 4px' }}>{COMPETITION.name} · {COMPETITION.group}</h1>
      <div style={{ fontSize: 12, color: 'var(--on-navy-muted)' }}>
        {jornadaActual ? `Jornada ${jornadaActual}${totalJornadas ? ` de ${totalJornadas}` : ''}` : 'La liga todavía no ha empezado'}
      </div>
      {own && own.pj > 0 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {[
            ['Posición', `${own.pos}º`],
            ['Puntos', own.pts],
            [own.pos === 1 ? 'Ventaja 2º' : 'Al líder', own.pos === 1 ? `+${own.pts - (table[1]?.pts ?? own.pts)}` : `−${leader.pts - own.pts}`],
          ].map(([l, v]) => (
            <div key={l} style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 10, color: 'var(--on-navy)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Tabla() {
  const [scope, setScope] = useState('total')
  const [full, setFull] = useState(false)
  const { table, zones } = useStandings(scope)
  const total = table.length
  const cols = full
    ? '22px minmax(0,1fr) 24px 22px 22px 22px 26px 26px 28px 30px'
    : '22px minmax(0,1fr) 26px 30px 30px 74px'
  const headers = full ? ['#', 'Equipo', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'Pts'] : ['#', 'Equipo', 'PJ', 'DG', 'Pts', 'Forma']
  const usedZones = Object.keys(ZONES).filter((z) => table.some((r) => zoneFor(r.pos, total, zones) === z))

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {SCOPES.map((s) => (
            <button key={s.key} className={`chip ${scope === s.key ? 'active' : ''}`} onClick={() => setScope(s.key)}>{s.label}</button>
          ))}
        </div>
        <button className="chip" onClick={() => setFull((v) => !v)} aria-pressed={full}>{full ? 'Resumida' : 'Completa'}</button>
      </div>

      <div className="card" style={{ padding: '0.6rem 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 4, padding: '0 10px 8px 12px', borderBottom: '1.5px solid #e8eef6', alignItems: 'center' }}>
          {headers.map((h) => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: 'var(--gris-mid)', textAlign: h === 'Equipo' ? 'left' : 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>

        {table.map((r, i) => {
          const ours = r.team.es_propio
          const zone = scope === 'total' ? zoneFor(r.pos, total, zones) : null
          const zoneColor = zone ? ZONES[zone].color : 'transparent'
          return (
            <div key={r.id} style={{
              display: 'grid', gridTemplateColumns: cols, gap: 4, alignItems: 'center',
              padding: '9px 10px 9px 9px',
              background: ours ? 'var(--primary-pale)' : 'transparent',
              borderBottom: i < table.length - 1 ? '1px solid #f1f4f9' : 'none',
              borderLeft: `3px solid ${zoneColor}`,
            }}>
              <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: zone ? zoneColor : 'var(--gris-mid)' }}>{r.pos}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <TeamCrest team={r.team} size={20} />
                <span style={{ fontSize: 13, fontWeight: ours ? 700 : 500, color: ours ? 'var(--primary)' : 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.team.nombre_corto || r.team.nombre}
                </span>
                {scope === 'total' && r.team.sancion_puntos > 0 && <span title={`Sanción: −${r.team.sancion_puntos} pts`} style={{ fontSize: 9, color: 'var(--danger)', fontWeight: 700 }}>*</span>}
              </div>
              {full ? (
                <>
                  {[r.pj, r.pg, r.pe, r.pp, r.gf, r.gc].map((v, k) => <div key={k} style={{ textAlign: 'center', fontSize: 12, color: '#4a5872' }}>{v}</div>)}
                  <Dg value={r.dg} />
                </>
              ) : (
                <>
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#4a5872' }}>{r.pj}</div>
                  <Dg value={r.dg} />
                </>
              )}
              <div style={{ textAlign: 'center', fontFamily: 'Bebas Neue', fontSize: 20, color: ours ? 'var(--primary)' : 'var(--navy)', lineHeight: 1 }}>{r.pts}</div>
              {!full && (
                <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                  {Array.from({ length: 5 }, (_, k) => r.forma[k - (5 - r.forma.length)] ?? null).map((f, k) => (
                    <span key={k} title={f ? { V: 'Victoria', E: 'Empate', D: 'Derrota' }[f] : ''} style={{
                      width: 12, height: 12, borderRadius: '50%', fontSize: 7, fontWeight: 800, color: 'white',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: f ? FORM_COLORS[f] : '#e3e9f2',
                    }}>{f || ''}</span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 11, color: 'var(--gris-mid)' }}>
        {scope === 'total' && usedZones.map((z) => (
          <span key={z} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: ZONES[z].color }} />{ZONES[z].label}
          </span>
        ))}
        <span>Forma: últimos 5 (más reciente a la derecha)</span>
        {table.some((r) => r.team.sancion_puntos > 0) && <span>* Equipo sancionado con pérdida de puntos</span>}
      </div>
      <p style={{ fontSize: 10, color: 'var(--gris-mid)', marginTop: 8, lineHeight: 1.4 }}>
        Desempate: puntos, enfrentamientos directos (si se han jugado ida y vuelta), diferencia de goles general y goles a favor.
      </p>
    </>
  )
}

function Dg({ value }) {
  return (
    <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: value > 0 ? '#1f9d55' : value < 0 ? '#c0392b' : '#8a96aa' }}>
      {value > 0 ? `+${value}` : value}
    </div>
  )
}

function Jornadas({ jornadaInicial, totalJornadas }) {
  const navigate = useNavigate()
  const { results, equipos } = useStandings()
  const maxJ = Math.max(totalJornadas, ...results.map((r) => r.jornada || 0), 1)
  const [jornada, setJornada] = useState(jornadaInicial)
  const team = (id) => equipos.find((e) => e.id === id)
  const partidos = results.filter((r) => r.jornada === jornada).sort((a, b) => Number(b.own) - Number(a.own))
  const juegan = new Set(partidos.flatMap((r) => [r.local_id, r.visitante_id]))
  const descansa = partidos.length ? equipos.filter((e) => !juegan.has(e.id)) : []

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button className="chip" disabled={jornada <= 1} onClick={() => setJornada((j) => j - 1)} aria-label="Jornada anterior">‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--navy)' }}>
          Jornada {jornada}
          {partidos[0]?.fecha && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--gris-mid)', marginTop: -2 }}>
            {new Date(partidos[0].fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
          </div>}
        </div>
        <button className="chip" disabled={jornada >= maxJ} onClick={() => setJornada((j) => j + 1)} aria-label="Jornada siguiente">›</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {partidos.length === 0 && <div className="empty">Sin partidos registrados en esta jornada</div>}
        {partidos.map((r, i) => {
          const L = team(r.local_id), V = team(r.visitante_id)
          const ganaL = r.jugado && r.goles_local > r.goles_visitante
          const ganaV = r.jugado && r.goles_visitante > r.goles_local
          return (
            <div key={r.id}
              onClick={() => r.own && navigate(`/partido/${r.partido_id}`)}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px minmax(0,1fr)', alignItems: 'center', gap: 8,
                padding: '12px 14px', cursor: r.own ? 'pointer' : 'default',
                background: r.own ? 'var(--primary-pale)' : 'white',
                borderBottom: i < partidos.length - 1 ? '1px solid #eef2f8' : 'none',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: ganaL || L?.es_propio ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{L?.nombre_corto || L?.nombre}</span>
                <TeamCrest team={L} size={26} />
              </div>
              <div style={{ textAlign: 'center' }}>
                {r.jugado
                  ? <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--navy)', background: '#f1f5fb', borderRadius: 8, padding: '2px 8px' }}>{r.goles_local} - {r.goles_visitante}</span>
                  : <span style={{ fontSize: 12, color: 'var(--gris-mid)', fontWeight: 600 }}>{r.hora || 'vs'}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <TeamCrest team={V} size={26} />
                <span style={{ fontSize: 13, fontWeight: ganaV || V?.es_propio ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{V?.nombre_corto || V?.nombre}</span>
              </div>
            </div>
          )
        })}
      </div>
      {descansa.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--gris-mid)', textAlign: 'center', marginTop: 10 }}>
          Descansa: {descansa.map((e) => e.nombre).join(', ')}
        </p>
      )}
    </>
  )
}
