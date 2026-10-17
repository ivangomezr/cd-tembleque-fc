import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when real Supabase credentials are configured (not the .env.example placeholder). */
export const SUPABASE_READY = !!(supabaseUrl && supabaseKey && !supabaseUrl.includes('XXXXXXXX'))

/**
 * Where supabase-js keeps the Auth session (short-lived access JWT + refresh token).
 *  - 'local'   (default): survives closing the app, best for the installed PWA.
 *  - 'session': cleared when the tab/app is closed, for shared devices.
 */
const AUTH_STORAGE = import.meta.env.VITE_AUTH_STORAGE === 'session' ? 'session' : 'local'

function authStorage() {
  if (typeof window === 'undefined') return undefined
  return AUTH_STORAGE === 'session' ? window.sessionStorage : window.localStorage
}

// Without credentials the store falls back to localStorage; this stub only keeps
// stray calls from crashing.
const stub = {
  from: () => ({
    select: async () => ({ data: [], error: null }),
    upsert: async () => ({ data: null, error: null }),
    insert: async () => ({ data: null, error: null }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  rpc: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
}

export const supabase = SUPABASE_READY
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,   // renews the access token before it expires
        detectSessionInUrl: false, // no OAuth / magic links in this app
        storageKey: 'cdt-supabase-auth',
        storage: authStorage(),
      },
    })
  : stub
