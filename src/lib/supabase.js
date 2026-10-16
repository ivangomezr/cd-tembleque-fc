import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when real Supabase credentials are configured (not the .env.example placeholder). */
export const SUPABASE_READY = !!(supabaseUrl && supabaseKey && !supabaseUrl.includes('XXXXXXXX'))

// Without credentials the store falls back to localStorage; this stub only keeps
// stray calls (e.g. RPC on login) from crashing.
const stub = {
  from: () => ({
    select: async () => ({ data: [], error: null }),
    upsert: async () => ({ data: null, error: null }),
    insert: async () => ({ data: null, error: null }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  rpc: async () => ({ data: false, error: { message: 'Supabase not configured' } }),
}

export const supabase = SUPABASE_READY ? createClient(supabaseUrl, supabaseKey) : stub
