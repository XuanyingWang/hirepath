// ── SUPABASE CLIENT (singleton) ───────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// `configured` is false when the .env file has not been filled in yet.
// Auth and sync modules check this before making any Supabase calls.
export const supabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null
