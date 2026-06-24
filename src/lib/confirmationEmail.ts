import { sendEmail, escapeHtml } from './email'
import type { SubmissionPayload } from './requests'
import type { SubmissionRow, CategorySubmissionPayload, ResourceSubmission } from '@/types'

// Returns true when RESEND_FROM is still the Resend sandbox address, which
// can only deliver to the account owner's verified email — not to the public.
// Confirmation emails are skipped in this state so they don't silently fail.
// Set RESEND_FROM to an address on your verified domain to enable them.
function isSandbox(): boolean {
  return (process.env.RESEND_FROM || 'onboarding@resend.dev') === 'onboarding@resend.dev'
}

// Where replies from submitters should land. Defaults to the admin
// notification address so a human sees any reply.
function replyTo(): string | undefined {
  return process.env.RESEND_REPLY_TO || process.env.NOTIFICATION_TO || undefined
}

const BODY_STYLE = 'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;'
const HEADING_STYLE = 'color:#1d4ed8;margin-bottom:8px;'
const TEXT_STYLE = 'color:#64748b;font-size:14px;line-height:1.6;margin:8px 0;'

function wrap(inner: string): string {
  return `<div style="${BODY_STYLE}">${inner}</div>`
}

// ── Intake form confirmations ─────────────────────────────────────────────────

function buildRequestConfirmation(
  payload: SubmissionPayload,
  requestId: string,
): { subject: string; html: string } {
  const name = escapeHtml(payload.contact.fullName)

  switch (payload.requestType) {
    case 'Feedback':
      return {
        subject: 'Thanks for your feedback',
        html: wrap(`
          <h2 style="${HEADING_STYLE}">Thanks for your note!</h2>
          <p style="${TEXT_STYLE}">We&apos;ve received your feedback and appreciate you taking the time to share it.</p>
          <p style="${TEXT_STYLE}">Have questions? Just reply to this email.</p>
        `),
      }

    case 'Volunteer':
      return {
        subject: "You're on our volunteer list",
        html: wrap(`
          <h2 style="${HEADING_STYLE}">Thank you, ${name}!</h2>
          <p style="${TEXT_STYLE}">You&apos;re now on our volunteer list. We&apos;ll reach out when there&apos;s a need that matches what you&apos;ve offered to help with.</p>
          <p style="${TEXT_STYLE}">If you ever need to update or remove your commitment, you can do so from the volunteer page on our site.</p>
          <p style="${TEXT_STYLE}">Have questions? Just reply to this email.</p>
        `),
      }

    case 'Volunteer Edit':
      return {
        subject: 'Your volunteer commitment has been updated',
        html: wrap(`
          <h2 style="${HEADING_STYLE}">Got it, ${name}.</h2>
          <p style="${TEXT_STYLE}">We&apos;ve received your updated commitment and will apply the changes to your record shortly.</p>
          <p style="${TEXT_STYLE}">Have questions? Just reply to this email.</p>
        `),
      }

    case 'Volunteer Removal':
      return {
        subject: 'Your removal request has been received',
        html: wrap(`
          <h2 style="${HEADING_STYLE}">Received, ${name}.</h2>
          <p style="${TEXT_STYLE}">We&apos;ve received your request to be removed from our volunteer list and will take care of it shortly. Thank you for everything you&apos;ve done for the community.</p>
          <p style="${TEXT_STYLE}">Have questions? Just reply to this email.</p>
        `),
      }

    default:
      // All assistance request types (Meals, Transportation, Visitors, etc.)
      return {
        subject: `We received your ${payload.requestType} request`,
        html: wrap(`
          <h2 style="${HEADING_STYLE}">We received your request, ${name}.</h2>
          <p style="${TEXT_STYLE}">Someone from our team will review your <strong>${escapeHtml(payload.requestType)}</strong> request and be in touch soon.</p>
          <p style="${TEXT_STYLE}">Your reference ID is <strong>${escapeHtml(requestId)}</strong> — mention it if you follow up with us.</p>
          <p style="${TEXT_STYLE}">Have questions? Just reply to this email.</p>
        `),
      }
  }
}

// Sends a confirmation email to the person who submitted an intake form.
// Skips gracefully if:
//   • no email address was provided (email is optional on intake forms), or
//   • RESEND_FROM is still the sandbox sender (can't deliver to the public).
export async function sendRequestConfirmation(
  payload: SubmissionPayload,
  requestId: string,
): Promise<void> {
  const to = payload.contact.email?.trim()
  if (!to) return

  if (isSandbox()) {
    console.log('[confirmationEmail] Skipping — RESEND_FROM is the sandbox sender. Set a verified domain to enable public delivery.')
    return
  }

  const { subject, html } = buildRequestConfirmation(payload, requestId)
  await sendEmail({ to, subject, html, replyTo: replyTo() })
}

