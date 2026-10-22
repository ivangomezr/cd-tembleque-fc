/**
 * Instagram-ready MVP image (1080 × 1350, the 4:5 feed format), drawn on a
 * canvas with the club colours. Shared with the system share sheet on phones
 * (Instagram appears there) or downloaded on computers. Admins only (UI).
 */
import { CLUB } from '../config/club'
import { matchSides } from './match'
import { splitName } from './players'
import { cloudinary } from './images'

const W = 1080
const H = 1350

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous' // Cloudinary sends CORS headers; without them the canvas could not be exported
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function contain(ctx, img, x, y, w, h) {
  const r = Math.min(w / img.width, h / img.height)
  const dw = img.width * r, dh = img.height * r
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

function fitText(ctx, text, maxWidth, size, font) {
  let s = size
  do { ctx.font = `${s}px ${font}`; s -= 4 } while (ctx.measureText(text).width > maxWidth && s > 24)
}

export async function dibujarMvp({ partido, jugador, porcentaje, total, crestFor }) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  try { await Promise.all([document.fonts?.load('120px "Bebas Neue"'), document.fonts?.load('700 40px "DM Sans"')]) } catch { /* fallback fonts */ }

  // Background: club navy → blue, with a light "studio" glow behind the player
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#01153A'); bg.addColorStop(0.6, '#0f2a5c'); bg.addColorStop(1, '#295A98')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.62, H * 0.42, 40, W * 0.62, H * 0.42, 620)
  glow.addColorStop(0, 'rgba(233,238,245,0.55)'); glow.addColorStop(1, 'rgba(233,238,245,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Big ghost number
  if (jugador.dorsal != null) {
    ctx.font = '620px "Bebas Neue", Impact, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.textAlign = 'right'
    ctx.fillText(String(jugador.dorsal), W - 30, 700)
  }

  const { home, away, homeGoals, awayGoals } = matchSides(partido, crestFor)
  const [escudo, foto, crestH, crestA] = await Promise.all([
    loadImage(CLUB.crest),
    loadImage(cloudinary(jugador.foto_url, 'w_1000,f_png,q_auto')),
    loadImage(home.ours ? CLUB.crest : home.crest),
    loadImage(away.ours ? CLUB.crest : away.crest),
  ])

  // Player photo (cut-out) or, without one, a white circle with the initials
  if (foto) {
    contain(ctx, foto, 240, 170, 840, 900)
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath(); ctx.arc(700, 560, 260, 0, Math.PI * 2); ctx.fill()
    ctx.font = '260px "Bebas Neue", Impact, sans-serif'
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'
    ctx.fillText(jugador.nombre.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(), 700, 650)
  }

  // Bottom fade for the text
  const fade = ctx.createLinearGradient(0, 760, 0, H)
  fade.addColorStop(0, 'rgba(1,21,58,0)'); fade.addColorStop(0.45, 'rgba(1,21,58,0.88)'); fade.addColorStop(1, 'rgba(1,21,58,1)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 760, W, H - 760)

  // Header: crest + label
  if (escudo) contain(ctx, escudo, 60, 56, 130, 130)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#f0c040'
  ctx.font = '700 34px "DM Sans", sans-serif'
  ctx.fillText('MVP DEL PARTIDO', 214, 110)
  ctx.fillStyle = '#dce8f6'
  ctx.font = '500 30px "DM Sans", sans-serif'
  ctx.fillText(partido.amistoso ? 'Amistoso' : `Jornada ${partido.jornada}`, 214, 156)

  // Name
  const { first, last } = splitName(jugador.nombre)
  ctx.fillStyle = 'white'
  if (first) { ctx.font = '600 44px "DM Sans", sans-serif'; ctx.fillText(first, 60, 1000) }
  fitText(ctx, last.toUpperCase(), W - 120, 150, '"Bebas Neue", Impact, sans-serif')
  ctx.fillText(last.toUpperCase(), 60, 1130)
  if (jugador.dorsal != null || jugador.posicion) {
    ctx.fillStyle = '#f0c040'
    ctx.font = '700 32px "DM Sans", sans-serif'
    ctx.fillText([jugador.dorsal != null ? `#${jugador.dorsal}` : null, jugador.posicion].filter(Boolean).join(' · '), 60, 1180)
  }

  // Score + votes
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath(); ctx.roundRect?.(60, 1212, W - 120, 92, 24); ctx.fill()
  const midY = 1270
  // Laid out from measured widths so the row holds with any font (or a missing crest)
  ctx.font = '64px "Bebas Neue", Impact, sans-serif'
  const marcador = `${homeGoals}-${awayGoals}`
  let x = 88
  if (crestH) { contain(ctx, crestH, x, 1222, 72, 72); x += 72 + 18 }
  ctx.textAlign = 'left'; ctx.fillStyle = 'white'
  ctx.fillText(marcador, x, midY + 22)
  x += ctx.measureText(marcador).width + 18
  if (crestA) contain(ctx, crestA, x, 1222, 72, 72)
  ctx.textAlign = 'right'
  ctx.font = '600 30px "DM Sans", sans-serif'
  ctx.fillText(total ? `${porcentaje}% de ${total} ${total === 1 ? 'voto' : 'votos'} de la afición` : 'Votado por la afición', W - 90, midY + 10)

  return canvas
}

/** Opens the share sheet (Instagram, WhatsApp…) or downloads the image. */
export async function compartirMvp(datos) {
  const canvas = await dibujarMvp(datos)
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('No se pudo crear la imagen.')
  const slug = datos.jugador.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const nombre = `mvp-${datos.partido.amistoso ? 'amistoso' : `j${datos.partido.jornada}`}-${slug}.png`
  const file = new File([blob], nombre, { type: 'image/png' })
  const texto = `${datos.jugador.nombre}, MVP del partido · ${CLUB.name}`
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'MVP del partido', text: texto })
    return 'shared'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
