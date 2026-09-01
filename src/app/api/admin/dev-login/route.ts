import { getAdminClient } from '@/lib/supabase/admin'
import { getAllowedAdminEmails } from '@/lib/adminAuth'
import { getCommunityAdminEmails } from '@/lib/communityStore'

// POST /api/admin/dev-login  body: { secret, community? }
//
// Local-development-only shortcut: mints a real admin session server-side (via
// the same admin.generateLink Supabase Auth uses for the magic-link email) and
// returns its tokens directly, so /admin can call supabase.auth.setSession()
// with them — no email round-trip needed while iterating locally. Mints a
// session for the first of the COMMUNITY's own configured admin_emails
// (falling back to ADMIN_EMAILS[0] if that community hasn't set any yet),
// so /philly/admin?devToken=... and /ues/admin?devToken=... sign you in as
// whichever community's admin the URL actually names, instead of always the
// same address regardless of which console you're testing. `community`
// omitted — as it is from the standalone superadmin console at
// /admin?devToken=... — mints a session for ADMIN_EMAILS[0] directly, the
// superadmin identity.
//
// Refuses outright unless BOTH of these hold, so it's structurally incapable of
// weakening a real deployment even if DEV_ADMIN_BYPASS_SECRET leaked:
//   1. NODE_ENV !== 'production' (sites deployed via `next build`/Vercel are
//      always 'production'; only `next dev` is not)
//   2. DEV_ADMIN_BYPASS_SECRET is set at all (never set it in Vercel's env vars)
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ ok: false, error: 'Not available.' }, { status: 404 })
  }

  const expected = process.env.DEV_ADMIN_BYPASS_SECRET
  if (!expected) {
    return Response.json({ ok: false, error: 'DEV_ADMIN_BYPASS_SECRET is not set.' }, { status: 404 })
  }

  let secret: string
  let communitySlug: string
  try {
    const body = (await request.json()) as { secret?: string; community?: string }
    secret = body.secret || ''
    communitySlug = (body.community || '').trim()
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  if (secret !== expected) {
    return Response.json({ ok: false, error: 'Wrong secret.' }, { status: 401 })
  }

  const communityAdmins = communitySlug ? await getCommunityAdminEmails(communitySlug) : []
  const email = communityAdmins[0] || getAllowedAdminEmails()[0]
  if (!email) {
    return Response.json({ ok: false, error: 'No ADMIN_EMAILS configured.' }, { status: 500 })
  }

  try {
    const supabase = getAdminClient()
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email })
    if (error || !data.properties?.action_link) throw error || new Error('No action link returned.')

    // Follow the link ourselves (server-to-server) instead of emailing it, and
    // read the tokens straight off the redirect — same mechanism as a real
    // magic-link click, minus the email and the browser round-trip.
    const verifyRes = await fetch(data.properties.action_link, { redirect: 'manual' })
    const location = verifyRes.headers.get('location') || ''
    const hash = location.split('#')[1] || ''
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (!accessToken || !refreshToken) {
      throw new Error(`Verify redirect had no tokens: ${location.split('#')[0]}`)
    }

    return Response.json({ ok: true, accessToken, refreshToken })
  } catch (err) {
    console.error('[admin/dev-login] failed:', err)
    const message = err instanceof Error ? err.message : 'Could not create a dev session.'
    return Response.json({ ok: false, error: message }, { status: 502 })
  }
}
