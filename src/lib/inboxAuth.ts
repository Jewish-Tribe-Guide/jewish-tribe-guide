import { createClient } from '@supabase/supabase-js'

// The single source of truth for who may read form-response data: a
// comma-separated list in the INBOX_EMAILS env var. Deliberately separate from
// SUPERADMIN_EMAILS (adminAuth.ts) — someone who manages categories/site content is
// NOT automatically allowed to read patients' support requests, and vice versa.
// A person can be on both lists, but each grants only its own access.
export function getAllowedInboxEmails(): string[] {
  return (process.env.INBOX_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedInboxEmail(email: string): boolean {
  return getAllowedInboxEmails().includes(email.trim().toLowerCase())
}

// Verifies that a request carries a valid Supabase access token (Bearer) for an
// allowlisted inbox-viewer email. Returns the email, or null if unauthorized.
// Same shared Supabase Auth user pool as adminAuth.ts's getAdminUser — the
// token alone proves identity, not access; access is this allowlist check.
export async function getInboxViewer(request: Request): Promise<{ email: string } | null> {
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

  if (!isAllowedInboxEmail(email)) return null
  return { email }
}
