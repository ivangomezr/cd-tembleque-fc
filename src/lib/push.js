import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

// NOTE: anything prefixed VITE_ ends up in the public bundle. The push secret only
// deters casual abuse; see README › Security for a stronger setup.

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// ¿El navegador soporta push?
// En iOS solo funciona si está instalada como PWA (standalone)
export function pushSoportado() {
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  const tieneAPI = 'serviceWorker' in navigator && 'PushManager' in window

  // En iOS necesitamos que esté en modo standalone
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (esIOS) return isStandalone && tieneAPI

  return tieneAPI
}

// ¿Está en iOS pero NO instalada como PWA?
export function esIOSsinInstalar() {
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  return esIOS && !isStandalone
}

export function pushPermiso() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

// Suscribir — el requestPermission debe ser lo PRIMERO, sin awaits previos
export async function suscribirPush() {
  if (!pushSoportado()) return false
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY no configurada')
    return false
  }

  try {
    // 🔑 CRÍTICO en iOS: requestPermission ANTES de cualquier await
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return false

    // Ahora sí podemos hacer awaits
    const reg = await navigator.serviceWorker.ready
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    const json = subscription.toJSON()
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })

    if (error) { console.error('[push] Error guardando suscripción:', error); return false }
    return true
  } catch (err) {
    console.error('[push] Error al suscribir:', err)
    return false
  }
}

export async function desuscribirPush() {
  if (!pushSoportado()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const subscription = await reg.pushManager.getSubscription()
    if (!subscription) return
    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  } catch (err) {
    console.error('[push] Error al desuscribir:', err)
  }
}

export async function enviarNotificacionResultado({ partido_id, rival, resultado }) {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-push-secret': import.meta.env.VITE_PUSH_SECRET || '',
      },
      body: JSON.stringify({ tipo: 'resultado', partido_id, rival, resultado }),
    })
  } catch (err) {
    console.error('[push] Error enviando notificación resultado:', err)
  }
}
