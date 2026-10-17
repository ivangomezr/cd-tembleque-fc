import { useState, useEffect } from 'react'
import { useStore } from '../hooks/useStore'
import { useAuth } from '../hooks/useAuth'
import { messageFor } from '../lib/dbErrors'

export default function Patrocinadores() {
    const { store } = useStore()
    const [lista, setLista] = useState([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [nombre, setNombre] = useState('')
    const [archivo, setArchivo] = useState(null)
    const [preview, setPreview] = useState(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const { isAdmin } = useAuth()

    useEffect(() => {
        store.getPatrocinadores().then(data => { setLista(data); setLoading(false) })
    }, [])

    const handleArchivo = (e) => {
        const f = e.target.files[0]
        if (!f) return
        setArchivo(f)
        setPreview(URL.createObjectURL(f))
    }

    const handleSubmit = async () => {
        if (!archivo) { setError('Selecciona una imagen'); return }
        setSaving(true); setError('')
        try {
            const nuevo = await store.addPatrocinador(nombre.trim(), archivo)
            setLista(prev => [...prev, nuevo])
            setNombre(''); setArchivo(null); setPreview(null); setShowForm(false)
        } catch (e) { setError(messageFor(e)) }
        setSaving(false)
    }

    const handleDelete = async (id) => {
        if (!window.confirm('¿Eliminar este patrocinador?')) return
        await store.deletePatrocinador(id)
        setLista(prev => prev.filter(p => p.id !== id))
    }

    return (
        <div className="page anim-fade">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h1 className="page-title" style={{ margin: 0 }}>Patrocinadores</h1>
                {isAdmin && (
                    <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">
                        + Añadir
                    </button>
                )}
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gris-mid)' }}>Cargando...</div>}

            {!loading && lista.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <div style={{ fontSize: 56, marginBottom: '1rem' }}>🤝</div>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--primary)', marginBottom: 8 }}>
                        Sin patrocinadores aún
                    </div>
                    <div style={{ color: 'var(--gris-mid)', fontSize: 14 }}>
                        {isAdmin ? 'Pulsa "+ Añadir" para agregar el primero.' : 'Próximamente.'}
                    </div>
                </div>
            )}

            {/* Grid 2 columnas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {lista.map(p => (
                    <div key={p.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.06)', position: 'relative' }}>
                        {p.imagen_url && (
                            <div style={{ aspectRatio: '16/9', overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img src={p.imagen_url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }} />
                            </div>
                        )}
                        {p.nombre && (
                            <div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--navy)', textAlign: 'center' }}>
                                {p.nombre}
                            </div>
                        )}
                        {isAdmin && (
                            <button
                                onClick={() => handleDelete(p.id)}
                                style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(192,57,43,0.85)', border: 'none', borderRadius: 6, width: 26, height: 26, color: 'white', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                ✕
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Modal añadir */}
            {showForm && (
                <>
                    <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400 }} />
                    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 500, background: 'white', borderRadius: '20px 20px 0 0', padding: '1.5rem', paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 -4px 30px rgba(0,0,0,0.2)' }}>
                        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '-0.5rem auto 1.25rem' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--primary)' }}>Nuevo patrocinador</h2>
                            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#aaa' }}>✕</button>
                        </div>

                        {error && <div style={{ background: '#fde8e8', border: '1px solid #f5c0c0', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#c0392b' }}>{error}</div>}

                        {/* Preview imagen */}
                        <div onClick={() => document.getElementById('input-patrocinador').click()}
                            style={{ width: '100%', aspectRatio: '16/9', borderRadius: 12, border: '2px dashed #b9cbe2', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '1rem', cursor: 'pointer', background: preview ? 'white' : '#f3f6fb' }}>
                            {preview
                                ? <img src={preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
                                : <div style={{ textAlign: 'center', color: 'var(--gris-mid)' }}>
                                    <div style={{ fontSize: 36, marginBottom: 8 }}>🖼️</div>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>Toca para elegir logo</div>
                                </div>
                            }
                        </div>
                        <input id="input-patrocinador" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleArchivo} />

                        <div className="form-group">
                            <label className="label">Nombre (opcional)</label>
                            <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} />
                        </div>

                        <button onClick={handleSubmit} disabled={saving} className="btn btn-primary btn-block" style={{ opacity: saving ? 0.7 : 1 }}>
                            {saving ? 'Guardando...' : '🤝 Añadir patrocinador'}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}