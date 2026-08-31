import { validateSubmission, getResourceById } from '@/lib/resourceStore'
import { getCategoryById } from '@/lib/categoryStore'
import { resolveCapabilities } from '@/lib/categories'
import {
  submitListingCreate,
  submitListingUpdate,
  submitListingDelete,
} from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { sendSubmissionConfirmation } from '@/lib/confirmationEmail'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { payloadTooLarge } from '@/lib/limits'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { normalizeUrl } from '@/lib/validation'
import { hasListingChanged } from '@/lib/listingDiff'
import { ui } from '@/lib/uiConfig'
import type { ResourceSubmission, SubmissionRow } from '@/types'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

type Body = {
  operation?: 'create' | 'update' | 'delete'
  targetType?: 'listing' | 'category'
  targetId?: string
  payload?: ResourceSubmission
  note?: string
  submittedBy?: { name?: string; email?: string }
  turnstileToken?: string
}

// POST /api/submissions — public endpoint for proposing a change: add/edit/report
// a listing. Everything lands in the moderation queue as `pending`; nothing goes
// live until an admin approves. (`targetType: 'category'` is rejected outright —
// suggesting a new category is no longer a public path; feedback comes through
// the general feedback form instead. Older `category` rows may still exist in the
// queue for moderators to clear, but nothing new can create one.)
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

  const community = await resolveCommunity(communitySlugFromRequest(request))
  const { operation, targetType = 'listing', targetId, note } = body
  const submittedBy = body.submittedBy ?? null

  if (targetType === 'category') {
    return Response.json({ ok: false, errors: ['This action is not available.'] }, { status: 403 })
  }

  // Curated-directory gate: refuse whichever contribution paths the community
  // turned off in community.config (ui.contributions), so hiding a button can't
  // be bypassed by posting directly.
  const allowed =
    operation === 'create'
      ? ui.contributions.add
      : operation === 'update'
        ? ui.contributions.edit
        : operation === 'delete'
          ? ui.contributions.report
          : true // unknown operations fall through to the 400 below
  if (!allowed) {
    return Response.json({ ok: false, errors: ['This action is not available.'] }, { status: 403 })
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

  // Fetched once and reused below both for the per-category capability gate
  // and (for an update) the "did this actually change anything" check —
  // rather than hitting the resource table twice for the same row.
  const existingResource = targetId ? await getResourceById(targetId) : null

  // Per-category gate: on top of the global `ui.contributions` check above, the
  // target category can independently turn add/edit/report off. Resolve the
  // category from the payload (create) or the existing listing (update/delete),
  // so a disabled per-category button can't be bypassed by posting directly.
  const categoryId = operation === 'create' ? payload?.category : existingResource?.category
  if (categoryId) {
    const cat = await getCategoryById(community.slug, categoryId)
    if (cat) {
      const caps = resolveCapabilities(cat.capabilities)
      const capOk =
        operation === 'create' ? caps.add : operation === 'update' ? caps.edit : caps.report
      if (!capOk) {
        return Response.json(
          { ok: false, errors: ['This action is not available for this category.'] },
          { status: 403 },
        )
      }
    }
  }

  if (payload) {
    const category = await getCategoryById(community.slug, payload.category)
    // Nobody types the "https://" scheme by hand for a website field — add it
    // before validating (so a bare "example.com" isn't rejected) and before
    // storing (so the saved value is still a real, working link — the card
    // renderer uses it as-is for the href). The listing form already does
    // this client-side on blur; normalizing again here covers any submission
    // that skips that path (e.g. a stale client, direct API use).
    if (payload.details) {
      for (const field of category?.detailFields ?? []) {
        if (field.type !== 'url') continue
        const raw = payload.details[field.key]
        if (typeof raw === 'string' && raw.trim()) payload.details[field.key] = normalizeUrl(raw)
      }
    }
    const errors = validateSubmission(payload, category)
    // The authoritative version of the same guard ListingForm.tsx already
    // runs client-side — this one can't be bypassed by posting directly.
    // Only for 'update': a 'create' has no `existingResource` to compare
    // against (hasListingChanged treats that as always "a change" anyway).
    if (operation === 'update' && !hasListingChanged(existingResource, payload, category?.detailFields ?? [])) {
      errors.push('No changes were made to this listing — nothing to submit.')
    }
    if (errors.length > 0) {
      return Response.json({ ok: false, errors }, { status: 400 })
    }
  }

  let submission: SubmissionRow
  try {
    if (operation === 'create') {
      submission = await submitListingCreate(community.slug, {
        ...payload!,
        submittedBy: submittedBy ?? undefined,
      })
    } else if (operation === 'update') {
      submission = await submitListingUpdate(community.slug, targetId!, payload!, note ?? null, submittedBy)
    } else {
      submission = await submitListingDelete(community.slug, targetId!, note ?? null, submittedBy)
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

// Best-effort emails — never fail the request.
function notify(submission: SubmissionRow) {
  sendSubmissionNotification(submission).catch((err) =>
    console.error('[submissions] Admin notification failed:', err),
  )
  sendSubmissionConfirmation(submission).catch((err) =>
    console.error('[submissions] Confirmation email failed:', err),
  )
}
