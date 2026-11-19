import {
  type RequestType,
  type SubmissionPayload,
  validateSubmission,
  generateRequestId,
} from '@/lib/requests'
import { insertFormResponse } from '@/lib/formResponseStore'
import { sendNotification } from '@/lib/email'
import { sendRequestConfirmation } from '@/lib/confirmationEmail'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { easternTimestamp } from '@/lib/time'
import { payloadTooLarge } from '@/lib/limits'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listPublishedForms } from '@/lib/formStore'
import { normalizeEmail } from '@/lib/activity'

// The site's own request types. Anything else is an admin-made form, named by
// its formId; its title comes from the form, never from the sender, because
// it goes into the subject of an email the site sends.
const BUILT_IN_TYPES: readonly RequestType[] = ['Direct Support', 'Volunteer', 'Volunteer Edit', 'Volunteer Removal', 'Feedback']

export async function POST(request: Request) {
  // Sends two emails per call — throttle hard.
  const limited = await enforceRateLimit(request, 'requests', { limit: 5, windowSec: 60 })
  if (limited) return limited

  let payload: SubmissionPayload
  try {
    payload = (await request.json()) as SubmissionPayload
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  const tooBig = payloadTooLarge(payload)
  if (tooBig) return Response.json({ ok: false, errors: [tooBig] }, { status: 413 })

  // Bot trap — silently accept (no Sheets/email) so the bot can't tell.
  if (isHoneypotTripped(payload)) {
    return Response.json({ ok: true, requestId: 'ok' })
  }

  // CAPTCHA — no-op until TURNSTILE_SECRET_KEY is configured.
  const turnstileToken = (payload as { turnstileToken?: string }).turnstileToken
  if (!(await verifyTurnstile(turnstileToken, clientIp(request)))) {
    // `code`, not just the status: this route returns 403 for several
    // unrelated refusals (a disabled contribution type, a category with edits
    // turned off), and the client can only offer "we refreshed the challenge,
    // tap Submit again" for THIS one. Without a code it was offering it for
    // all of them, which loops forever on a refusal no retry can fix, and
    // hides the server's real explanation while it does.
    return Response.json(
      { ok: false, code: 'turnstile', errors: ['Verification failed. Please refresh and try again.'] },
      { status: 403 },
    )
  }

  // 1. Validate
  const errors = validateSubmission(payload)
  if (errors.length > 0) {
    return Response.json({ ok: false, errors }, { status: 400 })
  }

  const community = await resolveCommunity(communitySlugFromRequest(request))

  // One address, as the site would write it — never a list, so the
  // confirmation can only go to the person who filled the form in.
  if (payload.contact?.email?.trim()) {
    const email = normalizeEmail(payload.contact.email)
    if (!email) return Response.json({ ok: false, errors: ['Please enter a valid email.'] }, { status: 400 })
    payload.contact.email = email
  }

  if (!BUILT_IN_TYPES.includes(payload.requestType as RequestType)) {
    const form = payload.formId
      ? (await listPublishedForms(community.slug)).find((f) => f.id === payload.formId)
      : undefined
    if (!form) return Response.json({ ok: false, errors: ['This form is not available.'] }, { status: 400 })
    payload.requestType = form.title
  }

  const requestId = generateRequestId()
  const timestamp = easternTimestamp()

  // 2. Save to the database (system of record — hard failure if this fails).
  try {
    await insertFormResponse({
      community: community.slug,
      requestId,
      requestType: payload.requestType,
      formId: payload.formId,
      contact: payload.contact,
      data: payload.formData,
    })
  } catch (err) {
    console.error('[requests] DB save failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not save your request. Please try again.'] },
      { status: 502 },
    )
  }

  // 3. Send emails (best-effort — never fail the request)
  try {
    await sendNotification(payload, requestId, timestamp, community.slug)
  } catch (err) {
    console.error('[requests] Admin notification failed:', err)
  }
  try {
    await sendRequestConfirmation(payload, requestId, community.slug)
  } catch (err) {
    console.error('[requests] Confirmation email failed:', err)
  }

  // 4. Success
  return Response.json({ ok: true, requestId })
}
