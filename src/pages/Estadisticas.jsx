import { useState } from 'react'
import { useStore } from '../hooks/useStore'
import { playerTotals, fmtMin } from '../lib/playerTotals'
import { COMPETITION } from '../config/club'
import PlayerAvatar from '../components/PlayerAvatar'
import AppLink from '../components/AppLink'

const Avatar = ({ jugador }) => <PlayerAvatar jugador={jugador} size={32} />

const tabs = [
  { key: 'goles', label: '⚽ Goles', color: 'var(--primary)' },
  { key: 'asistencias', label: '🅰️ Asistencias', color: 'var(--primary)' },
  { key: 'minutos', label: '🕒 Minutos', color: 'var(--navy)', fmt: fmtMin },
  { key: 'partidos', label: '🎮 Partidos', color: 'var(--primary-mid)' },
  { key: 'titularidades', label: '👕 Titular', color: 'var(--primary-mid)' },
  { key: 'tarjetas_amarillas', label: '🟨 Amarillas', color: '#b8860b' },
  { key: 'tarjetas_rojas', label: '🟥 Rojas', color: '#c0392b' },
  { key: 'paradas', label: '🧤 Paradas', color: 'var(--primary)', gk: true },
  { key: 'goles_encajados', label: '🥅 Encajados', color: '#c0392b', gk: true },
]

export default function Estadisticas() {
  const { jugadores, stats, partidos } = useStore()
  const [tab, setTab] = useState('goles')
  const cur = tabs.find((t) => t.key === tab)
  const totales = playerTotals(jugadores, stats, partidos)

  const sorted = totales
    .filter((j) => j[tab] > 0 && (!cur.gk || j.posicion === 'Portero'))
    .sort((a, b) => b[tab] - a[tab] || (tab === 'goles' ? a.minutos - b.minutos : 0))
  const max = Math.max(...totales.map((j) => j[tab]), 1)
  const sum = (k) => totales.reduce((s, j) => s + j[k], 0)
  const jornadas = partidos.filter((p) => p.jugado && !p.amistoso).length

  return (
    <div className="page anim-fade">
      <h1 className="page-title">Estadísticas</h1>
      <p style={{ fontSize: 12, color: 'var(--gris-mid)', marginTop: -8, marginBottom: 14 }}>{COMPETITION.name} {COMPETITION.season}</p>
      <div className="grid-4" style={{ marginBottom: '1.25rem' }}>
        {[['Goles', sum('goles'), 'var(--primary)'], ['Asistencias', sum('asistencias'), 'var(--primary-mid)'], ['Amarillas', sum('tarjetas_amarillas'), '#b8860b'], ['Jornadas', jornadas, 'var(--navy)']].map(([l, v, c]) => (
          <div key={l} className="metric-card"><div className="metric-label">{l}</div><div className="metric-value" style={{ color: c }}>{v}</div></div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: '1rem', scrollbarWidth: 'none' }}>
        {tabs.map((t) => <button key={t.key} className={`chip ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
        {sorted.length === 0 && <div className="empty">Sin datos aún</div>}
        {sorted.map((j, i) => (
          <AppLink key={j.id} to={`/jugadores/${j.id}`} className="stat-row" aria-label={`${j.nombre}: ${cur.fmt ? cur.fmt(j[tab]) : j[tab]} ${cur.label.replace(/^\S+\s/, '').toLowerCase()}. Ver ficha`}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < sorted.length - 1 ? '1px solid #eef2f8' : 'none', background: i === 0 ? 'var(--primary-pale)' : 'white', color: 'inherit', textDecoration: 'none' }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, minWidth: 24, textAlign: 'center', color: ['#c8a800', '#909090', '#a06030', '#b9cbe2'][Math.min(i, 3)] }}>{i + 1}</div>
            <Avatar jugador={j} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{j.nombre}</div>
              <div style={{ fontSize: 11, color: 'var(--gris-mid)' }}>
                {j.posicion} · {j.partidos} PJ · {fmtMin(j.minutos)}
                {tab === 'goles' && j.minutosPorGol ? ` · 1 gol cada ${j.minutosPorGol}'` : ''}
              </div>
            </div>
            <div className="bar-wrap" style={{ maxWidth: 70 }}><div className="bar-fill" style={{ width: `${Math.round((j[tab] / max) * 100)}%`, background: cur.color }} /></div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: cur.color, minWidth: 34, textAlign: 'right' }}>{cur.fmt ? cur.fmt(j[tab]) : j[tab]}</div>
            <span aria-hidden="true" style={{ color: 'var(--gris-light)', fontSize: 18 }}>›</span>
          </AppLink>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Jugador</th>
              {['PJ', 'Tit', 'Min', '⚽', '🅰️', '🟨', '🟥'].map((h) => <th key={h} style={{ textAlign: 'center' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...totales].sort((a, b) => b.minutos - a.minutos || b.goles - a.goles).map((j) => (
              <tr key={j.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar jugador={j} />
                    <div><AppLink to={`/jugadores/${j.id}`} className="stat-name" style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, color: 'var(--navy)' }}>{j.nombre}</AppLink><div style={{ fontSize: 10, color: 'var(--gris-mid)' }}>{j.posicion}</div></div>
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>{j.partidos}</td>
                <td style={{ textAlign: 'center', color: j.titularidades ? 'inherit' : '#ccc' }}>{j.titularidades || '—'}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: j.minutos ? 'var(--navy)' : '#ccc', whiteSpace: 'nowrap' }}>{j.minutos ? fmtMin(j.minutos) : '—'}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: j.goles ? 'var(--primary)' : '#ccc' }}>{j.goles || '—'}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: j.asistencias ? 'var(--primary)' : '#ccc' }}>{j.asistencias || '—'}</td>
                <td style={{ textAlign: 'center', color: j.tarjetas_amarillas ? 'inherit' : '#ccc' }}>{j.tarjetas_amarillas || '—'}</td>
                <td style={{ textAlign: 'center', color: j.tarjetas_rojas ? 'inherit' : '#ccc' }}>{j.tarjetas_rojas || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
