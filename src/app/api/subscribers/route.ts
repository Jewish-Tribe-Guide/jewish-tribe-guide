import { after } from 'next/server'
import { createSubscriber } from '@/lib/subscriberStore'
import { sendSubscribeConfirmation } from '@/lib/subscriberEmail'
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
    const subscriber = await createSubscriber(community.slug, {
      email,
      categories: Array.isArray(body.categories) ? body.categories : null,
      notifyAdd,
      notifyClosure,
    })
    // after(), not awaited inline — same reasoning as the decision/closure
    // notifications this pairs with (see the submissions route): a slow or
    // failed send must never hold up, or fail, the signup itself. The send
    // call inside the callback is itself awaited, though — see
    // src/test/emailScheduling.test.ts: after() keeps the invocation alive
    // only for as long as its callback is still pending, so starting the
    // send without awaiting it in here would let the callback resolve
    // immediately and the platform tear the invocation down mid-send, same
    // as never scheduling it at all.
    after(async () => {
      await sendSubscribeConfirmation(subscriber).catch((err) => console.error('[subscribers] confirmation email failed:', err))
    })
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[subscribers] create failed:', err)
    return Response.json({ ok: false, errors: ['Something went wrong. Please try again.'] }, { status: 502 })
  }
}
