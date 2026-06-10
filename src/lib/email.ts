import { Resend } from 'resend'
import type { SubmissionPayload } from './requests'
import { hospitalName } from './requests'
import { getCategoryById } from './categoryStore'
import { formatHoursSummary } from './hours'
import type { ResourceSubmission, SubmissionRow, CategorySubmissionPayload } from '@/types'

// ── Shared utilities ──────────────────────────────────────────────────────────

export function escapeHtml(value: unknown): string {
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

function formatDetailValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return (v as unknown[]).map(String).join(', ')
  if (v && typeof v === 'object') return formatHoursSummary(v)
  return v != null ? String(v) : ''
}

// Low-level send. Reads RESEND_FROM from env (falls back to the sandbox sender).
// Callers sending to the public must ensure a verified domain is set in
// RESEND_FROM — the sandbox can only deliver to the account owner's address.
export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string
  subject: string
  html: string
  replyTo?: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('Missing required environment variable: RESEND_API_KEY')
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev'
  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  })
  if (error) throw new Error(`Resend email failed: ${JSON.stringify(error)}`)
}

// ── Admin notification (intake forms) ────────────────────────────────────────

function sheetsTabUrl(requestType: string): string {
  const id = process.env.GOOGLE_SHEETS_ID
  if (!id) return ''
  const base = `https://docs.google.com/spreadsheets/d/${id}/edit`
  // Volunteer Edit / Volunteer Removal → "Volunteer Changes" tab
  if (requestType === 'Volunteer Edit' || requestType === 'Volunteer Removal') {
    const gid = process.env.GOOGLE_SHEETS_VOLUNTEER_CHANGES_GID
    return gid ? `${base}#gid=${gid}` : base
  }
  // New Volunteer signup → "Volunteer" tab
  if (requestType === 'Volunteer') {
    const gid = process.env.GOOGLE_SHEETS_VOLUNTEER_GID
    return gid ? `${base}#gid=${gid}` : base
  }
  // All other requests (meals, transportation, etc.) → base sheet
  return base
}

function buildHtml(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
): string {
  const { contact, requestType, formData } = payload
  const formJson = JSON.stringify(formData, null, 2)
  const sheetsUrl = sheetsTabUrl(requestType)
  const sheetsLink = sheetsUrl
    ? `<p style="margin-top:16px;"><a href="${escapeHtml(sheetsUrl)}" style="background:#16a34a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Open Google Sheets →</a></p>`
    : ''
  // Only non-volunteer request types have "Request" in their subject line.
  const isVolunteer = requestType === 'Volunteer' || requestType === 'Volunteer Edit' || requestType === 'Volunteer Removal'
  const appUrl = process.env.APP_URL?.replace(/\/$/, '')
  const adminLink = !isVolunteer && appUrl
    ? `<p style="margin-top:8px;"><a href="${escapeHtml(appUrl)}/admin" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Go to admin →</a></p>`
    : ''
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
    ${sheetsLink}
    ${adminLink}
  </div>`
}

const VOLUNTEER_WAYS_ORDER = ['meals', 'visiting', 'transportation', 'housing', 'other']
const VOLUNTEER_WAYS_LABELS: Record<string, string> = {
  meals: 'Meals',
  visiting: 'Visiting',
  transportation: 'Transportation',
  housing: 'Housing',
  other: 'Other',
}

function buildRequestSubject(payload: SubmissionPayload): string {
  if (payload.requestType === 'Volunteer') {
    const v = payload.formData as { waysToHelp?: string[] }
    const selected = new Set(v.waysToHelp ?? [])
    const ways = VOLUNTEER_WAYS_ORDER
      .filter((code) => selected.has(code))
      .map((code) => VOLUNTEER_WAYS_LABELS[code] ?? code)
    return ways.length > 0
      ? `New Assistance Volunteer — ${ways.join(', ')}`
      : 'New Assistance Volunteer'
  }
  if (payload.requestType === 'Volunteer Edit') {
    return `Edit Volunteer Commitment — ${payload.contact.fullName || 'Unknown'}`
  }
  if (payload.requestType === 'Volunteer Removal') {
    return `Remove Volunteer Commitment — ${payload.contact.fullName || 'Unknown'}`
  }
  return `New Assistance Request — ${payload.requestType}`
}

// Sends the admin notification email via Resend. Best-effort: callers should
// catch and log errors without failing the request (Sheets is the system of
// record).
export async function sendNotification(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
): Promise<void> {
  const to = process.env.NOTIFICATION_TO || 'jewishpatientconnect@gmail.com'
  await sendEmail({
    to,
    subject: buildRequestSubject(payload),
    html: buildHtml(payload, requestId, timestamp),
  })
}

// Emails an admin sign-in link. Used by /api/admin/request-link AFTER the
// email has been verified against the allowlist, so only admins ever receive
// a link.
export async function sendAdminMagicLink(email: string, link: string): Promise<void> {
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;">
    <h2 style="color:#1d4ed8;">Sign in to Resource Moderation</h2>
    <p style="color:#334155;font-size:14px;">Click the button below to sign in. This link is for ${escapeHtml(email)} and expires shortly.</p>
    <p style="margin:24px 0;">
      <a href="${escapeHtml(link)}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Sign in</a>
    </p>
    <p style="color:#94a3b8;font-size:12px;">If you didn't request this, you can ignore this email.</p>
  </div>`

  await sendEmail({ to: email, subject: 'Your sign-in link — Resource Moderation', html })
}

