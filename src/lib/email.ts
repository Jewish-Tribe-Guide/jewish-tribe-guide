import { Resend } from 'resend'
import type { SubmissionPayload } from './requests'
import { hospitalName } from './requests'

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px;font-weight:600;color:#334155;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
    <td style="padding:6px 12px;color:#0f172a;">${escapeHtml(value) || '—'}</td>
  </tr>`
}

function buildHtml(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
): string {
  const { contact, requestType, formData } = payload
  const formJson = JSON.stringify(formData, null, 2)
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#1d4ed8;margin-bottom:4px;">New ${escapeHtml(requestType)} Request</h2>
    <p style="color:#64748b;margin-top:0;font-size:14px;">Request ID: <strong>${escapeHtml(requestId)}</strong></p>
    <table style="border-collapse:collapse;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
      ${row('Submitted', timestamp)}
      ${row('Request Type', requestType)}
      ${row('Hospital', hospitalName(contact.hospitalId))}
      ${row('Name', contact.fullName)}
      ${row('Phone', contact.phone)}
      ${row('Email', contact.email)}
      ${row('Unit / Room', contact.unitFloorRoom)}
      ${row('Status', 'New')}
    </table>
    <h3 style="color:#334155;margin-bottom:6px;">Request Details</h3>
    <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;white-space:pre-wrap;">${escapeHtml(formJson)}</pre>
  </div>`
}

// Sends the notification email via Resend. Best-effort: callers should catch
// and log errors without failing the request (Sheets is the system of record).
export async function sendNotification(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('Missing required environment variable: RESEND_API_KEY')

  const from = process.env.RESEND_FROM || 'onboarding@resend.dev'
  const to = process.env.NOTIFICATION_TO || 'yhagler@gmail.com'

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from,
    to,
    subject: `New ${payload.requestType} Request — ${requestId}`,
    html: buildHtml(payload, requestId, timestamp),
  })

  if (error) {
    throw new Error(`Resend email failed: ${JSON.stringify(error)}`)
  }
}
