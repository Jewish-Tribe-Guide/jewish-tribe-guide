import {
  type SubmissionPayload,
  validateSubmission,
  generateRequestId,
  buildSheetRow,
  buildVolunteerSheetRow,
  VOLUNTEER_SHEET_TAB,
  buildVolunteerChangeSheetRow,
  VOLUNTEER_CHANGES_SHEET_TAB,
} from '@/lib/requests'
import { appendRow } from '@/lib/sheets'
import { sendNotification } from '@/lib/email'
import { sendRequestConfirmation } from '@/lib/confirmationEmail'
import { enforceRateLimit } from '@/lib/rateLimit'
import { payloadTooLarge } from '@/lib/limits'

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

  // 1. Validate
  const errors = validateSubmission(payload)
  if (errors.length > 0) {
    return Response.json({ ok: false, errors }, { status: 400 })
  }

  const requestId = generateRequestId()
  const timestamp = new Date().toISOString()

  // 2. Append to Google Sheets (system of record — hard failure if this fails).
  //    Volunteer signups → Volunteers tab; edit/removal change-requests →
  //    Volunteer Changes tab; all other requests → default Requests tab.
  try {
    if (payload.requestType === 'Volunteer') {
      await appendRow(buildVolunteerSheetRow(payload, requestId, timestamp), { tab: VOLUNTEER_SHEET_TAB })
    } else if (payload.requestType === 'Volunteer Edit' || payload.requestType === 'Volunteer Removal') {
      await appendRow(buildVolunteerChangeSheetRow(payload, requestId, timestamp), { tab: VOLUNTEER_CHANGES_SHEET_TAB })
    } else {
      await appendRow(buildSheetRow(payload, requestId, timestamp))
    }
  } catch (err) {
    console.error('[requests] Sheets append failed:', err)
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
