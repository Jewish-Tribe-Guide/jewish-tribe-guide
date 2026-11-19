import { getResourceById } from '@/lib/resourceStore'
import { getCategoryById, listCategories } from '@/lib/categoryStore'
import { resolveCapabilities } from '@/lib/categories'
import { prepareSubmission } from '@/lib/prepareSubmission'
import {
  submitListingCreate,
  submitListingUpdate,
  submitListingDelete,
  submitEruvUpdate,
  submitEruvCreate,
} from '@/lib/submissionStore'
import { readNewEruv } from '@/lib/newEruv'
import { listEruvim, listEruvimForAdmin } from '@/lib/eruvStore'
import { readEruvSuggestion } from '@/lib/eruvSuggestion'
import { eruvPageOwnFields } from '@/lib/eruvFields'
import { after } from 'next/server'
import { sendSubmissionNotification } from '@/lib/email'
import { sendSubmissionConfirmation } from '@/lib/confirmationEmail'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { payloadTooLarge } from '@/lib/limits'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { hasListingChanged } from '@/lib/listingDiff'
import { contributionsFor } from '@/lib/uiConfig'
import type { ResourceSubmission, SubmissionRow } from '@/types'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { normalizeEmail } from '@/lib/activity'

type Body = {
  operation?: 'create' | 'update' | 'delete'
  targetType?: 'listing' | 'category' | 'eruv'
  targetId?: string
  payload?: ResourceSubmission
  note?: string
  submittedBy?: { name?: string; email?: string }
  turnstileToken?: string
}

