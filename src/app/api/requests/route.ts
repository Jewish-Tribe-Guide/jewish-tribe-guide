import {
  type SubmissionPayload,
  validateSubmission,
  generateRequestId,
  buildSheetRow,
  buildVolunteerSheetRow,
  VOLUNTEER_SHEET_TAB,
  buildVolunteerChangeSheetRow,
  VOLUNTEER_CHANGES_SHEET_TAB,
  buildFeedbackSheetRow,
  FEEDBACK_SHEET_TAB,
} from '@/lib/requests'
import { appendRow } from '@/lib/sheets'
import { insertFormResponse } from '@/lib/formResponseStore'
import { hospitalNameMap } from '@/lib/hospitalStore'
import { sendNotification } from '@/lib/email'
import { sendRequestConfirmation } from '@/lib/confirmationEmail'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { easternTimestamp } from '@/lib/time'
import { payloadTooLarge } from '@/lib/limits'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'

export async function POST(request: Request) {
  // Writes to Sheets + sends two emails per call — throttle hard.
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
    return Response.json(
      { ok: false, errors: ['Verification failed. Please refresh and try again.'] },
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
    await insertFormResponse({
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

  // 3. Append to Google Sheets (legacy — best-effort now that the DB write
  //    above is the system of record, so a Sheets outage no longer blocks a
  //    submission). Volunteer signups → Volunteers tab; edit/removal
  //    change-requests → Volunteer Changes tab; all other requests → default
  //    Requests tab. Resolve hospital ids → names once for the row builders.
  try {
    const names = await hospitalNameMap()
    if (payload.requestType === 'Volunteer') {
      await appendRow(buildVolunteerSheetRow(payload, requestId, timestamp, names), { tab: VOLUNTEER_SHEET_TAB })
    } else if (payload.requestType === 'Volunteer Edit' || payload.requestType === 'Volunteer Removal') {
      await appendRow(buildVolunteerChangeSheetRow(payload, requestId, timestamp, names), { tab: VOLUNTEER_CHANGES_SHEET_TAB })
    } else if (payload.requestType === 'Feedback') {
      await appendRow(buildFeedbackSheetRow(payload, requestId, timestamp), { tab: FEEDBACK_SHEET_TAB })
    } else {
      await appendRow(buildSheetRow(payload, requestId, timestamp, names))
    }
  } catch (err) {
    console.error('[requests] Sheets append failed (best-effort, not blocking):', err)
  }

  // 4. Send emails (best-effort — never fail the request)
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

  // 5. Success
  return Response.json({ ok: true, requestId })
}
