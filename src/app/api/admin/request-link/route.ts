import { getAdminClient } from '@/lib/supabase/admin'
import { isAllowedAdminEmail } from '@/lib/adminAuth'
import { sendAdminMagicLink } from '@/lib/email'
import { enforceRateLimit } from '@/lib/rateLimit'

// POST /api/admin/request-link  body: { email }
// Sends a magic sign-in link ONLY if the email is an allowlisted admin. Because
// public sign-ups are disabled in Supabase, this server route (service-role) is
// the only path that can create/sign in an admin — so no one else can obtain a
// link by entering an arbitrary email.
export async function POST(request: Request) {
  // Sends email when the address is an admin — throttle to prevent inbox spam.
  const limited = await enforceRateLimit(request, 'request-link', { limit: 5, windowSec: 300 })
  if (limited) return limited

  let email: string
  try {
    const body = (await request.json()) as { email?: string }
    email = (body.email || '').trim()
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  if (!email) {
    return Response.json({ ok: false, error: 'Email is required.' }, { status: 400 })
  }

  // Always respond the same way whether or not the email is allowed, so the
  // endpoint can't be used to discover which addresses are admins.
  const genericOk = Response.json({ ok: true })
  if (!isAllowedAdminEmail(email)) {
    console.warn(`[admin/request-link] rejected non-admin email: ${email}`)
    return genericOk
  }

  const supabase = getAdminClient()
  const origin = request.headers.get('origin') || new URL(request.url).origin
  const redirectTo = `${origin}/admin`

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
