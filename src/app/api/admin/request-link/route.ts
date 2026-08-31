import { getAdminClient } from '@/lib/supabase/admin'
import { isAllowedForCommunity } from '@/lib/adminAuth'
import { listCommunities } from '@/lib/communityStore'
import { sendAdminMagicLink } from '@/lib/email'
import { enforceRateLimit } from '@/lib/rateLimit'

// POST /api/admin/request-link  body: { email, community }
// Sends a magic sign-in link ONLY if the email administers the given
// community (see adminAuth.ts's isAllowedForCommunity — NOT just anywhere on
// the global admin list, so a magic link for /philly/admin can't be requested
// with an email that only administers /ues). Because public sign-ups are
// disabled in Supabase, this server route (service-role) is the only path
// that can create/sign in an admin — so no one else can obtain a link by
// entering an arbitrary email.
export async function POST(request: Request) {
  // Sends email when the address is an admin — throttle to prevent inbox spam.
  const limited = await enforceRateLimit(request, 'request-link', { limit: 5, windowSec: 300 })
  if (limited) return limited

  let email: string
  let communitySlug: string
  try {
    const body = (await request.json()) as { email?: string; community?: string }
    email = (body.email || '').trim()
    communitySlug = (body.community || '').trim()
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  if (!email) {
    return Response.json({ ok: false, error: 'Email is required.' }, { status: 400 })
  }
  if (!communitySlug) {
    return Response.json({ ok: false, error: 'community is required.' }, { status: 400 })
  }

  // Always respond the same way regardless of outcome, so the endpoint can't
  // be used to discover which addresses are admins (or which slugs are real
  // communities).
  const genericOk = Response.json({ ok: true })

  // Matched against the real list rather than resolveCommunity, which falls
  // back to the default community for an unknown slug — fine for public
  // content, but here it would silently check the WRONG community's
  // admin_email for a mistyped/bogus slug.
  const communities = await listCommunities()
  const target = communities.find((c) => c.slug === communitySlug)
  if (!target) {
    console.warn(`[admin/request-link] unknown community: ${communitySlug}`)
    return genericOk
  }

  if (!(await isAllowedForCommunity(email, target.slug))) {
    console.warn(`[admin/request-link] rejected non-admin email for ${target.slug}: ${email}`)
    return genericOk
  }

  const supabase = getAdminClient()
  const origin = request.headers.get('origin') || new URL(request.url).origin
  const redirectTo = `${origin}/${target.slug}/admin`

  try {
    // Ensure the user exists (sign-ups are disabled, so we create allowlisted
    // admins here via service-role). Ignore "already registered" errors.
    const { error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    if (createErr && !/registered|exists/i.test(createErr.message)) {
      throw createErr
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    if (error || !data.properties?.action_link) {
      throw error || new Error('No action link returned.')
    }

    await sendAdminMagicLink(email, data.properties.action_link)
  } catch (err) {
    console.error('[admin/request-link] failed:', err)
    return Response.json({ ok: false, error: 'Could not send the sign-in link.' }, { status: 502 })
  }

  return genericOk
}
