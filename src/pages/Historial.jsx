import { useState, useEffect } from 'react'
import { useStore } from '../hooks/useStore'
import { EQUIPO_NOMBRE } from '../config/club'
import Icon from '../components/Icon'

function fmt(str) { return new Date(str).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) }

export default function Historial() {
    const { store } = useStore()
    const [temporadas, setTemporadas] = useState([])
    const [seleccionada, setSeleccionada] = useState(null)
    const [datos, setDatos] = useState(null)
    const [cargando, setCargando] = useState(true)
    const [cargandoDatos, setCargandoDatos] = useState(false)

    useEffect(() => {
        store.getTemporadas().then(ts => {
            const pasadas = ts.filter(t => !t.activa)
            setTemporadas(pasadas)
            setCargando(false)
        })
    }, [])

    const verTemporada = async (t) => {
        if (seleccionada?.id === t.id) { setSeleccionada(null); setDatos(null); return }
        setSeleccionada(t)
        setCargandoDatos(true)
        const d = await store.getDatosTemporada(t.id)
        setDatos(d)
        setCargandoDatos(false)
    }

    if (cargando) return (
        <div className="page"><div className="empty">Cargando historial...</div></div>
    )

    if (temporadas.length === 0) return (
        <div className="page">
            <h1 className="page-title">Historial de Temporadas</h1>
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <Icon name="trophy" size={48} strokeWidth={1.5} style={{ color: 'var(--primary-light)', opacity: 0.7, display: 'block', margin: '0 auto 12px' }} />
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--primary)', marginBottom: 8 }}>
                    Primera temporada en curso
                </div>
                <div style={{ fontSize: 14, color: 'var(--gris-mid)' }}>
                    Aquí aparecerán las temporadas anteriores cuando se cierren.
                </div>
            </div>
        </div>
    )

    return (
        <div className="page">
            <h1 className="page-title">Historial</h1>

            {temporadas.map(t => {
                const abierta = seleccionada?.id === t.id
                const nuestros = datos?.partidos?.filter(p =>
                    p.local === EQUIPO_NOMBRE || p.visitante === EQUIPO_NOMBRE
                ) || []
                const jugados = nuestros.filter(p => p.jugado)
                const victorias = jugados.filter(p => {
                    const esL = p.local === EQUIPO_NOMBRE
                    const n = esL ? p.goles_local : p.goles_visitante
                    const r = esL ? p.goles_visitante : p.goles_local
                    return n > r
                }).length
                const goles = datos?.stats?.reduce((a, s) => a + s.goles, 0) || 0

                return (
                    <div key={t.id} className="card" style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
                        {/* Cabecera de temporada */}
                        <div
                            onClick={() => verTemporada(t)}
                            style={{
                                padding: '1rem 1.25rem', cursor: 'pointer',
                                background: abierta ? 'linear-gradient(135deg, #01153A, #0f2a5c)' : 'white',
                                display: 'flex', alignItems: 'center', gap: 12
                            }}
                        >
                            <Icon name="trophy" size={32} strokeWidth={1.5} style={{ color: abierta ? 'var(--accent-light)' : 'var(--primary)' }} />
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontFamily: 'Bebas Neue', fontSize: 20,
                                    color: abierta ? 'white' : 'var(--primary)', lineHeight: 1
                                }}>{t.nombre}</div>
                                <div style={{ fontSize: 12, color: abierta ? '#9fc2ec' : 'var(--gris-mid)', marginTop: 2 }}>
                                    Temporada {t.año} · Archivada
                                </div>
                            </div>
                            <div style={{ color: abierta ? '#9fc2ec' : 'var(--gris-light)', display: 'flex' }}>
                                <Icon name={abierta ? 'chevron-up' : 'chevron-down'} size={22} />
                            </div>
                        </div>

                        {/* Contenido expandido */}
                        {abierta && (
                            <div style={{ padding: '1rem 1.25rem' }}>
                                {cargandoDatos ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gris-mid)' }}>
                                        Cargando datos...
                                    </div>
                                ) : datos ? (
                                    <>
                                        {/* Resumen */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: '1rem' }}>
                                            {[
                                                ['Partidos', jugados.length, 'var(--primary)'],
                                                ['Victorias', victorias, '#1f9d55'],
                                                ['Goles', goles, 'var(--primary-mid)'],
                                            ].map(([l, v, c]) => (
                                                <div key={l} style={{ background: '#f3f6fb', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                                                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 30, color: c, lineHeight: 1 }}>{v}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--gris-mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{l}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Clasificación final */}
                                        {datos.clasificacion.length > 0 && (
                                            <div style={{ marginBottom: '1rem' }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gris-mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                                                    Clasificación final
                                                </div>
                                                <div style={{ background: '#f3f6fb', borderRadius: 12, overflow: 'hidden' }}>
                                                    {datos.clasificacion.map((e, i) => (
                                                        <div key={i} style={{
                                                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                                            borderBottom: i < datos.clasificacion.length - 1 ? '1px solid #e6edf6' : 'none',
                                                            background: e.propio ? 'rgba(41,90,152,0.08)' : 'transparent'
                                                        }}>
                                                            <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: 'var(--gris-mid)', minWidth: 18 }}>{i + 1}</div>
                                                            <div style={{ flex: 1, fontSize: 13, fontWeight: e.propio ? 700 : 400, color: e.propio ? 'var(--primary)' : 'var(--navy)' }}>
                                                                {e.equipo}
                                                            </div>
                                                            <div style={{ fontFamily: 'Bebas Neue', fontSize: 18, color: 'var(--primary)' }}>{e.pts}pts</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Top goleadores */}
                                        {datos.stats.length > 0 && (() => {
                                            const porJugador = {}
                                            datos.stats.forEach(s => {
                                                if (!porJugador[s.jugador_id]) porJugador[s.jugador_id] = { goles: 0, asistencias: 0 }
                                                porJugador[s.jugador_id].goles += s.goles
                                                porJugador[s.jugador_id].asistencias += s.asistencias
                                            })
                                            const top = Object.entries(porJugador)
                                                .map(([id, v]) => ({ jugador_id: Number(id), ...v }))
                                                .sort((a, b) => b.goles - a.goles)
                                                .slice(0, 3)

                                            // Necesitamos los jugadores — están en el store global
                                            // Los guardamos en el snapshot de la temporada como nombres
                                            return top.length > 0 ? (
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gris-mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                                                        Top goleadores
                                                    </div>
                                                    <div style={{ background: '#f3f6fb', borderRadius: 12, overflow: 'hidden' }}>
                                                        {top.map((j, i) => (
                                                            <div key={j.jugador_id} style={{
                                                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                                                borderBottom: i < top.length - 1 ? '1px solid #e6edf6' : 'none'
                                                            }}>
                                                                <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: ['#c8991a', '#909090', '#a06030'][i], minWidth: 18 }}>{i + 1}</div>
                                                                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Jugador #{j.jugador_id}</div>
                                                                <div className="with-icon" style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 700, gap: 3 }}><Icon name="ball" /> {j.goles}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null
                                        })()}
                                    </>
                                ) : (
                                    <div className="empty">No hay datos para esta temporada</div>
                                )}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}