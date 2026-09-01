import { getAdminClient } from '@/lib/supabase/admin'
import { isAllowedInboxEmail } from '@/lib/inboxAuth'
import { sendInboxMagicLink } from '@/lib/email'
import { enforceRateLimit } from '@/lib/rateLimit'

// POST /api/inbox/request-link  body: { email }
// Sends a magic sign-in link ONLY if the email is allowlisted in INBOX_EMAILS —
// a separate list from SUPERADMIN_EMAILS (see inboxAuth.ts). Mirrors
// /api/admin/request-link exactly, down to the generic response (so this
// endpoint can't be used to discover which addresses can read the inbox).
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'inbox-request-link', { limit: 5, windowSec: 300 })
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

  const genericOk = Response.json({ ok: true })
  if (!isAllowedInboxEmail(email)) {
    console.warn(`[inbox/request-link] rejected non-viewer email: ${email}`)
    return genericOk
  }

  const supabase = getAdminClient()
  const origin = request.headers.get('origin') || new URL(request.url).origin
  const redirectTo = `${origin}/inbox`

  try {
    // Ensure the user exists (sign-ups are disabled, so we create allowlisted
    // viewers here via service-role, same as the admin route). Ignore
    // "already registered" — someone can already exist as an admin.
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

    await sendInboxMagicLink(email, data.properties.action_link)
  } catch (err) {
    console.error('[inbox/request-link] failed:', err)
    return Response.json({ ok: false, error: 'Could not send the sign-in link.' }, { status: 502 })
  }

  return genericOk
}
