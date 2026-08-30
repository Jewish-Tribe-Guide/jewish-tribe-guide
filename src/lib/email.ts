import { Resend } from 'resend'
import type { SubmissionPayload } from './requests'
import { PREFERRED_CONTACT_LABELS } from './requests'
import { getCategoryById } from './categoryStore'
import { formatHoursSummary } from './hours'
import type { ResourceSubmission, SubmissionRow, CategorySubmissionPayload } from '@/types'
import { getDefaultCommunity } from '@/lib/communityStore'

// ── Shared utilities ──────────────────────────────────────────────────────────

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// The deployment these admin-notification links should point to. Deliberately
// NOT the same rule as siteUrl() (sitemap/robots/JSON-LD) — those want the
// stable production domain even from a preview build, so a crawler never
// associates canonical content with an ephemeral preview origin. An email
// telling someone to go review a submission needs the opposite: a link to
// THIS specific deployment, since a preview submission approved from a link
// that pointed at production would land the reviewer on a site with no idea
// the submission exists (see the preview/prod Supabase split this exists
// alongside). VERCEL_URL is Vercel's own per-deployment URL — already
// correct for preview without any config — so it's preferred there; APP_URL
// is the explicit override for when that's not right (a custom domain in
// production, where VERCEL_URL is only the vercel.app alias).
export function adminAppUrl(): string | undefined {
  if (process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return process.env.APP_URL?.replace(/\/$/, '')
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px;font-weight:600;color:#334155;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
    <td style="padding:6px 12px;color:#0f172a;">${escapeHtml(value) || '—'}</td>
  </tr>`
}

function formatMinyan(m: Record<string, unknown>): string {
  const days = Array.isArray(m.days) && m.days.length > 0 ? ` (${(m.days as string[]).join('/')})` : ''
  const note = m.notes ? ` — ${m.notes}` : ''
  const tefillah = typeof m.tefillah === 'string'
    ? m.tefillah.charAt(0).toUpperCase() + m.tefillah.slice(1).replace(/_/g, ' ')
    : ''
  return `${tefillah}${days}: ${m.time}${note}`
}

function formatDetailValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) {
    if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
      // Object arrays (e.g. minyanim) — format each item instead of calling String().
      return (v as Record<string, unknown>[]).map((item) =>
        'tefillah' in item ? formatMinyan(item) : JSON.stringify(item)
      ).join(' | ')
    }
    return (v as unknown[]).map(String).join(', ')
  }
  if (v && typeof v === 'object') return formatHoursSummary(v)
  return v != null ? String(v) : ''
}

// Low-level send. Reads RESEND_FROM from env (falls back to the sandbox sender).
// Callers sending to the public must ensure a verified domain is set in
// RESEND_FROM — the sandbox can only deliver to the account owner's address.
//
// Every email this app sends goes through here, so it's the one place to tag
// a non-production run — local dev now points at the same disposable
// Supabase project the write-test suites use (see README "Integration
// tests"), which means a submission/edit/moderation action taken while just
// clicking around locally fires a REAL email (Resend isn't environment-aware
// on its own). NODE_ENV !== 'production' mirrors the same signal
// dev-login/route.ts already uses to gate the local-admin bypass — anything
// other than a real `next build`/Vercel deploy gets prefixed, so a real
// inbox can filter/folder on "[DEV]" and know at a glance it's nothing to
// act on.
function taggedSubject(subject: string): string {
  return process.env.NODE_ENV === 'production' ? subject : `[DEV] ${subject}`
}

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
    subject: taggedSubject(subject),
    html,
    ...(replyTo ? { replyTo } : {}),
  })
  if (error) throw new Error(`Resend email failed: ${JSON.stringify(error)}`)
}

// ── Admin notification (intake forms) ────────────────────────────────────────

// Where this request lives once it's off Sheets: the 4 built-in hospital-
// facing types (Direct Support, Volunteer, Volunteer Edit, Volunteer
// Removal) are /inbox's whole reason for existing (see lib/inbox.ts); a
// custom admin-created form (payload.formId set) is a form response, which
// lives in /admin's Responses tab instead, same as Feedback. Neither /inbox
// nor that tab currently supports deep-linking to a specific sub-tab (see
// buildFeedbackHtml's own note on /admin/responses landing on Feedback only
// because it happens to be the default) — this links to the right SCREEN,
// not a further-selected tab within it.
function appLinkFor(payload: SubmissionPayload): string | null {
  const appUrl = adminAppUrl()
  if (!appUrl) return null
  return payload.formId ? `${appUrl}/admin/responses` : `${appUrl}/inbox`
}

function buildHtml(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
): string {
  const { contact, requestType, formData } = payload
  const formJson = JSON.stringify(formData, null, 2)
  const appUrl = appLinkFor(payload)
  const appLink = appUrl
    ? `<p style="margin-top:16px;"><a href="${escapeHtml(appUrl)}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Open in ${payload.formId ? 'admin' : 'inbox'} →</a></p>`
    : ''
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#1d4ed8;margin-bottom:4px;">New ${escapeHtml(requestType)} Request</h2>
    <p style="color:#64748b;margin-top:0;font-size:14px;">Request ID: <strong>${escapeHtml(requestId)}</strong></p>
    <table style="border-collapse:collapse;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
      ${row('Submitted', timestamp)}
      ${row('Request Type', requestType)}
      ${row('Hospital / room', contact.hospitalId)}
      ${row('Name', contact.fullName)}
      ${row('Phone', contact.phone)}
      ${row('Email', contact.email)}
      ${row('Preferred contact', PREFERRED_CONTACT_LABELS[contact.preferredContact] ?? contact.preferredContact)}
      ${row('Status', 'New')}
    </table>
    <h3 style="color:#334155;margin-bottom:6px;">Request Details</h3>
    <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;white-space:pre-wrap;">${escapeHtml(formJson)}</pre>
    ${appLink}
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
  if (payload.requestType === 'Feedback') return 'New Site Feedback'
  return `New Assistance Request — ${payload.requestType}`
}

// Sends the admin notification email via Resend. Best-effort: callers should
// catch and log errors without failing the request (Sheets is the system of
// record).
function buildFeedbackHtml(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
): string {
  const message = escapeHtml(String(payload.formData.message ?? ''))
  const email = payload.contact.email?.trim()
  // Feedback lives in the admin's Responses tab now, not a Sheet — same
  // link shape as sendSubmissionNotification's own adminLink below, just
  // pointed at /admin/responses (its own real route since the admin routing
  // refactor) rather than /admin. Feedback is that tab's default sub-tab
  // (see ResponsesManager's FEEDBACK_KEY), so no query param is needed to
  // land there directly.
  const appUrl = adminAppUrl()
  const adminLink = appUrl
    ? `<p style="margin-top:16px;"><a href="${escapeHtml(appUrl)}/admin/responses" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Open in admin →</a></p>`
    : ''
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#1d4ed8;margin-bottom:4px;">New Site Feedback</h2>
    <p style="color:#64748b;margin-top:0;font-size:14px;">ID: <strong>${escapeHtml(requestId)}</strong> · ${escapeHtml(timestamp)}</p>
    <table style="border-collapse:collapse;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
      ${row('Message', message)}
      ${email ? row('Email', email) : ''}
    </table>
    ${adminLink}
  </div>`
}

export async function sendNotification(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
): Promise<void> {
  const to = process.env.NOTIFICATION_TO || 'phillyjewishguide@gmail.com'
  const html = payload.requestType === 'Feedback'
    ? buildFeedbackHtml(payload, requestId, timestamp)
    : buildHtml(payload, requestId, timestamp)
  await sendEmail({
    to,
    subject: buildRequestSubject(payload),
    html,
    ...(payload.requestType === 'Feedback' && payload.contact.email?.trim()
      ? { replyTo: payload.contact.email.trim() }
      : {}),
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

// Emails an inbox-viewer sign-in link. Used by /api/inbox/request-link AFTER
// the email has been verified against INBOX_EMAILS (a separate allowlist from
// ADMIN_EMAILS — see inboxAuth.ts), so only allowed viewers ever receive one.
export async function sendInboxMagicLink(email: string, link: string): Promise<void> {
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;">
    <h2 style="color:#1d4ed8;">Sign in to the Inbox</h2>
    <p style="color:#334155;font-size:14px;">Click the button below to sign in. This link is for ${escapeHtml(email)} and expires shortly.</p>
    <p style="margin:24px 0;">
      <a href="${escapeHtml(link)}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Sign in</a>
    </p>
    <p style="color:#94a3b8;font-size:12px;">If you didn't request this, you can ignore this email.</p>
  </div>`

  await sendEmail({ to: email, subject: 'Your sign-in link — Inbox', html })
}

// Notifies the moderator that a new resource was submitted and is awaiting
// review. Best-effort: callers catch and log without failing the submission.
export async function sendSubmissionNotification(submission: SubmissionRow): Promise<void> {
  const to = process.env.NOTIFICATION_TO || 'phillyjewishguide@gmail.com'

  let subject: string
  let verb: string
  let title: string
  let proposedRows: string

  const DETAIL_SKIP = new Set(['geo', 'legacyId', 'placeId', 'googleSyncedAt', 'businessStatus', 'googleFields'])

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
    const category = payload.category
      ? await getCategoryById((await getDefaultCommunity()).slug, payload.category)
      : undefined
    const categoryLabel = category?.label ?? payload.category ?? ''
    // Real, human-editable content when the category configured it as a
    // field (see SubmissionCard.tsx's identical distinction) — otherwise it's
    // just the sync's own fallback card-subtitle text, not worth an admin's
    // review email.
    const descriptionConfigured = category?.detailFields.some((f) => f.key === 'googleDescription') ?? false
    const catSuffix = categoryLabel ? ` (${categoryLabel})` : ''
    subject =
      submission.operation === 'create'
        ? `New Listing Suggestion — ${title}${catSuffix}`
        : submission.operation === 'update'
          ? `Edit Listing Suggestion — ${title}${catSuffix}`
          : `Removal Listing Suggestion — ${title}${catSuffix}`
    const detailRows = Object.entries(payload.details ?? {})
      .filter(([k]) => !DETAIL_SKIP.has(k) && (k !== 'googleDescription' || descriptionConfigured))
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

  const appUrl = adminAppUrl()
  const adminLink = appUrl
    ? `<p style="margin-top:16px;"><a href="${escapeHtml(appUrl)}/admin" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Review in admin →</a></p>`
    : ''

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#1d4ed8;margin-bottom:4px;">${escapeHtml(verb)} — awaiting review</h2>
    <table style="border-collapse:collapse;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
      ${row('Type', verb)}
      ${proposedRows}
      ${submission.note ? row('Note', submission.note) : ''}
      ${row('Submitted by', submission.submitted_by?.name || submission.submitted_by?.email || 'Anonymous')}
    </table>
    ${adminLink}
  </div>`

  await sendEmail({ to, subject, html })
}

/** One row of the business-status digest below. */
export type StatusChange = {
  name: string
  category: string
  from: string
  to: string
}

const STATUS_WORDS: Record<string, string> = {
  OPERATIONAL: 'open',
  CLOSED_TEMPORARILY: 'temporarily closed',
  CLOSED_PERMANENTLY: 'permanently closed',
  UNKNOWN: 'not yet known',
}

function statusWord(v: string): string {
  return STATUS_WORDS[v] ?? v
}

/**
 * One digest per sync run listing every business whose Google status changed —
 * in either direction, reopenings included.
 *
 * Deliberately a notification and not a moderation-queue entry. A temporary
 * closure resolves itself: the sync rewrites businessStatus every run, so the
 * badge appears and clears with no admin action, and a queue entry would need
 * approving twice for something nobody has to decide. A permanent closure is
 * different — that one is destructive (the listing leaves the directory) and
 * still files a `delete` submission for review, separately from this.
 *
 * Sent only when something actually changed, so a quiet week is silent.
 */
export async function sendStatusChangeDigest(changes: StatusChange[]): Promise<void> {
  if (changes.length === 0) return
  const to = process.env.NOTIFICATION_TO || 'phillyjewishguide@gmail.com'
  const rows = changes
    .map(
      (c) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(c.name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;">${escapeHtml(c.category)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(statusWord(c.from))} &rarr; <strong>${escapeHtml(statusWord(c.to))}</strong></td>
      </tr>`,
    )
    .join('')
  const admin = adminAppUrl()
  await sendEmail({
    to,
    subject:
      changes.length === 1
        ? `${changes[0].name} is now ${statusWord(changes[0].to)}`
        : `${changes.length} listings changed status on Google`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="color:#1d4ed8;font-size:18px;">Google status changes</h2>
      <p style="color:#334155;font-size:14px;">The daily sync saw these change. Nothing needs approving — the listings already show the new status, and it will clear itself if Google changes its mind. This is here so a mistake in the job can't go unnoticed.</p>
      <table style="border-collapse:collapse;font-size:14px;width:100%;">${rows}</table>
      ${admin ? `<p style="font-size:13px;"><a href="${admin}" style="color:#1d4ed8;">Open the admin console</a></p>` : ''}
    </div>`,
  })
}
