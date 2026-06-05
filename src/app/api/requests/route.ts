import {
  type SubmissionPayload,
  validateSubmission,
  generateRequestId,
  buildSheetRow,
} from '@/lib/requests'
import { appendRow } from '@/lib/sheets'
import { sendNotification } from '@/lib/email'

export async function POST(request: Request) {
  let payload: SubmissionPayload
  try {
    payload = (await request.json()) as SubmissionPayload
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  // 1. Validate
  const errors = validateSubmission(payload)
  if (errors.length > 0) {
    return Response.json({ ok: false, errors }, { status: 400 })
  }

  const requestId = generateRequestId()
  const timestamp = new Date().toISOString()

  // 2. Append to Google Sheets (system of record — hard failure if this fails)
  try {
    await appendRow(buildSheetRow(payload, requestId, timestamp))
  } catch (err) {
    console.error('[requests] Sheets append failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not save your request. Please try again.'] },
      { status: 502 },
    )
  }

  // 3. Send email notification (best-effort — never fails the request)
  try {
    await sendNotification(payload, requestId, timestamp)
  } catch (err) {
    console.error('[requests] Email notification failed:', err)
  }

  // 4. Success
  return Response.json({ ok: true, requestId })
}
