import { Resend } from 'resend'
import type { SubmissionPayload } from './requests'
import { PREFERRED_CONTACT_LABELS } from './requests'
import { getCategoryById } from './categoryStore'
import { getCommunityNotifyRecipients, getReviewActionRecipients } from './communityStore'
import { adminBase } from './adminNav'
import { formatHoursSummary } from './hours'
import type { ResourceSubmission, SubmissionRow, CategorySubmissionPayload } from '@/types'
import type { CategoryField } from './categories'

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

// A plain number an admin can eyeball across two DIFFERENT emails about the
// same submission — the new-submission notification, and later a
// review-action notification saying someone else approved/rejected it.
// Without this, "X approved/rejected Y" reads as a fresh fact with nothing
// tying it back to the original request the admin already saw, which got
// confusing the moment more than one admin was acting on the same queue.
// Both subjects lead with it (rather than tucking it in a bracket at the
// end) since an inbox row usually truncates a long subject from the right,
// not the left — leading with the number is what keeps it visible no
// matter how the rest of the line gets cut off.
// Returns "" rather than "#undefined" when the number is missing. It HAS been
// missing, in every notification this app has sent: the case_number migration
// was never applied to any Supabase project, so `select('*')` came back
// without the column and moderators got "#undefined Approved — <name>".
//
// The type said otherwise (`case_number: number`, non-optional) — it is now
// optional, which is the honest shape for a column a deployed database may not
// have yet. Migrations land after the code that reads them, so this degrades
// instead of asserting.
function submissionRef(caseNumber: number | null | undefined): string {
  return caseNumber == null ? '' : `#${caseNumber}`
}

/** Joins a subject's parts, dropping any that are empty — so a missing
 *  reference costs the subject nothing, not a leading space. */
