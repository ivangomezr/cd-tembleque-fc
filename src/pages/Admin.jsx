import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { useAuth } from '../hooks/useAuth'
import { CLUB, COMPETITION_LABEL, COMPETITION, DEFAULT_KIT } from '../config/club'
import KitPicker from '../components/KitPicker'
import TeamCrest from '../components/TeamCrest'
import { ResultCard } from '../components/MatchCard'
import { isHome, rivalName, ourScore, kickoff } from '../lib/match'
import PanelLiga from './admin/PanelLiga'
import Sheet from '../components/Sheet'
import { SUPABASE_READY } from '../lib/supabase'
import { haptics } from '../lib/haptics'
import { enviarNotificacionResultado } from '../lib/push'
import { validarJugador, validarPartido, validarTemporada, debeMarcarseJugado, LIMITS, candidatosNecesarios, necesitaCandidatos, validarFinalistas, exigirFinalistas } from '../lib/validation'
import MvpCandidatosPicker from '../components/MvpCandidatosPicker'
import { messageFor, UserFacingError } from '../lib/dbErrors'
import PlayerAvatar from '../components/PlayerAvatar'
import { votacionAbierta, mvpCierre } from '../lib/mvp'
import Icon from '../components/Icon'
import { StatIcon } from '../components/EventIcons'

function initials(n) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }
const Avatar = ({ jugador, size = 'sm' }) => <PlayerAvatar jugador={jugador} size={size === 'sm' ? 32 : size === 'md' ? 42 : 64} />
const POSICIONES = ['Portero', 'Defensa', 'Centrocampista', 'Delantero']

// Guard: only admins see the panel. This is UX only — every write is checked
// again by the database (RLS policies on each table).
function AdminGuard({ children }) {
  const navigate = useNavigate()
  const { loading, isAdmin, isLogged } = useAuth()
  if (loading) return <div className="page"><div className="empty">Comprobando sesión…</div></div>
  if (!isAdmin) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <Icon name="lock" size={48} strokeWidth={1.5} style={{ color: 'var(--primary-light)', marginBottom: '1rem' }} />
        <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: 'var(--primary)', marginBottom: 8 }}>Acceso restringido</h2>
        <p style={{ color: 'var(--gris-mid)', marginBottom: '1.25rem', maxWidth: 300 }}>
          {isLogged
            ? 'Tu cuenta no tiene permisos de administración. Si crees que es un error, habla con el superadministrador.'
            : <>Abre el menú <Icon name="menu" title="menú" /> y pulsa <strong>«Acceso al equipo»</strong> para identificarte.</>}
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Volver al inicio</button>
      </div>
    )
  }
  return children
}

// ---- Modal ----
const Modal = ({ title, onClose, children }) => <Sheet title={title} onClose={onClose}>{children}</Sheet>

