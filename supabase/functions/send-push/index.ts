// Supabase Edge Function: send-push
// Usa web-push via esm.sh para cifrado correcto en todos los navegadores incluyendo iOS

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Verificar secreto propio — evita el problema del JWT format de Supabase
  const secret = req.headers.get('x-push-secret')
  if (secret !== Deno.env.get('PUSH_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    // tipo: 'resultado'
    const { tipo, partido_id, rival, resultado } = await req.json()

    const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com'

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: subs, error } = await supabase.from('push_subscriptions').select('*')
    if (error) throw error
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build the payload. Only match results are supported for now.
    if (tipo !== 'resultado') {
      return new Response(JSON.stringify({ error: 'Unsupported notification type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const payload = JSON.stringify({
      title: `Resultado: vs ${rival}`,
      body: `${resultado} · ¡Vota al MVP del partido!`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      url: partido_id ? `/partido/${partido_id}` : '/',
    })

    let sent = 0
    const toDelete: string[] = []

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400 }
        )
        sent++
      } catch (e: any) {
        console.error(`Error enviando a ${sub.endpoint.substring(0, 50)}:`, e?.statusCode, e?.body)
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          toDelete.push(sub.id)
        }
      }
    }))

    if (toDelete.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', toDelete)
    }

    console.log(`[${tipo}] Enviadas: ${sent}, eliminadas: ${toDelete.length}`)

    return new Response(JSON.stringify({ sent, deleted: toDelete.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error general:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
