import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Browser Supabase client used only by the /admin page for magic-link auth.
// Uses the public anon key. Implicit flow so the magic-link token arrives in the
// URL hash and is picked up automatically (no server callback route needed).
let cached: SupabaseClient | null = null

export function getBrowserClient(): SupabaseClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  cached = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
  })
  return cached
}
