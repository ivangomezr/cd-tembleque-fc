/**
 * Image URL helpers (pure).
 */

const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/

/**
 * Square, face-centred version of a Cloudinary photo for round avatars.
 *
 * Every player photo is framed differently (some with a lot of space above the
 * head), so a fixed CSS crop cuts some faces. Cloudinary finds the face
 * (`g_face`, built in, no add-on) and crops around it; `z_0.65` zooms out a
 * little to keep the shoulders. `f_auto` keeps the transparent background.
 * Non-Cloudinary URLs (local demo, data URLs) are returned unchanged.
 *
 * @param {string} url   original photo URL
 * @param {number} size  avatar size in CSS pixels (doubled for sharp screens)
 * @returns {{ src: string, faceCrop: boolean }}
 */
export function avatarSrc(url, size = 40) {
  if (!url) return { src: url, faceCrop: false }
  const m = CLOUDINARY_UPLOAD.exec(url)
  if (!m) return { src: url, faceCrop: false }
  // Already transformed by us? Leave it.
  if (/(^|\/)c_thumb,g_face/.test(m[2])) return { src: url, faceCrop: true }
  const px = Math.min(400, Math.max(64, Math.round(size * 2)))
  return { src: `${m[1]}c_thumb,g_face,z_0.65,w_${px},h_${px}/f_auto,q_auto/${m[2]}`, faceCrop: true }
}