// Notifies the moderator that a new resource was submitted and is awaiting
// review. Best-effort: callers catch and log without failing the submission.
export async function sendSubmissionNotification(submission: SubmissionRow): Promise<void> {
  const to = process.env.NOTIFICATION_TO || 'jewishpatientconnect@gmail.com'

  let subject: string
  let verb: string
  let title: string
  let proposedRows: string

  const DETAIL_SKIP = new Set(['geo', 'legacyId', 'placeId', 'googleSyncedAt', 'businessStatus'])

  if (submission.target_type === 'category') {
    const payload = submission.payload as CategorySubmissionPayload
    verb = 'New category'
    title = payload.label
    subject = `New Category Suggestion — ${title}`
    const f = payload.firstListing
    proposedRows = `${row('Category name', payload.label)}
      ${payload.description ? row('Description', payload.description) : ''}
      ${row('First listing', f?.name ?? '')}
      ${row('Address', f?.address ?? '')}
      ${row('Phone', f?.phone ?? '')}`
  } else {
    const payload = submission.payload as Partial<ResourceSubmission>
    verb =
      submission.operation === 'create'
        ? 'New listing'
        : submission.operation === 'update'
          ? 'Suggested edit'
          : 'Removal reported'
    title = payload.name ?? 'a listing'
    const categoryLabel = payload.category
      ? (await getCategoryById(payload.category))?.label ?? payload.category
      : ''
    const catSuffix = categoryLabel ? ` (${categoryLabel})` : ''
    subject =
      submission.operation === 'create'
        ? `New Listing Suggestion — ${title}${catSuffix}`
        : submission.operation === 'update'
          ? `Edit Listing Suggestion — ${title}${catSuffix}`
          : `Removal Listing Suggestion — ${title}${catSuffix}`
    const detailRows = Object.entries(payload.details ?? {})
      .filter(([k]) => !DETAIL_SKIP.has(k))
      .map(([k, v]) => row(k, formatDetailValue(v)))
      .join('')
    proposedRows =
      submission.operation === 'delete'
        ? ''
        : `${row('Category', categoryLabel)}
           ${row('Name', payload.name ?? '')}
           ${row('Address', payload.address ?? '')}
           ${row('Phone', payload.phone ?? '')}
           ${detailRows}`
  }

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#1d4ed8;margin-bottom:4px;">${escapeHtml(verb)} — awaiting review</h2>
    <table style="border-collapse:collapse;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
      ${row('Type', verb)}
      ${proposedRows}
      ${submission.note ? row('Note', submission.note) : ''}
      ${row('Submitted by', submission.submitted_by?.name || submission.submitted_by?.email || 'Anonymous')}
    </table>
  </div>`

  await sendEmail({ to, subject, html })
}