// ---- Panel Jugadores ----
function PanelJugadores({ jugadores, store }) {
  const [modal, setModal] = useState(null)
  const empty = { nombre: '', posicion: 'Delantero', dorsal: '', foto_url: '' }
  const [form, setForm] = useState(empty)
  const [fotoArchivo, setFotoArchivo] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [errorValidacion, setErrorValidacion] = useState(null)

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrorValidacion(null); }
  const openAdd = () => { setForm(empty); setFotoArchivo(null); setFotoPreview(null); setErrorValidacion(null); setModal({ mode: 'add' }) }
  const openEdit = (j) => {
    setForm({ nombre: j.nombre, posicion: j.posicion, dorsal: j.dorsal, foto_url: j.foto_url || '' })
    setFotoArchivo(null)
    setFotoPreview(j.foto_url || null)
    setErrorValidacion(null)
    setModal({ mode: 'edit', id: j.id })
  }
  const [guardando, setGuardando] = useState(false)
  const save = async () => {
    let dorsalNum
    try {
      // Same rules as the database; the photo is checked again after uploading it
      dorsalNum = validarJugador({ ...form, foto_url: null }, { jugadores, id: modal.mode === 'edit' ? modal.id : null }).dorsal
    } catch (e) {
      haptics.error?.()
      setErrorValidacion(messageFor(e))
      return
    }

    setGuardando(true)
    try {
      let foto_url = form.foto_url || null
      if (fotoArchivo) {
        foto_url = await store.subirFotoJugador(modal.id, fotoArchivo)
        if (!foto_url) throw new UserFacingError('No se pudo subir la foto. Inténtalo de nuevo.')
      }
      const data = { ...form, nombre: form.nombre.trim(), dorsal: dorsalNum, foto_url }
      if (modal.mode === 'add') await store.addJugador(data)
      else await store.updateJugador(modal.id, data)
      haptics.success?.()
      setFotoArchivo(null)
      setFotoPreview(null)
      setModal(null)
    } catch (e) {
      console.error('[jugadores] save failed', e)
      haptics.error?.()
      setErrorValidacion(messageFor(e))
    } finally {
      setGuardando(false)
    }
  }
  const del = (id) => { if (window.confirm('¿Eliminar jugador y todas sus estadísticas?')) { haptics.error(); store.deleteJugador(id).catch((e) => window.alert(messageFor(e))) } }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 14, color: 'var(--gris-mid)' }}>{jugadores.length} jugadores</span>
        <button onClick={openAdd} className="btn btn-primary btn-sm">+ Añadir jugador</button>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {jugadores.map((j, i) => (
          <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < jugadores.length - 1 ? '1px solid #e8eff8' : 'none' }}>
            <Avatar jugador={j} size="sm" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{j.nombre}</div>
              <div style={{ fontSize: 11, color: 'var(--gris-mid)' }}>{j.posicion} · #{j.dorsal}</div>
            </div>
            <button onClick={() => openEdit(j)} style={{ background: 'none', border: '1px solid #b9cbe2', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--primary)' }}>Editar</button>
            <button onClick={() => del(j.id)} aria-label={`Eliminar a ${j.nombre}`} style={{ background: 'none', border: '1px solid #fcc', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#c0392b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title={modal.mode === 'add' ? 'Nuevo jugador' : 'Editar jugador'} onClose={() => setModal(null)}>
          <div className="form-group"><label className="label">Nombre</label><input className="input" value={form.nombre} maxLength={LIMITS.nombreJugador} onChange={e => set('nombre', e.target.value)} placeholder="Nombre completo" autoFocus /></div>
          <div className="form-group"><label className="label">Posición</label>
            <select className="select" value={form.posicion} onChange={e => set('posicion', e.target.value)}>
              {POSICIONES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Dorsal</label><input className="input" type="number" inputMode="numeric" min="1" max="99" step="1" value={form.dorsal ?? ''} onChange={e => set('dorsal', e.target.value)} placeholder="Del 1 al 99 (opcional)" /></div>
          <div className="form-group">
            <label className="label">Foto de perfil</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              {/* Preview */}
              <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid #b9cbe2' }}>
                {fotoPreview ? (
                  <img src={fotoPreview} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ color: '#9fc2ec', fontWeight: 700, fontSize: 20 }}>
                    {form.nombre ? form.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'}
                  </span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', background: 'white', border: '1.5px solid #b9cbe2', borderRadius: 10, padding: '8px 14px', fontSize: 13, cursor: 'pointer', textAlign: 'center', color: 'var(--primary-mid)', fontWeight: 600 }}>
                  <Icon name="camera" /> {fotoPreview ? 'Cambiar foto' : 'Subir foto'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files[0]
                      if (!file) return
                      setFotoArchivo(file)
                      setFotoPreview(URL.createObjectURL(file))
                    }}
                  />
                </label>
                {fotoPreview && (
                  <button type="button" onClick={() => { setFotoArchivo(null); setFotoPreview(null); set('foto_url', '') }}
                    style={{ width: '100%', marginTop: 6, background: 'none', border: 'none', fontSize: 12, color: '#c0392b', cursor: 'pointer' }}>
                    Eliminar foto
                  </button>
                )}
              </div>
            </div>
          </div>
          {errorValidacion && (
            <div style={{
              color: '#c0392b',
              backgroundColor: '#fadbd8',
              border: '1px solid #f5b7b1',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
              fontWeight: 500,
              textAlign: 'center'
            }}>
              <Icon name="alert-triangle" /> {errorValidacion}
            </div>
          )}
          <button onClick={save} className="btn btn-primary btn-block" disabled={guardando}>{guardando ? <><Icon name="loader" spin /> Guardando…</> : 'Guardar'}</button>
        </Modal>
      )}
    </div>
  )
}

// ---- Panel Partidos ----
function PanelPartidos({ partidos, store }) {
  const { equipos, partidosLiga, temporada, stats, jugadores } = useStore()
  const { isSuperAdmin } = useAuth()
  const [modal, setModal] = useState(null)
  const emptyP = { jornada: '', fecha: '', hora: '', enCasa: true, rival: '', campo: CLUB.homeGround, jugado: false, goles_local: 0, goles_visitante: 0, amistoso: false, escudo_rival_url: null, equipacion: DEFAULT_KIT, mvp_finalistas: [] }
  const [form, setForm] = useState(emptyP)
  const [escudoFile, setEscudoFile] = useState(null)
  const [escudoPreview, setEscudoPreview] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [errorValidacion, setErrorValidacion] = useState(null)
  // "Played" ticked automatically because the match is over (until the admin touches the box or the score)
  const [auto, setAuto] = useState({ jugado: false, tocado: false, marcador: false })
  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrorValidacion(null)
    if (k === 'jugado') setAuto(a => ({ ...a, jugado: false, tocado: true }))
    if (k === 'goles_local' || k === 'goles_visitante') setAuto(a => ({ ...a, marcador: true }))
  }
  const rivales = equipos.filter(e => !e.es_propio)

  // ── MVP candidates: needed to mark the match as played while its vote would be open
  const antes = modal?.mode === 'edit' ? partidos.find(p => p.id === modal.id) : null
  const partidoForm = { ...antes, fecha: form.fecha, hora: form.hora, convocados: antes?.convocados || [], mvp_finalistas: form.mvp_finalistas }
  const necesarios = candidatosNecesarios(partidoForm)
  const pideCandidatos = !antes?.jugado && necesitaCandidatos(partidoForm)
  const yaElegidos = necesarios > 0 && (antes?.mvp_finalistas || []).length === necesarios
  const bloqueoJugado = !modal || !pideCandidatos ? null
    : modal.mode === 'add' ? 'Guarda primero el partido y haz la convocatoria. Después podrás marcarlo como jugado y elegir los candidatos al MVP.'
    : !necesarios ? 'Haz la convocatoria (en la página del partido) antes de marcarlo como jugado: de ella salen los candidatos al MVP.'
    : !isSuperAdmin && !yaElegidos ? 'Solo un superadmin puede marcarlo como jugado, porque es quien elige los candidatos al MVP.'
    : null
  // the superadmin chooses them when marking it as played, or changes them while nobody has voted
  const editaCandidatos = isSuperAdmin && modal?.mode === 'edit' && necesarios > 0 && !!form.jugado &&
    (pideCandidatos || (antes?.jugado && votacionAbierta(antes) && (antes.mvp_finalistas || []).length > 0))

  // Tick "played" automatically once the match is over (only for matches not played yet)
  useEffect(() => {
    if (!modal || auto.tocado) return
    const before = modal.mode === 'edit' ? partidos.find(p => p.id === modal.id) : null
    if (before?.jugado) return
    const terminado = !bloqueoJugado && debeMarcarseJugado({ fecha: form.fecha, hora: form.hora, jugado: false }, new Date(), temporada?.duracion_partido)
    if (terminado !== auto.jugado) {
      setForm(f => ({ ...f, jugado: terminado }))
      setAuto(a => ({ ...a, jugado: terminado }))
    }
  }, [modal, form.fecha, form.hora, bloqueoJugado])

  const nuestros = [...partidos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

  const openAdd = () => { setForm(emptyP); setEscudoFile(null); setEscudoPreview(null); setErrorValidacion(null); setAuto({ jugado: false, tocado: false, marcador: false }); setModal({ mode: 'add' }) }
  const openEdit = (p) => {
    setAuto({ jugado: false, tocado: false, marcador: false })
    setForm({ jornada: p.jornada, fecha: p.fecha, hora: p.hora || '', enCasa: isHome(p), rival: rivalName(p), campo: p.campo || '', jugado: p.jugado, goles_local: p.goles_local, goles_visitante: p.goles_visitante, amistoso: !!p.amistoso, escudo_rival_url: p.escudo_rival_url || null, equipacion: p.equipacion || DEFAULT_KIT, mvp_finalistas: (p.mvp_finalistas || []).map(Number) })
    setEscudoFile(null)
    setEscudoPreview(p.escudo_rival_url || store.crestFor(rivalName(p)) || null)
    setErrorValidacion(null)
    setModal({ mode: 'edit', id: p.id })
  }

  // Deep link from the match page: /admin?tab=partidos&edit=<id>
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('edit'))
    const p = id && partidos.find(x => x.id === id)
    if (p && !modal) openEdit(p)
  }, [partidos.length])

  const handleEscudoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEscudoFile(file)
    setEscudoPreview(URL.createObjectURL(file))
  }

  const fueraDeFecha = (() => { const k = kickoff(form); return k ? k > new Date() : true })()

  const datosPartido = (escudoUrl) => {
    const rival = form.rival.trim()
    return {
      jornada: form.amistoso ? 0 : Number(form.jornada),
      fecha: form.fecha,
      hora: form.hora,
      local: form.enCasa ? CLUB.name : rival,
      visitante: form.enCasa ? rival : CLUB.name,
      campo: form.campo.trim(),
      amistoso: form.amistoso,
      jugado: fueraDeFecha || bloqueoJugado ? false : !!form.jugado,
      goles_local: Number(form.goles_local) || 0,
      goles_visitante: Number(form.goles_visitante) || 0,
      escudo_rival_url: escudoUrl,
      equipacion: form.equipacion || DEFAULT_KIT,
      ...(editaCandidatos ? { mvp_finalistas: form.mvp_finalistas } : {}),
    }
  }

  const save = async () => {
    let err = null
    if (!form.fecha) err = 'La fecha del partido es obligatoria.'
    else if (!form.hora) err = 'La hora del partido es obligatoria.'
    else if (!form.rival?.trim()) err = 'Elige el equipo rival.'
    else if (!form.campo?.trim()) err = 'El campo es obligatorio.'
    else {
      try {
        // Same rules as the database (validation.js ↔ migration 20261017180000)
        const data = datosPartido(null)
        validarPartido(data, { partidos, partidosLiga, equipos, temporada, id: modal.mode === 'edit' ? modal.id : null, stats })
        if (editaCandidatos) validarFinalistas(form.mvp_finalistas, { partido: partidoForm, jugadores })
        if (data.jugado && !antes?.jugado) exigirFinalistas({ ...partidoForm, jugado: true, mvp_finalistas: editaCandidatos ? form.mvp_finalistas : antes?.mvp_finalistas })
      } catch (e) { err = messageFor(e) }
    }
    if (err) { haptics.error?.(); setErrorValidacion(err); return }
    if (auto.jugado && !auto.marcador && form.jugado &&
        !window.confirm('Se ha marcado como jugado porque la fecha ya pasó. ¿Guardar con el resultado ' +
          `${Number(form.goles_local) || 0}-${Number(form.goles_visitante) || 0}?`)) return

    setGuardando(true)
    try {
      let escudoUrl = form.escudo_rival_url || null
      if (escudoFile) escudoUrl = await store.uploadEscudoRival(modal.id, escudoFile)
      const rival = form.rival.trim()
      const data = datosPartido(escudoUrl)
      const before = modal.mode === 'edit' ? partidos.find(p => p.id === modal.id) : null
      const saved = modal.mode === 'add' ? await store.addPartido(data) : (await store.updatePartido(modal.id, data), { id: modal.id })
      if (data.jugado && !before?.jugado) {
        const { nuestros: n, rivales: r } = ourScore(data)
        const res = n > r ? 'Victoria' : n < r ? 'Derrota' : 'Empate'
        enviarNotificacionResultado({ partido_id: saved?.id || null, rival, resultado: `${res} ${n}-${r}` })
      }
      haptics.success?.()
      setModal(null)
    } catch (e) {
      console.error(e)
      haptics.error?.()
      setErrorValidacion(messageFor(e))
    } finally {
      setGuardando(false)
    }
  }
  const del = (id) => { if (window.confirm('¿Eliminar partido, su timeline y sus estadísticas?')) store.deletePartido(id).catch((e) => window.alert(messageFor(e))) }


  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 14, color: 'var(--gris-mid)' }}>{nuestros.length} partidos</span>
        <button onClick={openAdd} className="btn btn-primary btn-sm">+ Añadir partido</button>
      </div>
      {rivales.length === 0 && (
        <div style={{ background: 'var(--primary-pale)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--primary)', marginBottom: 10 }}>
          <Icon name="bulb" /> Añade primero los equipos del grupo en la pestaña <strong>Liga</strong> para elegirlos como rival.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {nuestros.map((p) => (
          <ResultCard key={p.id} partido={p} showTime actions={<>
            <button onClick={() => openEdit(p)} aria-label="Editar" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #b9cbe2', borderRadius: 8, padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="pencil" size={15} /></button>
            <button onClick={() => del(p.id)} aria-label="Eliminar" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #b9cbe2', borderRadius: 8, padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#c0392b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trash" size={15} /></button>
          </>} />
        ))}
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Nuevo partido' : 'Editar partido'} onClose={() => setModal(null)}>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="amistoso" checked={form.amistoso} onChange={e => set('amistoso', e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
            <label htmlFor="amistoso" className="label" style={{ margin: 0 }}>Partido amistoso <span style={{ fontSize: 11, color: 'var(--gris-mid)', fontWeight: 400 }}>(no cuenta para la liga ni las estadísticas)</span></label>
          </div>

          {!form.amistoso && (
            <div className="form-group">
              <label className="label">Jornada</label>
              <input className="input" type="number" min="1" value={form.jornada} onChange={e => set('jornada', e.target.value)} placeholder="Nº jornada" />
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label className="label">Fecha</label>
              <input className="input" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: '0 0 110px', minWidth: 0 }}>
              <label className="label">Hora</label>
              <input className="input" type="time" value={form.hora} onChange={e => set('hora', e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="label">¿Dónde jugamos?</label>
            <div className="segmented">
              <button type="button" className={form.enCasa ? 'active' : ''} onClick={() => { set('enCasa', true); if (!form.campo || form.campo !== CLUB.homeGround) set('campo', CLUB.homeGround) }}><span className="with-icon"><Icon name="home" /> En casa</span></button>
              <button type="button" className={!form.enCasa ? 'active' : ''} onClick={() => { set('enCasa', false); if (form.campo === CLUB.homeGround) set('campo', '') }}><span className="with-icon"><Icon name="bus" /> Fuera</span></button>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Rival</label>
            {!form.amistoso && rivales.length > 0 ? (
              <select className="select" value={form.rival} onChange={e => { set('rival', e.target.value); if (!escudoFile && !form.escudo_rival_url) setEscudoPreview(store.crestFor(e.target.value)) }}>
                <option value="">Selecciona rival…</option>
                {rivales.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
              </select>
            ) : (
              <input className="input" value={form.rival} onChange={e => set('rival', e.target.value)} placeholder="Nombre del rival" />
            )}
          </div>

          <div className="form-group">
            <label className="label">Escudo rival <span style={{ fontWeight: 400, color: 'var(--gris-mid)', fontSize: 11 }}>(opcional — por defecto el de la liga)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {escudoPreview
                ? <TeamCrest src={escudoPreview} name="Escudo rival" size={52} />
                : <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--primary-pale)', border: '2px dashed #b9cbe2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-light)' }}><Icon name="shield" size={22} /></div>}
              <label style={{ flex: 1, background: 'var(--primary-pale)', border: '1.5px solid #b9cbe2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                <Icon name="camera" /> {escudoPreview ? 'Cambiar escudo' : 'Subir escudo'}
                <input type="file" accept="image/*" onChange={handleEscudoChange} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Campo</label>
            <input className="input" value={form.campo} onChange={e => set('campo', e.target.value)} placeholder="Campo del rival" />
          </div>

          <div className="form-group">
            <label className="label">Equipación <span style={{ fontWeight: 400, color: 'var(--gris-mid)', fontSize: 11 }}>(la camiseta con la que se pinta la alineación)</span></label>
            <KitPicker value={form.equipacion} onChange={v => set('equipacion', v)} />
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: fueraDeFecha || bloqueoJugado ? 0.4 : 1 }}>
            <input type="checkbox" id="jugado" checked={!!form.jugado && !fueraDeFecha && !bloqueoJugado} disabled={fueraDeFecha || !!bloqueoJugado} aria-describedby={bloqueoJugado ? 'jugado-bloqueo' : undefined} onChange={e => set('jugado', e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
            <label htmlFor="jugado" className="label" style={{ margin: 0 }}>
              Partido jugado
              <span style={{ fontSize: 11, color: 'var(--gris-mid)', fontWeight: 400 }}>{fueraDeFecha ? ' (fecha futura)' : ' — suma los minutos de la alineación y los cambios'}</span>
            </label>
          </div>
          {bloqueoJugado && !fueraDeFecha && (
            <p id="jugado-bloqueo" style={{ fontSize: 12, color: 'var(--primary)', background: 'var(--primary-pale)', borderRadius: 8, padding: '8px 10px', margin: '-6px 0 12px' }}>
              <Icon name="lock" /> {bloqueoJugado}
            </p>
          )}
          {auto.jugado && form.jugado && !fueraDeFecha && (
            <p style={{ fontSize: 12, color: 'var(--primary)', background: 'var(--primary-pale)', borderRadius: 8, padding: '8px 10px', margin: '-6px 0 12px' }}>
              <Icon name="check" /> Marcado automáticamente porque el partido ya terminó. Revisa el resultado antes de guardar.
            </p>
          )}

          {form.jugado && !fueraDeFecha && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16, textAlign: 'center' }}>
              {[['goles_local', form.enCasa ? CLUB.shortName : (form.rival || 'Local')], ['goles_visitante', form.enCasa ? (form.rival || 'Visitante') : CLUB.shortName]].map(([k, label]) => (
                <div key={k}>
                  <div className="label" style={{ textAlign: 'center', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                  <Stepper value={Number(form[k]) || 0} onChange={v => set(k, v)} />
                </div>
              ))}
            </div>
          )}

          {editaCandidatos && !fueraDeFecha && (
            <MvpCandidatosPicker partido={partidoForm} jugadores={jugadores} stats={stats} necesarios={necesarios}
              value={form.mvp_finalistas} onChange={v => set('mvp_finalistas', v)} />
          )}
          {editaCandidatos && antes?.jugado && (
            <p style={{ fontSize: 12, color: 'var(--gris-mid)', margin: '-6px 0 12px' }}>Los candidatos solo se pueden cambiar mientras nadie haya votado.</p>
          )}
          {!isSuperAdmin && (antes?.mvp_finalistas || []).length > 0 && votacionAbierta({ ...antes, jugado: true }) && (
            <p style={{ fontSize: 12, color: 'var(--gris-mid)', margin: '0 0 12px' }}>
              <Icon name="star" /> Candidatos al MVP: {(antes.mvp_finalistas || []).map(id => jugadores.find(j => j.id === Number(id))?.nombre).filter(Boolean).join(', ')}
            </p>
          )}

          {errorValidacion && <div className="alert-error"><Icon name="alert-triangle" /> {errorValidacion}</div>}
          <button onClick={save} className="btn btn-primary btn-block" style={{ fontSize: 16 }} disabled={guardando}>
            {guardando ? <><Icon name="loader" spin /> Guardando…</> : <span className="with-icon"><Icon name="ball" /> Guardar partido</span>}
          </button>
        </Modal>
      )}
    </div>
  )
}

function Stepper({ value, onChange, disabled = false, max = 99 }) {
  const btn = { width: 40, height: 40, borderRadius: '50%', border: '1.5px solid #b9cbe2', background: 'white', fontSize: 20, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', opacity: disabled ? 0.45 : 1 }}>
      <button type="button" disabled={disabled} onClick={() => onChange(Math.max(0, value - 1))} style={btn} aria-label="Restar">−</button>
      <span style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: 'var(--primary)', minWidth: 28, textAlign: 'center', lineHeight: 1 }}>{value}</span>
      <button type="button" disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))} style={btn} aria-label="Sumar">+</button>
    </div>
  )
}

