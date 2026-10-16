import { useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { adminAuth } from '../lib/adminAuth'
import { ResultCard, UpcomingCard } from '../components/MatchCard'

const sectionTitle = { fontSize: 16, fontWeight: 700, color: 'var(--gris-mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }

export default function Partidos() {
  const nav = useNavigate()
  const { partidos, loading } = useStore()
  const isAdmin = adminAuth.isLogged()

  const jugados = partidos.filter((p) => p.jugado).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  const proximos = partidos.filter((p) => !p.jugado).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))

  return (
    <div className="page anim-fade">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Partidos</h1>
        {isAdmin && <button onClick={() => nav('/admin?tab=partidos')} className="btn btn-primary btn-sm">+ Partido</button>}
      </div>

      {proximos.length > 0 && (
        <>
          <h2 style={sectionTitle}>Próximos</h2>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginBottom: '1.25rem', scrollbarWidth: 'none' }}>
            {proximos.map((p, i) => <UpcomingCard key={p.id} partido={p} highlight={i === 0} onClick={() => nav(`/partido/${p.id}`)} />)}
          </div>
        </>
      )}

      <h2 style={{ ...sectionTitle, marginBottom: 10 }}>Resultados</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!loading && jugados.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--gris-mid)', fontSize: 14, padding: '2rem' }}>Sin partidos jugados</div>
        )}
        {jugados.map((p) => <ResultCard key={p.id} partido={p} onClick={() => nav(`/partido/${p.id}`)} />)}
      </div>
    </div>
  )
}
