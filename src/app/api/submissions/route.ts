import { validateSubmission } from '@/lib/resourceStore'
import { getCategoryById } from '@/lib/categoryStore'
import {
  submitListingCreate,
  submitListingUpdate,
  submitListingDelete,
  submitCategoryCreate,
} from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { sendSubmissionConfirmation } from '@/lib/confirmationEmail'
import { isValidPhone } from '@/lib/validation'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { payloadTooLarge } from '@/lib/limits'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { ui } from '@/lib/uiConfig'
import type { ResourceSubmission, SubmissionRow, CategorySubmissionPayload } from '@/types'

type Body = {
  operation?: 'create' | 'update' | 'delete'
  targetType?: 'listing' | 'category'
  targetId?: string
  payload?: ResourceSubmission | CategorySubmissionPayload
  note?: string
  submittedBy?: { name?: string; email?: string }
  turnstileToken?: string
}

// POST /api/submissions — public endpoint for proposing a change: add/edit/report
// a listing, or request a new category (with its first listing). Everything lands
// in the moderation queue as `pending`; nothing goes live until an admin approves.
export async function POST(request: Request) {
  // Each submission geocodes + emails, and floods the moderation queue if
  // abused — throttle per IP.
  const limited = await enforceRateLimit(request, 'submissions', { limit: 10, windowSec: 60 })
  if (limited) return limited

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  const tooBig = payloadTooLarge(body)
  if (tooBig) return Response.json({ ok: false, errors: [tooBig] }, { status: 413 })

  // Bot trap — silently accept (no DB/email/geocode) so the bot can't tell.
  if (isHoneypotTripped(body)) return Response.json({ ok: true, id: 'ok' })

  // CAPTCHA — no-op until TURNSTILE_SECRET_KEY is configured.
  if (!(await verifyTurnstile(body.turnstileToken, clientIp(request)))) {
    return Response.json(
      { ok: false, errors: ['Verification failed. Please refresh and try again.'] },
      { status: 403 },
    )
  }

  const { operation, targetType = 'listing', targetId, note } = body
  const submittedBy = body.submittedBy ?? null

  // Curated-directory gate: refuse whichever contribution paths the community
  // turned off in community.config (ui.contributions), so hiding a button can't
  // be bypassed by posting directly.
  const allowed =
    targetType === 'category'
      ? ui.contributions.suggestCategory
      : operation === 'create'
        ? ui.contributions.add
        : operation === 'update'
          ? ui.contributions.edit
          : operation === 'delete'
            ? ui.contributions.report
            : true // unknown operations fall through to the 400 below
  if (!allowed) {
    return Response.json({ ok: false, errors: ['This action is not available.'] }, { status: 403 })
  }

  if (targetType === 'category') {
    return handleCategory(body, submittedBy)
  }

  if (operation !== 'create' && operation !== 'update' && operation !== 'delete') {
    return Response.json({ ok: false, errors: ['Unknown operation.'] }, { status: 400 })
  }
  if ((operation === 'update' || operation === 'delete') && !targetId) {
    return Response.json({ ok: false, errors: ['Missing target id.'] }, { status: 400 })
  }

  const payload = body.payload as ResourceSubmission | undefined
  if ((operation === 'create' || operation === 'update') && !payload) {
    return Response.json({ ok: false, errors: ['Missing listing details.'] }, { status: 400 })
  }

  if (payload) {
    const category = await getCategoryById(payload.category)
    const errors = validateSubmission(payload, category)
    if (errors.length > 0) {
      return Response.json({ ok: false, errors }, { status: 400 })
    }
  }

  let submission: SubmissionRow
  try {
    if (operation === 'create') {
      submission = await submitListingCreate({ ...payload!, submittedBy: submittedBy ?? undefined })
    } else if (operation === 'update') {
      submission = await submitListingUpdate(targetId!, payload!, note ?? null, submittedBy)
    } else {
      submission = await submitListingDelete(targetId!, note ?? null, submittedBy)
    }
  } catch (err) {
    console.error('[submissions] insert failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not save your submission. Please try again.'] },
      { status: 502 },
    )
  }

  notify(submission)
  return Response.json({ ok: true, id: submission.id })
}

async function handleCategory(body: Body, submittedBy: { name?: string; email?: string } | null) {
  const payload = body.payload as CategorySubmissionPayload | undefined
  if (body.operation !== 'create' || !payload) {
    return Response.json({ ok: false, errors: ['Invalid category submission.'] }, { status: 400 })
  }

  const errors: string[] = []
  if (!payload.label?.trim()) errors.push('Category name is required.')
  const f = payload.firstListing
  if (!f?.name?.trim()) errors.push('The first listing’s name is required.')
  if (!f?.address?.trim()) errors.push('The first listing’s address is required.')
  if (f?.phone?.trim() && !isValidPhone(f.phone)) errors.push('Please enter a valid phone number.')
  if (errors.length > 0) {
    return Response.json({ ok: false, errors }, { status: 400 })
  }

  let submission: SubmissionRow
  try {
    submission = await submitCategoryCreate(payload, submittedBy)
  } catch (err) {
    console.error('[submissions] category insert failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not save your submission. Please try again.'] },
      { status: 502 },
    )
  }

  notify(submission)
  return Response.json({ ok: true, id: submission.id })
}

// Best-effort emails — never fail the request.
function notify(submission: SubmissionRow) {
  sendSubmissionNotification(submission).catch((err) =>
    console.error('[submissions] Admin notification failed:', err),
  )
  sendSubmissionConfirmation(submission).catch((err) =>
    console.error('[submissions] Confirmation email failed:', err),
  )
}