const fmtCorta = (f) => { if (!f) return ''; const [, m, d] = f.split('-'); return `${parseInt(d)} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][parseInt(m) - 1]}` }

// ---- Panel Stats ----
const posOrder = { Portero: 0, Defensa: 1, Centrocampista: 2, Delantero: 3 }
const byPos = (a, b) => (posOrder[a.posicion] ?? 99) - (posOrder[b.posicion] ?? 99) || (a.dorsal || 99) - (b.dorsal || 99)

function PanelStats({ jugadores, partidos, stats, store }) {
  const [partidoSel, setPartidoSel] = useState('')
  const [modal, setModal] = useState(null)
  const emptyS = { jugador_id: '', goles: 0, asistencias: 0, tarjetas_amarillas: 0, tarjetas_rojas: 0, paradas: 0, goles_encajados: 0 }
  const [form, setForm] = useState(emptyS)
  const [mvpSel, setMvpSel] = useState('')
  const [eventos, setEventos] = useState([])
  const [errorValidacion, setErrorValidacion] = useState(null)
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrorValidacion(null) }

  const partidoActual = partidos.find(p => p.id === Number(partidoSel))
  const tieneTimeline = eventos.length > 0

  useEffect(() => {
    setMvpSel(partidoActual?.mvp_jugador_id ? String(partidoActual.mvp_jugador_id) : '')
    if (partidoActual) store.getEventos(partidoActual.id).then(setEventos)
    else setEventos([])
  }, [partidoSel, partidos.length])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('partido')
    if (id && partidos.some(x => x.id === Number(id))) setPartidoSel(id)
  }, [partidos.length])

  const handleMvpChange = async (e) => {
    const v = e.target.value
    setMvpSel(v)
    if (partidoActual) {
      try {
        await store.updatePartido(partidoActual.id, { mvp_jugador_id: v ? Number(v) : null })
        haptics.success?.()
      } catch (err) {
        haptics.error?.()
        setMvpSel(partidoActual.mvp_jugador_id ? String(partidoActual.mvp_jugador_id) : '')
        window.alert(messageFor(err))
      }
    }
  }

  const jugados = partidos.filter(p => p.jugado).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  const statsDelPartido = stats.filter(s => s.partido_id === Number(partidoSel))
  const ids = [...new Set([...(partidoActual?.convocados || []), ...statsDelPartido.map(s => s.jugador_id)])]
  const filas = jugadores.filter(j => ids.includes(j.id)).sort(byPos).map(j =>
    statsDelPartido.find(s => s.jugador_id === j.id) || { ...emptyS, id: `empty-${j.id}`, jugador_id: j.id, partido_id: Number(partidoSel), minutos: 0 })

  const openAdd = () => { setForm(emptyS); setErrorValidacion(null); setModal({ mode: 'add' }) }
  const openEdit = (s) => { setForm({ jugador_id: String(s.jugador_id), goles: s.goles, asistencias: s.asistencias, tarjetas_amarillas: s.tarjetas_amarillas, tarjetas_rojas: s.tarjetas_rojas, paradas: s.paradas || 0, goles_encajados: s.goles_encajados || 0 }); setErrorValidacion(null); setModal({ mode: 'edit' }) }

  const save = async () => {
    if (!form.jugador_id || !partidoActual) return setErrorValidacion('Elige un jugador.')
    const prev = statsDelPartido.find(s => s.jugador_id === Number(form.jugador_id)) || emptyS
    const locked = tieneTimeline
    // Totals, cards, call-up, lineup and timeline are checked by the store (validation.js) and again by the database
    try {
    await store.upsertStat({
      jugador_id: Number(form.jugador_id),
      partido_id: partidoActual.id,
      goles: locked ? prev.goles : Number(form.goles),
      asistencias: locked ? prev.asistencias : Number(form.asistencias),
      tarjetas_amarillas: locked ? prev.tarjetas_amarillas : Number(form.tarjetas_amarillas),
      tarjetas_rojas: locked ? prev.tarjetas_rojas : Number(form.tarjetas_rojas),
      goles_encajados: locked ? prev.goles_encajados : Number(form.goles_encajados),
      paradas: Number(form.paradas) || 0,
    })
    } catch (e) {
      haptics.error?.()
      return setErrorValidacion(messageFor(e))
    }
    haptics.success?.()
    setModal(null)
  }
  const del = (jid) => { if (window.confirm('¿Eliminar estas estadísticas?')) store.deleteStat(jid, Number(partidoSel)).catch((e) => window.alert(messageFor(e))) }
  const esPortero = jugadores.find(j => j.id === Number(form.jugador_id))?.posicion === 'Portero'
  // With a call-up, only called-up players can have stats or be MVP (same rule as the database)
  const convocadosIds = (partidoActual?.convocados || []).map(Number)
  const elegiblesStats = convocadosIds.length ? jugadores.filter(j => convocadosIds.includes(j.id)) : jugadores
  const participantes = convocadosIds.length
    ? jugadores.filter(j => convocadosIds.includes(j.id) || statsDelPartido.some(s => s.jugador_id === j.id && s.minutos > 0) || j.id === Number(mvpSel))
    : jugadores

  return (
    <div>
      <div className="form-group">
        <label className="label">Selecciona un partido jugado</label>
        <select className="select" value={partidoSel} onChange={e => setPartidoSel(e.target.value)}>
          <option value="">Elige un partido...</option>
          {jugados.map(p => <option key={p.id} value={p.id}>{p.amistoso ? 'Amistoso' : `J${p.jornada}`} · {p.local} {p.goles_local}-{p.goles_visitante} {p.visitante}</option>)}
        </select>
      </div>
      {partidoActual && (
        <>
          <div style={{ background: tieneTimeline ? 'var(--primary-pale)' : 'var(--accent-pale)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: tieneTimeline ? 'var(--primary)' : '#7a5a00', marginBottom: 12, lineHeight: 1.5 }}>
            {tieneTimeline
              ? <><Icon name="stopwatch" /> Goles, asistencias, tarjetas y goles encajados se calculan <strong>desde el timeline</strong>. Aquí solo editas las paradas.</>
              : <><Icon name="bulb" /> Este partido no tiene timeline: puedes meter las stats a mano, o añadir los eventos desde el detalle del partido para que se calculen solas.</>}
            <br /><Icon name="clock" /> Los <strong>minutos</strong> se calculan siempre con la alineación titular y los cambios.
            <button onClick={() => store.recalcularPartido(partidoActual.id).then(() => haptics.success?.(), (e) => window.alert(messageFor(e)))} style={{ marginLeft: 6, background: 'white', border: '1px solid currentColor', color: 'inherit', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}><Icon name="refresh" size={13} /> Recalcular</button>
          </div>
          <div className="form-group">
            <label className="label with-icon" htmlFor="mvp-sel"><Icon name="star" /> MVP del partido</label>
            {votacionAbierta(partidoActual) ? (
              <p style={{ fontSize: 13, color: 'var(--gris-mid)', background: 'var(--primary-pale)', borderRadius: 10, padding: '10px 12px' }}>
                <Icon name="list-check" /> Se decide por votación hasta el {mvpCierre(partidoActual.fecha)?.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} a las 23:59. Después se guarda solo el más votado.
              </p>
            ) : (
            <>
            <p style={{ fontSize: 11, color: 'var(--gris-mid)', margin: '-2px 0 6px' }}>Se guarda automáticamente con el más votado. Cámbialo solo para corregir un error.</p>
            <select id="mvp-sel" className="select" value={mvpSel} onChange={(e) => {
              if (partidoActual?.mvp_jugador_id && !window.confirm('El MVP salió de la votación. ¿Seguro que quieres cambiarlo a mano?')) return
              handleMvpChange(e)
            }}>
              <option value="">Sin MVP</option>
              {participantes.map(j => <option key={j.id} value={j.id}>#{j.dorsal} — {j.nombre}</option>)}
            </select>
            </>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, color: 'var(--gris-mid)' }}>{filas.length} jugadores</span>
            <button onClick={openAdd} className="btn btn-primary btn-sm">+ Añadir jugador</button>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {filas.length === 0 && <div className="empty">Define la convocatoria y la alineación desde el detalle del partido.</div>}
            {filas.map((s, i) => {
              const j = jugadores.find(x => x.id === s.jugador_id)
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: i < filas.length - 1 ? '1px solid #e8eff8' : 'none' }}>
                  <Avatar jugador={j} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{j.nombre} {s.titular && <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700 }}>· TITULAR</span>}</div>
                    <div style={{ fontSize: 11, color: 'var(--gris-mid)' }}>
                      <span className="stat-inline">
                        {[['minutos', `${s.minutos || 0}'`], ['goles', s.goles], ['asistencias', s.asistencias], ['tarjetas_amarillas', s.tarjetas_amarillas], ['tarjetas_rojas', s.tarjetas_rojas],
                          ...(j.posicion === 'Portero' ? [['paradas', s.paradas || 0], ['goles_encajados', s.goles_encajados || 0]] : [])]
                          .map(([k, v]) => <span key={k}><StatIcon stat={k} size={12} />{v}</span>)}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => openEdit(s)} style={{ background: 'none', border: '1px solid #b9cbe2', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--primary)' }}>Editar</button>
                  <button onClick={() => del(s.jugador_id)} aria-label="Eliminar" style={{ background: 'none', border: '1px solid #fcc', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#c0392b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={14} /></button>
                </div>
              )
            })}
          </div>
        </>
      )}
      {modal && (
        <Modal title={`${modal.mode === 'add' ? 'Añadir' : 'Editar'} estadísticas${form.jugador_id ? ` · ${jugadores.find(j => j.id === Number(form.jugador_id))?.nombre || ''}` : ''}`} onClose={() => setModal(null)}>
          {modal.mode === 'add' && (
            <div className="form-group">
              <label className="label">Jugador</label>
              <select className="select" value={form.jugador_id} onChange={e => set('jugador_id', e.target.value)}>
                <option value="">Seleccionar...</option>
                {elegiblesStats.map(j => <option key={j.id} value={j.id}>#{j.dorsal} — {j.nombre}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {[
              ['goles', 'Goles', tieneTimeline, 99],
              ['asistencias', 'Asistencias', tieneTimeline, 99],
              ['tarjetas_amarillas', 'Amarillas', tieneTimeline, 2],
              ['tarjetas_rojas', 'Rojas', tieneTimeline, 1],
              ...(esPortero ? [['paradas', 'Paradas', false, 99], ['goles_encajados', 'Encajados', tieneTimeline, 99]] : []),
            ].map(([k, l, locked, max]) => (
              <div key={k} style={{ textAlign: 'center' }}>
                <div className="label with-icon" style={{ justifyContent: 'center', display: 'flex', marginBottom: 8, gap: 4 }}><StatIcon stat={k} size={14} />{l}{locked && <Icon name="lock" size={12} title="Se calcula desde el timeline" />}</div>
                <Stepper value={Number(form[k]) || 0} onChange={v => set(k, v)} disabled={locked} max={max} />
              </div>
            ))}
          </div>
          {errorValidacion && <div className="alert-error"><Icon name="alert-triangle" /> {errorValidacion}</div>}
          <button onClick={save} className="btn btn-primary btn-block">Guardar</button>
        </Modal>
      )}
    </div>
  )
}

// ---- Panel Temporada ----
function PanelTemporada({ store }) {
  const { isSuperAdmin } = useAuth()
  const [temporadaActiva, setTemporadaActiva] = useState(null)
  const [temporadas, setTemporadas] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', año: new Date().getFullYear() + 1 })
  const [cerrando, setCerrando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [pwdSuper, setPwdSuper] = useState('')
  const [errorPwd, setErrorPwd] = useState('')

  useEffect(() => {
    if (!store.getTemporadas) return
    store.getTemporadas().then(ts => {
      setTemporadas(ts)
      setTemporadaActiva(ts.find(t => t.activa) || null)
    }).catch(() => { })
  }, [])

  const verificarYCerrar = async () => {
    if (!isSuperAdmin) return
    try { validarTemporada({ nombre: form.nombre, año: Number(form.año) }, { temporadas }) }
    catch (e) { setErrorPwd(messageFor(e)); return }
    if (pwdSuper.trim().toUpperCase() !== 'CERRAR') { setErrorPwd('Escribe CERRAR para confirmar'); return }
    setCerrando(true)
    try {
      await store.cerrarTemporadaYCrearNueva(form.nombre.trim(), Number(form.año))
    } catch (e) {
      setErrorPwd(messageFor(e))
      setCerrando(false)
      return
    }
    const ts = await store.getTemporadas()
    setTemporadas(ts)
    setTemporadaActiva(ts.find(t => t.activa) || null)
    setShowForm(false); setConfirmando(false); setPwdSuper(''); setErrorPwd(''); setCerrando(false)
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem', background: 'linear-gradient(135deg,#01153A,#0f2a5c)' }}>
        <div style={{ fontSize: 11, color: '#9fc2ec', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Temporada activa</div>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: 'white', lineHeight: 1 }}>{temporadaActiva?.nombre || 'Cargando...'}</div>
        <div style={{ fontSize: 12, color: '#6f8db8', marginTop: 4 }}>Año {temporadaActiva?.año} · Todos los datos actuales pertenecen a esta temporada</div>
      </div>

      {!isSuperAdmin ? (
        <div style={{ background: '#f3f6fb', borderRadius: 12, padding: '1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          <Icon name="lock" size={22} style={{ color: 'var(--gris-mid)', marginBottom: 6 }} />
          <div style={{ fontSize: 13, color: 'var(--gris-mid)' }}>Solo el superadmin puede cerrar la temporada</div>
        </div>
      ) : !showForm ? (
        <button onClick={() => setShowForm(true)} className="btn btn-ghost btn-block" style={{ marginBottom: '1.5rem' }}>
          <span className="with-icon"><Icon name="archive" /> Cerrar temporada y empezar nueva</span>
        </button>
      ) : (
        <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid var(--primary)' }}>
          <h2 style={{ fontSize: 18, color: 'var(--primary)', marginBottom: 14 }}>Nueva temporada</h2>
          {!confirmando ? (
            <>
              <div className="form-group">
                <label className="label">Nombre de la nueva temporada</label>
                <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Segunda Autonómica 2027/28" />
              </div>
              <div className="form-group">
                <label className="label">Año</label>
                <input className="input" type="number" value={form.año} onChange={e => setForm(f => ({ ...f, año: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowForm(false)} className="btn btn-ghost" style={{ flex: 1 }}>Cancelar</button>
                <button onClick={() => setConfirmando(true)} className="btn btn-primary" style={{ flex: 1 }}><span className="with-icon">Continuar <Icon name="arrow-right" /></span></button>
              </div>
            </>
          ) : (
            <>
              <div style={{ background: '#fde8e8', border: '1px solid #f5c0c0', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 13, color: '#c0392b' }}>
                <Icon name="alert-triangle" /> <strong>Atención:</strong> Al cerrar <strong>"{temporadaActiva?.nombre}"</strong>, los partidos, estadísticas y clasificación quedarán archivados. Los jugadores se mantienen. Esta acción no se puede deshacer.
              </div>
              <div className="form-group">
                <label className="label">Escribe <strong>CERRAR</strong> para confirmar</label>
                <input className="input" value={pwdSuper} autoCapitalize="characters"
                  onChange={e => { setPwdSuper(e.target.value); setErrorPwd('') }} placeholder="CERRAR" />
                {errorPwd && <div style={{ color: '#c0392b', fontSize: 12, marginTop: 4 }}><Icon name="alert-triangle" /> {errorPwd}</div>}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setConfirmando(false); setPwdSuper(''); setErrorPwd('') }} className="btn btn-ghost" style={{ flex: 1 }}>Atrás</button>
                <button onClick={verificarYCerrar} disabled={cerrando || !pwdSuper} style={{ flex: 1, background: '#c0392b', color: 'white', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: (cerrando || !pwdSuper) ? 0.5 : 1 }}>
                  {cerrando ? 'Cerrando...' : <span className="with-icon"><Icon name="archive" /> Confirmar y cerrar</span>}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gris-mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Temporadas anteriores</div>
      {temporadas.filter(t => !t.activa).length === 0 && <div className="empty" style={{ padding: '1.5rem' }}>Esta es la primera temporada</div>}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {temporadas.filter(t => !t.activa).map((t, i, arr) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < arr.length - 1 ? '1px solid #e8eff8' : 'none' }}>
            <Icon name="trophy" size={24} style={{ color: 'var(--primary)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t.nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--gris-mid)' }}>Temporada {t.año} · Archivada</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Panel Log ----
function PanelLog({ store, jugadores }) {
  const { isSuperAdmin } = useAuth()
  const [logs, setLogs] = useState([])
  const [cargando, setCargando] = useState(false)
  const [filtroJugador, setFiltroJugador] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')

  useEffect(() => {
    if (!isSuperAdmin) return
    setCargando(true)
    store.getLog()
      .then(data => { setLogs(data || []); setCargando(false) })
      .catch(() => setCargando(false))
  }, [isSuperAdmin])

  // The database only returns rows to superadmins (RLS); this is just the message.
  if (!isSuperAdmin) return (
    <div className="card" style={{ textAlign: 'center' }}>
      <Icon name="lock" size={40} strokeWidth={1.5} style={{ color: 'var(--primary-light)', marginBottom: 12 }} />
      <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--primary)', marginBottom: 6 }}>Área restringida</div>
      <div style={{ fontSize: 13, color: 'var(--gris-mid)', marginBottom: 20 }}>Solo el superadministrador puede ver el registro de actividad</div>
    </div>
  )

  if (cargando) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gris-mid)' }}>Cargando log...</div>

  const jugadoresLog = [...new Set(logs.map(l => l.jugador_nombre).filter(Boolean))].sort()
  const fechasLog = [...new Set(logs.map(l => l.created_at?.substring(0, 10)).filter(Boolean))].sort().reverse()

  const filtrados = logs.filter(l => {
    const porJugador = !filtroJugador || l.jugador_nombre === filtroJugador
    const porFecha = !filtroFecha || l.created_at?.startsWith(filtroFecha)
    return porJugador && porFecha
  })

  const colorAccion = (accion) => {
    if (!accion) return { bg: '#f5f5f5', color: '#666' }
    const a = accion.toLowerCase()
    if (a.includes('añad')) return { bg: '#eaf5e9', color: '#1a7a3a' }
    if (a.includes('elimin')) return { bg: '#fde8e8', color: '#c0392b' }
    if (a.includes('public')) return { bg: '#e8f0fe', color: '#185fa5' }
    if (a.includes('edit') || a.includes('actuali')) return { bg: '#fff8e6', color: '#856a00' }
    return { bg: '#f5f5f5', color: '#666' }
  }

  const colorEntidad = {
    'Jugador': { bg: '#e8f0fe', color: '#185fa5' },
    'Partido': { bg: '#e8eff8', color: '#295A98' },
    'Estadísticas': { bg: '#fef9e7', color: '#856a00' },
    'Liga': { bg: '#e8f5e9', color: '#1a7a3a' },
    'Equipo': { bg: '#e8f5e9', color: '#1a7a3a' },
    'Alineación': { bg: '#f3e8fe', color: '#6a1e7a' },
    'Timeline': { bg: '#fde8e8', color: '#c0392b' },
    'Temporada': { bg: '#fef9e7', color: '#856a00' },
  }

  const logsPorFecha = filtrados.reduce((acc, l) => {
    const dia = l.created_at?.substring(0, 10) || 'sin-fecha'
    if (!acc[dia]) acc[dia] = []
    acc[dia].push(l)
    return acc
  }, {})

  function fmtDia(str) {
    if (str === 'sin-fecha') return 'Sin fecha'
    const d = new Date(str + 'T12:00:00')
    const hoy = new Date()
    const ayer = new Date(); ayer.setDate(hoy.getDate() - 1)
    if (d.toDateString() === hoy.toDateString()) return 'Hoy'
    if (d.toDateString() === ayer.toDateString()) return 'Ayer'
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  }

  function fmtHora(str) {
    return new Date(str).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select className="select" value={filtroJugador} onChange={e => setFiltroJugador(e.target.value)}
          style={{ flex: 1, minWidth: 130, fontSize: 13, minHeight: 36, padding: '6px 10px' }}>
          <option value="">Todos los jugadores</option>
          {jugadoresLog.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="select" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}
          style={{ flex: 1, minWidth: 130, fontSize: 13, minHeight: 36, padding: '6px 10px' }}>
          <option value="">Todas las fechas</option>
          {fechasLog.map(f => (
            <option key={f} value={f}>
              {new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--gris-mid)' }}>
          {filtrados.length} {filtrados.length === 1 ? 'acción' : 'acciones'}
        </span>
        {(filtroJugador || filtroFecha) && (
          <button onClick={() => { setFiltroJugador(''); setFiltroFecha('') }}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            <span className="with-icon"><Icon name="x" /> Limpiar filtros</span>
          </button>
        )}
      </div>

      {filtrados.length === 0 && (
        <div className="empty">Sin actividad para este filtro</div>
      )}

      {Object.entries(logsPorFecha).map(([dia, items]) => (
        <div key={dia} style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--gris-mid)',
            textTransform: 'uppercase', letterSpacing: '0.07em',
            padding: '8px 0 6px',
          }}>
            {fmtDia(dia)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.map(l => {
              const jugador = jugadores.find(j => j.id === l.jugador_id)
              const initials = (l.jugador_nombre || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
              const accionStyle = colorAccion(l.accion)
              const entidadStyle = colorEntidad[l.entidad] || { bg: '#eee', color: '#666' }
              const verbo = l.accion?.replace(/[^\wáéíóúñÁÉÍÓÚÑ\s]/gi, '').trim().toLowerCase() || ''

              return (
                <div key={l.id} style={{
                  background: 'white',
                  border: '1px solid #e6edf6',
                  borderRadius: 12,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    overflow: 'hidden', background: 'var(--navy)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {jugador?.foto_url
                      ? <img src={jugador.foto_url} alt={jugador.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: 'var(--accent-light)', fontSize: 11, fontWeight: 700 }}>{initials}</span>
                    }
                  </div>

                  {/* Contenido */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                        {l.jugador_nombre || 'Desconocido'}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20,
                        background: accionStyle.bg, color: accionStyle.color,
                      }}>
                        {verbo}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20,
                        background: entidadStyle.bg, color: entidadStyle.color,
                      }}>
                        {l.entidad}
                      </span>
                    </div>
                    {l.detalle && (
                      <div style={{
                        fontSize: 12, color: 'var(--gris-mid)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {l.detalle}
                      </div>
                    )}
                  </div>

                  {/* Hora */}
                  <span style={{ fontSize: 11, color: 'var(--gris-light)', flexShrink: 0 }}>
                    {fmtHora(l.created_at)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- Main Admin ----
const adminTabs = [
  { key: 'stats', label: 'Stats', icon: 'chart-bar' },
  { key: 'partidos', label: 'Partidos', icon: 'ball' },
  { key: 'jugadores', label: 'Plantilla', icon: 'shirt' },
  { key: 'liga', label: 'Liga', icon: 'trophy' },
  { key: 'temporada', label: 'Temporada', icon: 'calendar' },
  { key: 'log', label: 'Actividad', icon: 'list-check' },
]

export default function Admin() {
  const { jugadores, partidos, stats, store } = useStore()
  const location = useLocation()
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'stats')
  useEffect(() => {
    const t = new URLSearchParams(location.search).get('tab')
    if (t) setTab(t)
  }, [location.search])
  const navigate = useNavigate()

  const { signOut, role } = useAuth()
  const handleLogout = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <AdminGuard>
      <div className="page anim-fade">
        {/* Header admin */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
          <div style={{ background: 'var(--primary)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}><Icon name="settings" size={20} /></div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: 'var(--primary)', lineHeight: 1 }}>Panel de gestión</h1>
            <div style={{ fontSize: 12, color: 'var(--gris-mid)' }}>{CLUB.name} · {COMPETITION_LABEL} · {COMPETITION.season}</div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: SUPABASE_READY ? '#1f9d55' : '#b7791f' }}>
              <span className="with-icon" style={{ gap: 3 }}><Icon name="point" />{SUPABASE_READY ? `Conectado a Supabase · rol ${role}` : 'Modo local: los datos solo se guardan en este navegador (faltan las variables de Supabase)'}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: '1px solid #b9cbe2', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--gris-mid)' }}>
            Salir
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {adminTabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 16px', borderRadius: 20, whiteSpace: 'nowrap', border: '1.5px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, background: tab === t.key ? 'var(--primary)' : 'white', color: tab === t.key ? 'white' : 'var(--primary-mid)', borderColor: tab === t.key ? 'var(--primary)' : '#b9cbe2' }}>
              <span className="with-icon"><Icon name={t.icon} /> {t.label}</span>
            </button>
          ))}
        </div>

        {tab === 'jugadores' && <PanelJugadores jugadores={jugadores} store={store} />}
        {tab === 'partidos' && <PanelPartidos partidos={partidos} store={store} />}
        {tab === 'stats' && <PanelStats jugadores={jugadores} partidos={partidos} stats={stats} store={store} />}
        {tab === 'liga' && <PanelLiga />}
        {tab === 'temporada' && <PanelTemporada store={store} />}
        {tab === 'log' && <PanelLog store={store} jugadores={jugadores} />}
      </div>
    </AdminGuard>
  )
}