function subjectLine(...parts: string[]): string {
  return parts.filter(Boolean).join(' ')
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

// A select/tags field stores raw option *values*, which don't always match
// what the admin typed as the option's label (e.g. renamed since) — same
// distinction SubmissionCard.tsx's own resolveOptionLabel makes, so this
// notification reads the same text the moderation queue shows instead of
// whatever's in the raw JSON.
function resolveOptionLabel(field: CategoryField | undefined, value: unknown): string {
  const raw = String(value)
  const label = field?.options?.find((o) => o.value === raw)?.label
  return label ?? raw
}

function formatDetailValue(v: unknown, field?: CategoryField): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) {
    if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
      // Object arrays (e.g. minyanim) — format each item instead of calling String().
      return (v as Record<string, unknown>[]).map((item) =>
        'tefillah' in item ? formatMinyan(item) : JSON.stringify(item)
      ).join(' | ')
    }
    return (v as unknown[]).map((item) => resolveOptionLabel(field, item)).join(', ')
  }
  if (v && typeof v === 'object') return formatHoursSummary(v)
  if (field?.type === 'select') return resolveOptionLabel(field, v)
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
  bcc,
}: {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  bcc?: string[]
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
    ...(bcc && bcc.length > 0 ? { bcc } : {}),
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
function appLinkFor(payload: SubmissionPayload, communitySlug: string): string | null {
  const appUrl = adminAppUrl()
  if (!appUrl) return null
  // /inbox stays hardcoded (no community segment) — it has no per-community
  // split, see INBOX_BASE's own comment. The admin Responses tab does, via
  // adminBase — same fix as sendSubmissionNotification's adminLink below.
  return payload.formId ? `${appUrl}${adminBase(communitySlug)}/responses` : `${appUrl}/inbox`
}

function buildHtml(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
  communitySlug: string,
): string {
  const { contact, requestType, formData } = payload
  const formJson = JSON.stringify(formData, null, 2)
  const appUrl = appLinkFor(payload, communitySlug)
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
  communitySlug: string,
): string {
  const message = escapeHtml(String(payload.formData.message ?? ''))
  const email = payload.contact.email?.trim()
  // Feedback lives in the admin's Responses tab now, not a Sheet — same
  // link shape as sendSubmissionNotification's own adminLink below, just
  // pointed at that community's own /responses (its own real route since
  // the admin routing refactor) rather than the bare superadmin /admin.
  // Feedback is that tab's default sub-tab (see ResponsesManager's
  // FEEDBACK_KEY), so no query param is needed to land there directly.
  const appUrl = adminAppUrl()
  const adminLink = appUrl
    ? `<p style="margin-top:16px;"><a href="${escapeHtml(appUrl)}${adminBase(communitySlug)}/responses" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Open in admin →</a></p>`
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

// Who a new submission for this community should email — falls back to the
// site-wide NOTIFICATION_TO env var when admin_emails is empty, the same
// thing every community effectively did before admin_emails existed, and
// still the right answer for one that hasn't set it yet.
async function notificationRecipients(communitySlug: string): Promise<string[]> {
  const recipients = await getCommunityNotifyRecipients(communitySlug)
  if (recipients.length > 0) return recipients
  return [process.env.NOTIFICATION_TO || 'phillyjewishguide@gmail.com']
}

export async function sendNotification(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
  communitySlug: string,
): Promise<void> {
  const to = await notificationRecipients(communitySlug)
  const html = payload.requestType === 'Feedback'
    ? buildFeedbackHtml(payload, requestId, timestamp, communitySlug)
    : buildHtml(payload, requestId, timestamp, communitySlug)
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
// SUPERADMIN_EMAILS — see inboxAuth.ts), so only allowed viewers ever receive one.
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
  const to = await notificationRecipients(submission.community_id)

  let subject: string
  let verb: string
  let title: string
  let proposedRows: string

  const DETAIL_SKIP = new Set(['geo', 'legacyId', 'placeId', 'googleSyncedAt', 'businessStatus', 'googleFields'])

  if (submission.target_type === 'category') {
    const payload = submission.payload as CategorySubmissionPayload
    verb = 'New category'
    title = payload.label
    subject = subjectLine(submissionRef(submission.case_number), `New Category Suggestion — ${title}`)
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
      ? await getCategoryById(submission.community_id, payload.category)
      : undefined
    const categoryLabel = category?.label ?? payload.category ?? ''
    // Real, human-editable content when the category configured it as a
    // field (see SubmissionCard.tsx's identical distinction) — otherwise it's
    // just the sync's own fallback card-subtitle text, not worth an admin's
    // review email.
    const descriptionConfigured = category?.detailFields.some((f) => f.key === 'googleDescription') ?? false
    const catSuffix = categoryLabel ? ` (${categoryLabel})` : ''
    const ref = submissionRef(submission.case_number)
    const kind =
      submission.operation === 'create'
        ? 'New Listing Suggestion'
        : submission.operation === 'update'
          ? 'Edit Listing Suggestion'
          : 'Removal Listing Suggestion'
    subject = subjectLine(ref, `${kind} — ${title}${catSuffix}`)
    const detailRows = Object.entries(payload.details ?? {})
      .filter(([k]) => !DETAIL_SKIP.has(k) && (k !== 'googleDescription' || descriptionConfigured))
      .map(([k, v]) => {
        // Resolved through the category's own field config — SAME reasoning
        // as SubmissionCard.tsx's flatListing: a raw JSON key/value is
        // sometimes all there is (a renamed/removed field, or a category not
        // yet loaded), but it's never preferred over the field's real,
        // admin-configured label and option text.
        const field = category?.detailFields.find((f) => f.key === k)
        return row(field?.label ?? k, formatDetailValue(v, field))
      })
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
  // adminBase(community), not a bare '/admin' — that's the standalone
  // superadmin console (no moderation queue of its own), while this
  // submission belongs to one specific community's own console. See
  // adminBase's own doc for why every admin link should go through it.
  const adminLink = appUrl
    ? `<p style="margin-top:16px;"><a href="${escapeHtml(appUrl)}${adminBase(submission.community_id)}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Review in admin →</a></p>`
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

/** "New category — Kosher Butchers" / "New listing — Goldi's" — the same
 *  title text sendSubmissionNotification's own subject already derives, in
 *  one place so the review-action notification below doesn't have to
 *  re-derive it differently and drift. */
function submissionDisplayName(submission: SubmissionRow): string {
  if (submission.target_type === 'category') {
    return (submission.payload as CategorySubmissionPayload).label
  }
  return (submission.payload as Partial<ResourceSubmission>).name ?? 'a listing'
}

// Tells every OTHER opted-in admin of this community that ONE admin just
// approved or rejected a submission — not the submitter (see
// confirmationEmail.ts's sendDecisionEmail for that), and never the acting
// admin themselves (getReviewActionRecipients excludes them). Best-effort:
// callers catch and log without failing the moderation action, same
// convention as every other notification here.
//
// Opt-in (empty by default — see the notify_review_emails migration's own
// comment), unlike new-submission notifications: nobody asked to be
// told about other admins' decisions until this existed, so nothing turns
// itself on for anyone. `actorEmail` is the acting admin's own verified
// token email from the call site (getAdminUserForCommunity) — never
// client-supplied — the same way reviewed_by itself is recorded.
export async function sendReviewActionNotification(
  submission: SubmissionRow,
  decision: 'approved' | 'rejected',
  actorEmail: string,
): Promise<void> {
  const to = await getReviewActionRecipients(submission.community_id, actorEmail)
  if (to.length === 0) return

  const title = escapeHtml(submissionDisplayName(submission))
  const verb = decision === 'approved' ? 'approved' : 'rejected'
  const Verb = decision === 'approved' ? 'Approved' : 'Rejected'
  const appUrl = adminAppUrl()
  const adminLink = appUrl
    ? `<p style="margin-top:16px;"><a href="${escapeHtml(appUrl)}${adminBase(submission.community_id)}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Open the admin console →</a></p>`
    : ''

  // Subject leads with the number, then the decision — that's the two
  // things someone scanning an inbox actually needs ("is this an approval,
  // and which request") — not who did it. WHO is in the body instead: it
  // matters once you've opened the email, not before.
  await sendEmail({
    to,
    subject: subjectLine(submissionRef(submission.case_number), `${Verb} — ${submissionDisplayName(submission)}`),
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1d4ed8;margin-bottom:4px;">${Verb}</h2>
      <p style="color:#334155;font-size:14px;">${title} was just ${verb} by ${escapeHtml(actorEmail)}. You're getting this because you turned on "Notify me when another admin approves or rejects a submission" in the Team tab.</p>
      ${adminLink}
    </div>`,
  })
}

/** One row of the business-status digest below. */
export type StatusChange = {
  name: string
  category: string
  from: string
  to: string
  communitySlug: string
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
 *
 * Grouped by community and routed through notificationRecipients() — the
 * same per-community/per-admin lookup sendNotification uses — rather than
 * one flat email to a single hardcoded address. A single nightly cron run
 * covers every community at once, so a batch of changes can span several of
 * them; each gets its own digest (only its own listings, only its own
 * admins, respecting each admin's own opt-out) instead of every community's
 * admins seeing every other community's changes.
 */
export async function sendStatusChangeDigest(changes: StatusChange[]): Promise<void> {
  if (changes.length === 0) return

  const byCommunity = new Map<string, StatusChange[]>()
  for (const change of changes) {
    const existing = byCommunity.get(change.communitySlug)
    if (existing) existing.push(change)
    else byCommunity.set(change.communitySlug, [change])
  }

  await Promise.all(
    Array.from(byCommunity.entries()).map(([communitySlug, communityChanges]) =>
      sendCommunityStatusChangeDigest(communitySlug, communityChanges),
    ),
  )
}

async function sendCommunityStatusChangeDigest(communitySlug: string, changes: StatusChange[]): Promise<void> {
  const to = await notificationRecipients(communitySlug)

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
