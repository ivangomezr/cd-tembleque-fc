import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * ImageCropper — selector circular de recorte de imagen
 * Props:
 *   src: string (URL o base64 de la imagen original)
 *   onCrop: (blob) => void — devuelve el blob recortado
 *   onCancel: () => void
 */
export default function ImageCropper({ src, onCrop, onCancel }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(new Image())
  const containerRef = useRef(null)

  // Estado del recorte: posición y zoom
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)
  const lastOffset = useRef({ x: 0, y: 0 })

  // Tamaño del canvas de preview (cuadrado)
  const SIZE = Math.min(window.innerWidth - 48, 340)

  // Cargar imagen
  useEffect(() => {
    const img = imgRef.current
    img.onload = () => {
      // Centrar y ajustar zoom inicial para que llene el círculo
      const minDim = Math.min(img.naturalWidth, img.naturalHeight)
      const initialScale = SIZE / minDim
      setScale(initialScale)
      setOffset({
        x: (img.naturalWidth * initialScale - SIZE) / 2,
        y: (img.naturalHeight * initialScale - SIZE) / 2,
      })
    }
    img.src = src
  }, [src])

  // Dibujar canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const img = imgRef.current
    if (!img.complete) return

    ctx.clearRect(0, 0, SIZE, SIZE)

    // Imagen desplazada y escalada
    ctx.drawImage(
      img,
      -offset.x, -offset.y,
      img.naturalWidth * scale,
      img.naturalHeight * scale
    )

    // Oscurecer SOLO fuera del círculo (no dentro)
    ctx.save()
    // Crear path del área exterior al círculo
    ctx.beginPath()
    ctx.rect(0, 0, SIZE, SIZE)
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2, true) // true = sentido horario inverso = hueco
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fill('evenodd')
    ctx.restore()

    // Borde del círculo
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }, [offset, scale, SIZE])

  useEffect(() => { draw() }, [draw])

  // ── Drag con mouse/touch ──
  const getPos = (e) => {
    if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    return { x: e.clientX, y: e.clientY }
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    dragStart.current = getPos(e)
    lastOffset.current = { ...offset }
    setDragging(true)
  }

  const onPointerMove = useCallback((e) => {
    if (!dragging || !dragStart.current) return
    const pos = getPos(e)
    const dx = pos.x - dragStart.current.x
    const dy = pos.y - dragStart.current.y
    const img = imgRef.current
    const maxX = img.naturalWidth * scale - SIZE
    const maxY = img.naturalHeight * scale - SIZE
    setOffset({
      x: Math.max(0, Math.min(maxX, lastOffset.current.x - dx)),
      y: Math.max(0, Math.min(maxY, lastOffset.current.y - dy)),
    })
  }, [dragging, scale, SIZE])

  const onPointerUp = () => { setDragging(false); dragStart.current = null }

  useEffect(() => {
    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [onPointerMove])

  // ── Pinch to zoom ──
  const lastPinchDist = useRef(null)
  const onTouchStartPinch = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastPinchDist.current = Math.sqrt(dx * dx + dy * dy)
    } else {
      onPointerDown(e)
    }
  }
  const onTouchMovePinch = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (lastPinchDist.current) {
        const delta = dist / lastPinchDist.current
        const img = imgRef.current
        const minScale = SIZE / Math.min(img.naturalWidth, img.naturalHeight)
        setScale(s => Math.max(minScale, Math.min(s * delta, minScale * 8)))
      }
      lastPinchDist.current = dist
    } else {
      onPointerMove(e)
    }
  }

  // ── Zoom con slider ──
  const onSliderChange = (e) => {
    const img = imgRef.current
    const minScale = SIZE / Math.min(img.naturalWidth, img.naturalHeight)
    const newScale = minScale * (1 + (e.target.value / 100) * 7)
    setScale(newScale)
  }

  // ── Generar recorte final ──
  const handleCrop = () => {
    const outputSize = 400
    const out = document.createElement('canvas')
    out.width = outputSize
    out.height = outputSize
    const ctx = out.getContext('2d')
    const img = imgRef.current
    const ratio = outputSize / SIZE

    // Dibujar imagen recortada
    ctx.drawImage(
      img,
      -offset.x * ratio, -offset.y * ratio,
      img.naturalWidth * scale * ratio,
      img.naturalHeight * scale * ratio
    )

    // Recorte circular
    const cropped = document.createElement('canvas')
    cropped.width = outputSize
    cropped.height = outputSize
    const ctx2 = cropped.getContext('2d')
    ctx2.beginPath()
    ctx2.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2)
    ctx2.clip()
    ctx2.drawImage(out, 0, 0)

    cropped.toBlob(blob => onCrop(blob), 'image/jpeg', 0.92)
  }

  const img = imgRef.current
  const minScale = img.complete ? SIZE / Math.min(img.naturalWidth || SIZE, img.naturalHeight || SIZE) : 1
  const sliderVal = img.complete ? Math.round(((scale - minScale) / (minScale * 7)) * 100) : 0

  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 600 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 700,
        background: '#111', borderRadius: '20px 20px 0 0',
        padding: '1.25rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        <div style={{ width: 36, height: 4, background: '#444', borderRadius: 2, marginTop: -4 }} />
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: 'white', letterSpacing: '0.06em' }}>
          Ajusta tu foto
        </div>

        {/* Canvas de recorte */}
        <div
          ref={containerRef}
          style={{ width: SIZE, height: SIZE, borderRadius: '50%', overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
          onMouseDown={onPointerDown}
          onTouchStart={onTouchStartPinch}
          onTouchMove={onTouchMovePinch}
        >
          <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: 'block' }} />
        </div>

        <div style={{ fontSize: 12, color: '#666', marginTop: -8 }}>
          Arrastra para mover · Pellizca o desliza para hacer zoom
        </div>

        {/* Slider de zoom */}
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <input
            type="range" min="0" max="100" value={sliderVal}
            onChange={onSliderChange}
            style={{ flex: 1, accentColor: 'var(--primary)' }}
          />
          <span style={{ fontSize: 18 }}>🔍</span>
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #444', borderRadius: 12, color: '#aaa', fontSize: 15, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleCrop}
            style={{ flex: 2, padding: '12px', background: 'var(--primary)', border: 'none', borderRadius: 12, color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            ✓ Usar esta foto
          </button>
        </div>
      </div>
    </>
  )
}
