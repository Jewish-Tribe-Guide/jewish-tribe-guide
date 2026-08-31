import {
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

  const requestId = generateRequestId()
  const timestamp = easternTimestamp()

  // 2. Save to the database (system of record — hard failure if this fails).
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
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
    await sendNotification(payload, requestId, timestamp)
  } catch (err) {
    console.error('[requests] Admin notification failed:', err)
  }
  try {
    await sendRequestConfirmation(payload, requestId)
  } catch (err) {
    console.error('[requests] Confirmation email failed:', err)
  }

  // 4. Success
  return Response.json({ ok: true, requestId })
}