// POST /api/submissions — public endpoint for proposing a change: add/edit/report
// a listing, a fix to an eruv's listing (`targetType: 'eruv'`, an update;
// eruvSuggestion.ts), or a new eruv (an eruv's create; newEruv.ts). Everything lands in the moderation queue as `pending`; nothing goes
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
  // The deployment's switches and this community's own (contributionsFor).
  const contributions = contributionsFor(community.ui)
  const { operation, targetType = 'listing', targetId, note } = body
  // Only the email a visitor typed. A name is how the guide's own checks
  // and admins sign (submissionSource, editedBy), so one sent from here
  // would let a visitor's edit pass as Keystone-K's or Google's.
  const email = normalizeEmail(body.submittedBy?.email)
  const submittedBy = email ? { email } : null

  if (targetType === 'category') {
    return Response.json({ ok: false, errors: ['This action is not available.'] }, { status: 403 })
  }

  if (targetType === 'eruv' && operation === 'create') {
    const categories = await listCategories(community.slug)
    const page = categories.find((c) => c.kind === 'eruv')
    if (!contributions.add || !page || !resolveCapabilities(page.capabilities).add) return Response.json({ ok: false, errors: ['This action is not available.'] }, { status: 403 })
    // Hidden ones too: adding one by the same name would fail at approval.
    const listed = await listEruvimForAdmin(community.slug)
    if (!listed.available) return Response.json({ ok: false, errors: ['This action is not available.'] }, { status: 403 })
    const read = readNewEruv(body.payload, listed.eruvim, eruvPageOwnFields(categories))
    if (!read.ok) return Response.json({ ok: false, errors: read.errors }, { status: 400 })
    let submission: SubmissionRow
    try {
      submission = await submitEruvCreate(community.slug, read.suggestion, note?.trim() || null, submittedBy)
    } catch (err) {
      console.error('[submissions] new eruv insert failed:', err)
      return Response.json({ ok: false, errors: ['Could not save your submission. Please try again.'] }, { status: 502 })
    }
    after(() => notify(submission))
    return Response.json({ ok: true, id: submission.id })
  }

  if (targetType === 'eruv') {
    if (!contributions.edit) return Response.json({ ok: false, errors: ['This action is not available.'] }, { status: 403 })
    if (operation !== 'update' || !targetId) return Response.json({ ok: false, errors: ['Unknown operation.'] }, { status: 400 })
    const eruv = (await listEruvim(community.slug)).eruvim.find((e) => e.id === targetId)
    if (!eruv) return Response.json({ ok: false, errors: ['Eruv not found.'] }, { status: 404 })
    const read = readEruvSuggestion(body.payload, eruv, eruvPageOwnFields(await listCategories(community.slug)))
    if (!read.ok) return Response.json({ ok: false, errors: read.errors }, { status: 400 })
    let submission: SubmissionRow
    try {
      submission = await submitEruvUpdate(community.slug, read.suggestion, note?.trim() || null, submittedBy)
    } catch (err) {
      console.error('[submissions] eruv insert failed:', err)
      return Response.json({ ok: false, errors: ['Could not save your submission. Please try again.'] }, { status: 502 })
    }
    after(() => notify(submission))
    return Response.json({ ok: true, id: submission.id })
  }

  // Curated-directory gate: refuse whichever contribution paths the community
  // turned off (contributionsFor: the deployment's config and its own row), so hiding a button can't
  // be bypassed by posting directly.
  const allowed =
    operation === 'create'
      ? contributions.add
      : operation === 'update'
        ? contributions.edit
        : operation === 'delete'
          ? contributions.report
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
  // Where a suggestion came from ("Read by AI") and an admin's fixes are
  // the site's own to say, never a visitor's: prepareSubmission strips them.
  if ((operation === 'create' || operation === 'update') && !payload) {
    return Response.json({ ok: false, errors: ['Missing listing details.'] }, { status: 400 })
  }

  // Fetched once and reused below both for the per-category capability gate
  // and (for an update) the "did this actually change anything" check —
  // rather than hitting the resource table twice for the same row.
  const existingResource = targetId ? await getResourceById(targetId, community.slug) : null
  // targetId scoped to the wrong community (or just made up) reads back as
  // null now that getResourceById is community-scoped — reject explicitly
  // rather than letting an update/delete fall through and file a submission
  // against a listing in a DIFFERENT community than the one this request is
  // posting to.
  if (targetId && !existingResource) {
    return Response.json({ ok: false, errors: ['Listing not found.'] }, { status: 404 })
  }

  // Per-category gate: on top of the community’s contributions check above, the
  // target category can independently turn add/edit/report off. Resolve the
  // category from the payload (create) or the existing listing (update/delete),
  // so a disabled per-category button can't be bypassed by posting directly.
  const categoryId = operation === 'create' ? payload?.category : existingResource?.category
  // A new place only in a category on the site: getCategoryById reads
  // hidden ones too, and a hidden page has no Add for a visitor to reach.
  // listCategories counts one a campaign has revealed as on the site.
  if (operation === 'create' && !(await listCategories(community.slug)).some((c) => c.id === categoryId)) {
    return Response.json({ ok: false, errors: ['This action is not available for this category.'] }, { status: 403 })
  }
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
    const errors = prepareSubmission(payload, category, {
      operation: operation === 'create' ? 'create' : 'update',
      storedPlaceId: existingResource?.placeId,
    })
    // The authoritative version of the guard the editors already apply
    // client-side (ListingEditor and BoxEditor keep Send off until something
    // changed) — this one can't be bypassed by posting directly.
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

  // after(), not a floating promise. These used to be started and abandoned:
  // the handler returned its response on the next line and the invocation was
  // free to be frozen or torn down with the sends still in flight, so whether
  // an admin got told about a submission came down to whether the function
  // happened to stay alive. A real submission (#1065, Mekor Habracha) landed
  // in the database with nothing ever reaching Resend and no error anywhere,
  // which is what that race looks like when it loses.
  //
  // after() is the framework's own answer (next/server): the callback runs
  // once the response is finished, and the platform keeps the invocation alive
  // for the route's max duration rather than reclaiming it.
  after(() => notify(submission))
  return Response.json({ ok: true, id: submission.id })
}

// Best-effort emails — never fail the request. Awaited (not fired and
// forgotten) so after() actually waits on them: a promise left floating
// INSIDE the callback would be abandoned exactly the same way.
async function notify(submission: SubmissionRow): Promise<void> {
  await Promise.all([
    sendSubmissionNotification(submission).catch((err) =>
      console.error('[submissions] Admin notification failed:', err),
    ),
    sendSubmissionConfirmation(submission).catch((err) =>
      console.error('[submissions] Confirmation email failed:', err),
    ),
  ])
}
