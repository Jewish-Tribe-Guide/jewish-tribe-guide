import { createClient } from '@supabase/supabase-js'
import { getCommunityAdminEmails } from './communityStore'

// The single source of truth for who may administer the site: a comma-separated
// list in the ADMIN_EMAILS env var. Add an email here to grant admin access.
//
// Once a community has its own admin_emails set (see isAllowedForCommunity),
// this list stops being "who can edit THIS community" and becomes the
// superadmin list instead — used only for genuinely cross-community actions
// (creating a new community) and site-wide singletons that were never
// per-community to begin with (the Pages tab's About/Privacy copy, the
// /api/admin/revalidate script hook). See getAdminUserForCommunity for the
// per-community check that everything else should use.
export function getAllowedAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedAdminEmail(email: string): boolean {
  return getAllowedAdminEmails().includes(email.trim().toLowerCase())
}

/** Whether `email` may administer the given community: it has to be on
 *  that community's own `admin_emails` allowlist — NOT just be anywhere on
 *  the global ADMIN_EMAILS list, which is what let one admin edit every
 *  community before this existed. A real list, not a single shared
 *  address (see the admin_emails migration's own comment on why) — several
 *  people can each sign in as themselves, with their own audit trail,
 *  instead of funneling through one shared login. Falls back to the
 *  superadmin list only when the community has no admin_emails configured
 *  yet, so a fresh community isn't locked out before anyone's had a chance
 *  to set one. Once admin_emails is non-empty, only what's on it is
 *  admitted — the superadmin list no longer applies. */
export async function isAllowedForCommunity(email: string, communitySlug: string): Promise<boolean> {
  const configured = await getCommunityAdminEmails(communitySlug)
  if (configured.length > 0) {
    const target = email.trim().toLowerCase()
    return configured.some((e) => e.trim().toLowerCase() === target)
  }
  return isAllowedAdminEmail(email)
}

async function verifyToken(request: Request): Promise<string | null> {
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
  return email
}

// Verifies that a request carries a valid Supabase access token (Bearer) for a
// SUPERADMIN email (the global ADMIN_EMAILS list). Returns the admin email, or
// null if unauthorized. Only for the genuinely cross-community actions listed
// on getAllowedAdminEmails' own comment — everything scoped to one community's
// content should use getAdminUserForCommunity instead.
export async function getAdminUser(request: Request): Promise<{ email: string } | null> {
  const email = await verifyToken(request)
  if (!email || !isAllowedAdminEmail(email)) return null
  return { email }
}

/** Same token verification as getAdminUser, but checks the caller against one
 *  specific community's admin (isAllowedForCommunity) instead of the global
 *  superadmin list — the check every community-scoped admin route (category/
 *  form/site editors, the moderation queue, …) should use, so a valid admin
 *  session for one community can't act on another's data once their emails
 *  diverge. */
export async function getAdminUserForCommunity(
  request: Request,
  communitySlug: string,
): Promise<{ email: string } | null> {
  const email = await verifyToken(request)
  if (!email || !(await isAllowedForCommunity(email, communitySlug))) return null
  return { email }
}
