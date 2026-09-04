import { createSubscriber } from '@/lib/subscriberStore'
import { enforceRateLimit } from '@/lib/rateLimit'
import { isHoneypotTripped } from '@/lib/honeypot'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

type Body = {
  email?: string
  categories?: string[]
  notifyAdd?: boolean
  notifyClosure?: boolean
  company?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/subscribers — public endpoint for the desktop home screen's
// "stay in the loop" signup (see SubscribeSection.tsx). Instant, not
// moderated — there's nothing here for an admin to review, unlike a listing
// submission. Resubmitting with the same email updates preferences rather
// than creating a second subscription (see subscriberStore's upsert).
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'subscribers', { limit: 10, windowSec: 60 })
  if (limited) return limited

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  // Bot trap — silently accept so the bot can't tell it was caught.
  if (isHoneypotTripped(body)) return Response.json({ ok: true })

  const email = body.email?.trim() ?? ''
  if (!EMAIL_RE.test(email)) {
    return Response.json({ ok: false, errors: ['Please enter a valid email address.'] }, { status: 400 })
  }

  const notifyAdd = body.notifyAdd ?? true
  const notifyClosure = body.notifyClosure ?? true
  if (!notifyAdd && !notifyClosure) {
    return Response.json({ ok: false, errors: ['Pick at least one thing to be notified about.'] }, { status: 400 })
  }

  const community = await resolveCommunity(communitySlugFromRequest(request))

  try {
    await createSubscriber(community.slug, {
      email,
      categories: Array.isArray(body.categories) ? body.categories : null,
      notifyAdd,
      notifyClosure,
    })
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[subscribers] create failed:', err)
    return Response.json({ ok: false, errors: ['Something went wrong. Please try again.'] }, { status: 502 })
  }
}
