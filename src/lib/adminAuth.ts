import { createClient } from '@supabase/supabase-js'

// The single source of truth for who may administer the site: a comma-separated
// list in the ADMIN_EMAILS env var. Add an email here to grant admin access.
export function getAllowedAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedAdminEmail(email: string): boolean {
  return getAllowedAdminEmails().includes(email.trim().toLowerCase())
}

// Verifies that a request carries a valid Supabase access token (Bearer) for an
// allowlisted admin email. Returns the admin email, or null if unauthorized.
//
// The token is minted by the magic-link login on the /admin page and sent in the
// Authorization header. We validate it against Supabase Auth, then check the
// user's email against ADMIN_EMAILS before allowing any moderation action.
export async function getAdminUser(request: Request): Promise<{ email: string } | null> {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.auth.getUser(token)
  const email = data.user?.email
  if (error || !email) return null

  if (!isAllowedAdminEmail(email)) return null
  return { email }
}
