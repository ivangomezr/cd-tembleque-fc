import { describe, it, expect } from 'vitest'
import { avatarSrc } from '../images'

const URL = 'https://res.cloudinary.com/demo-club/image/upload/v1729000000/tembleque/avatares/abc123.png'

describe('avatarSrc', () => {
  it('recorta las fotos de Cloudinary alrededor de la cara', () => {
    const r = avatarSrc(URL, 32)
    expect(r.faceCrop).toBe(true)
    expect(r.src).toBe('https://res.cloudinary.com/demo-club/image/upload/c_thumb,g_face,z_0.65,w_64,h_64/f_auto,q_auto/v1729000000/tembleque/avatares/abc123.png')
  })
  it('pide el doble de píxeles para pantallas nítidas, con límites', () => {
    expect(avatarSrc(URL, 46).src).toMatch(/w_92,h_92/)
    expect(avatarSrc(URL, 10).src).toMatch(/w_64,h_64/)
    expect(avatarSrc(URL, 999).src).toMatch(/w_400,h_400/)
  })
  it('no toca otras URLs ni las ya transformadas', () => {
    expect(avatarSrc('/test.jpg', 32)).toEqual({ src: '/test.jpg', faceCrop: false })
    expect(avatarSrc('data:image/png;base64,AA', 32).faceCrop).toBe(false)
    expect(avatarSrc('https://example.com/image/upload/a.png', 32).faceCrop).toBe(false)
    const ya = avatarSrc(URL, 32).src
    expect(avatarSrc(ya, 32).src).toBe(ya)
    expect(avatarSrc(null, 32)).toEqual({ src: null, faceCrop: false })
  })
})