// ── Resource directory submission confirmations ───────────────────────────────

function buildSubmissionConfirmation(
  submission: SubmissionRow,
): { subject: string; html: string } | null {
  const name = escapeHtml(submission.submitted_by?.name || 'there')

  if (submission.target_type === 'category') {
    const payload = submission.payload as CategorySubmissionPayload
    return {
      subject: `Thanks for suggesting a new category — ${payload.label}`,
      html: wrap(`
        <h2 style="${HEADING_STYLE}">Thanks, ${name}!</h2>
        <p style="${TEXT_STYLE}">We&apos;ve received your suggestion for a new category: <strong>${escapeHtml(payload.label)}</strong>.</p>
        <p style="${TEXT_STYLE}">A moderator will review it and we&apos;ll be in touch if it&apos;s approved.</p>
        <p style="${TEXT_STYLE}">Have questions? Just reply to this email.</p>
      `),
    }
  }

  const payload = submission.payload as Partial<ResourceSubmission>
  const listingName = escapeHtml(payload.name ?? 'a listing')

  if (submission.operation === 'create') {
    return {
      subject: `Thanks for suggesting a listing — ${payload.name ?? 'New listing'}`,
      html: wrap(`
        <h2 style="${HEADING_STYLE}">Thanks, ${name}!</h2>
        <p style="${TEXT_STYLE}">We&apos;ve received your suggestion to add <strong>${listingName}</strong> to the directory.</p>
        <p style="${TEXT_STYLE}">A moderator will review it, and it&apos;ll appear in the directory once approved.</p>
        <p style="${TEXT_STYLE}">Have questions? Just reply to this email.</p>
      `),
    }
  }

  if (submission.operation === 'update') {
    return {
      subject: `Thanks for the correction — ${payload.name ?? 'Listing update'}`,
      html: wrap(`
        <h2 style="${HEADING_STYLE}">Thanks, ${name}!</h2>
        <p style="${TEXT_STYLE}">We&apos;ve received your suggested edit for <strong>${listingName}</strong>.</p>
        <p style="${TEXT_STYLE}">A moderator will review it and apply the change if it looks right.</p>
        <p style="${TEXT_STYLE}">Have questions? Just reply to this email.</p>
      `),
    }
  }

  if (submission.operation === 'delete') {
    return {
      subject: `Thanks for the heads-up — ${payload.name ?? 'Listing removal'}`,
      html: wrap(`
        <h2 style="${HEADING_STYLE}">Thanks for letting us know, ${name}.</h2>
        <p style="${TEXT_STYLE}">We&apos;ve received your report about <strong>${listingName}</strong>.</p>
        <p style="${TEXT_STYLE}">A moderator will review it and update the directory if needed.</p>
        <p style="${TEXT_STYLE}">Have questions? Just reply to this email.</p>
      `),
    }
  }

  return null
}

// ── Moderation decision emails ────────────────────────────────────────────────

