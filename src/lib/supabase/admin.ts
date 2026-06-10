import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Server-only Supabase client using the service-role key. It bypasses Row-Level
// Security, so it must NEVER be imported into client components — only route
// handlers and other server code. All writes and moderation reads go through it.
let cached: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceRoleKey) throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY')

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