function buildDecisionEmail(
  submission: SubmissionRow,
  decision: 'approved' | 'rejected',
  reason?: string,
): { subject: string; html: string } | null {
  const name = escapeHtml(submission.submitted_by?.name || 'there')
  const reasonBlock = reason
    ? `<p style="${TEXT_STYLE}"><strong>Note from our team:</strong> ${escapeHtml(reason)}</p>`
    : ''
  const closing = `<p style="${TEXT_STYLE}">Have questions? Just reply to this email.</p>`

  if (submission.target_type === 'category') {
    const payload = submission.payload as CategorySubmissionPayload
    const label = escapeHtml(payload.label)

    if (decision === 'approved') {
      return {
        subject: `Your category suggestion has been approved — ${payload.label}`,
        html: wrap(`
          <h2 style="${HEADING_STYLE}">Great news, ${name}! 🎉</h2>
          <p style="${TEXT_STYLE}">Your suggestion for a new category, <strong>${label}</strong>, has been approved and is now live in the directory. Thank you for helping make this resource more useful for the community!</p>
          ${closing}
        `),
      }
    }
    return {
      subject: `Update on your category suggestion — ${payload.label}`,
      html: wrap(`
        <h2 style="${HEADING_STYLE}">Hi ${name},</h2>
        <p style="${TEXT_STYLE}">Thank you so much for suggesting the <strong>${label}</strong> category. After reviewing, we weren&apos;t able to add it at this time.</p>
        ${reasonBlock}
        <p style="${TEXT_STYLE}">We really appreciate you taking the time to help improve the community!</p>
        ${closing}
      `),
    }
  }

  const payload = submission.payload as Partial<ResourceSubmission>
  const listingName = escapeHtml(payload.name ?? 'a listing')

  if (submission.operation === 'create') {
    if (decision === 'approved') {
      return {
        subject: `Your listing suggestion has been approved — ${payload.name ?? 'New listing'}`,
        html: wrap(`
          <h2 style="${HEADING_STYLE}">Great news, ${name}! 🎉</h2>
          <p style="${TEXT_STYLE}"><strong>${listingName}</strong> has been added to the directory. Thank you for helping make this resource more complete for the community!</p>
          ${closing}
        `),
      }
    }
    return {
      subject: `Update on your listing suggestion — ${payload.name ?? 'New listing'}`,
      html: wrap(`
        <h2 style="${HEADING_STYLE}">Hi ${name},</h2>
        <p style="${TEXT_STYLE}">Thank you for suggesting <strong>${listingName}</strong>. After reviewing, we weren&apos;t able to add it to the directory at this time.</p>
        ${reasonBlock}
        <p style="${TEXT_STYLE}">We appreciate the effort you put in to help the community!</p>
        ${closing}
      `),
    }
  }

  if (submission.operation === 'update') {
    if (decision === 'approved') {
      return {
        subject: `Your suggested edit has been applied — ${payload.name ?? 'Listing update'}`,
        html: wrap(`
          <h2 style="${HEADING_STYLE}">Great news, ${name}! 🎉</h2>
          <p style="${TEXT_STYLE}">Your suggested edit for <strong>${listingName}</strong> has been reviewed and applied. Thank you for helping keep the directory accurate!</p>
          ${closing}
        `),
      }
    }
    return {
      subject: `Update on your suggested edit — ${payload.name ?? 'Listing update'}`,
      html: wrap(`
        <h2 style="${HEADING_STYLE}">Hi ${name},</h2>
        <p style="${TEXT_STYLE}">Thank you for suggesting an edit for <strong>${listingName}</strong>. After reviewing, we weren&apos;t able to apply it at this time.</p>
        ${reasonBlock}
        <p style="${TEXT_STYLE}">We appreciate you helping keep the directory up to date!</p>
        ${closing}
      `),
    }
  }

  if (submission.operation === 'delete') {
    if (decision === 'approved') {
      return {
        subject: `Your listing report has been reviewed — ${payload.name ?? 'Listing removal'}`,
        html: wrap(`
          <h2 style="${HEADING_STYLE}">Thanks for the heads-up, ${name}.</h2>
          <p style="${TEXT_STYLE}">We reviewed your report about <strong>${listingName}</strong> and removed it from the directory. Thank you for helping keep the community&apos;s information accurate!</p>
          ${closing}
        `),
      }
    }
    return {
      subject: `Update on your listing report — ${payload.name ?? 'Listing removal'}`,
      html: wrap(`
        <h2 style="${HEADING_STYLE}">Hi ${name},</h2>
        <p style="${TEXT_STYLE}">Thank you for your report about <strong>${listingName}</strong>. After reviewing, we&apos;ve decided to keep it in the directory for now.</p>
        ${reasonBlock}
        <p style="${TEXT_STYLE}">We appreciate you looking out for the community!</p>
        ${closing}
      `),
    }
  }

  return null
}

// Sends an approval or rejection email to the person who submitted a resource
// directory change. Skips gracefully if:
//   • no email was provided via submittedBy, or
//   • RESEND_FROM is still the sandbox sender.
export async function sendDecisionEmail(
  submission: SubmissionRow,
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<void> {
  const to = submission.submitted_by?.email?.trim()
  if (!to) return

  if (isSandbox()) {
    console.log('[confirmationEmail] Skipping decision email — RESEND_FROM is the sandbox sender. Set a verified domain to enable public delivery.')
    return
  }

  const result = buildDecisionEmail(submission, decision, reason)
  if (!result) return

  const { subject, html } = result
  await sendEmail({ to, subject, html, replyTo: replyTo() })
}

// ── Resource directory submission confirmations ───────────────────────────────

// Sends a confirmation email to the person who submitted a resource directory
// change. Skips gracefully if:
//   • no email was provided via submittedBy, or
//   • RESEND_FROM is still the sandbox sender.
export async function sendSubmissionConfirmation(submission: SubmissionRow): Promise<void> {
  const to = submission.submitted_by?.email?.trim()
  if (!to) return

  if (isSandbox()) {
    console.log('[confirmationEmail] Skipping — RESEND_FROM is the sandbox sender. Set a verified domain to enable public delivery.')
    return
  }

  const result = buildSubmissionConfirmation(submission)
  if (!result) return

  const { subject, html } = result
  await sendEmail({ to, subject, html, replyTo: replyTo() })
}
