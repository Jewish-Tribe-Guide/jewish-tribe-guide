import { reportServerError } from '@/lib/serverError'
import { readEruvNowById } from '@/lib/eruvReadNow'
import { runWalkRoutesAfterChange } from '@/lib/walkRouteJob'
import { revalidateTag } from 'next/cache'
import { after, type NextRequest } from 'next/server'
import { TAGS } from '@/lib/cacheTags'
import { adminWrite, unchanged } from '@/lib/adminRoute'
import { approveSubmission, decidePart, rejectSubmission, ReviewEditError } from '@/lib/submissionStore'
import { sendDecisionEmail } from '@/lib/confirmationEmail'
import { sendReviewActionNotification, sendStatusChangeDigest } from '@/lib/email'
import { loadSyncableListing, syncOneListing } from '@/lib/syncListing'
import { getResourceRowById } from '@/lib/resourceStore'
import { getCategoryById } from '@/lib/categoryStore'
import { listSubscribersForCategory } from '@/lib/subscriberStore'
import { sendNewListingNotification, sendClosureNotification } from '@/lib/subscriberEmail'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'

// PATCH /api/admin/submissions/:id
// body: { status: 'approved' | 'rejected', reason?: string, payload?: listing, only?: string[] }
// Approving APPLIES the change to the live tables. Admin only. `payload`, with
// an approval only: the listing as the admin fixed it in the opened card,
// which is what goes live instead of what was sent (reviewEdits.ts). `only`,
// with an approval only: the lines of a watch's finding ticked on its job
// page ("Update 2 on the listing"); the rest stay as the listing says.
// `part`: one part of an edit decided on its own (reviewParts.ts), the rest
// left waiting, with `payload` when the admin fixed it in Edit; its last
// part decides the edit as before.
// A best-effort decision email is sent to the submitter if they provided one.
// The wrapper drops the public site's cached copy after a decision, so the
// edit shows up; a part rejected on its own changes nothing yet (unchanged).
export const PATCH = adminWrite(async (request: NextRequest, { community, admin }, ctx: RouteContext<'/api/admin/submissions/[id]'>) => {
  const { id } = await ctx.params

  let body: { status?: string; reason?: string; payload?: unknown; only?: unknown; part?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (body.status !== 'approved' && body.status !== 'rejected') {
    return Response.json(
      { ok: false, errors: ["status must be 'approved' or 'rejected'."] },
      { status: 400 },
    )
  }

  const decision = body.status
  const reason = body.reason?.trim() || undefined

  if ((body.payload !== undefined || body.only !== undefined) && decision !== 'approved') {
    return Response.json({ ok: false, errors: ['Changes can only be saved by approving.'] }, { status: 400 })
  }
  const only = body.only
  if (only !== undefined && (!Array.isArray(only) || !only.every((k) => typeof k === 'string') || only.length === 0 || body.payload !== undefined)) {
    return Response.json({ ok: false, errors: ['Tick at least one line to update.'] }, { status: 400 })
  }

  if (body.part !== undefined) {
    if (typeof body.part !== 'string' || body.only !== undefined) {
      return Response.json({ ok: false, errors: ['A part is decided on its own.'] }, { status: 400 })
    }
    try {
      const decided = await decidePart(id, community.slug, body.part, decision, admin.email, body.payload)
      if (!decided.whole) {
        // Nobody is told yet: the change isn't decided until its last part is.
        const partial = Response.json({ ok: true, submission: decided.submission, partial: true })
        return decision === 'approved' ? partial : unchanged(partial)
      }
    } catch (err) {
      if (err instanceof ReviewEditError) return Response.json({ ok: false, errors: [err.message] }, { status: 400 })
      reportServerError('[admin/submissions/:id] PATCH part failed:', err)
      return Response.json({ ok: false, errors: ['Could not update submission.'] }, { status: 502 })
    }
  }

  let submission
  try {
    submission =
      decision === 'approved'
        ? await approveSubmission(id, community.slug, admin.email, body.payload, only as string[] | undefined)
        : await rejectSubmission(id, community.slug, admin.email, reason)
  } catch (err) {
    if (err instanceof ReviewEditError) {
      return Response.json({ ok: false, errors: [err.message] }, { status: 400 })
    }
    reportServerError('[admin/submissions/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update submission.'] }, { status: 502 })
  }

  // Best-effort — never fails the moderation action — but scheduled with
  // after() rather than left as a floating promise. Same reasoning as
  // /api/submissions: the handler returns below, and an abandoned send is at
  // the mercy of whether the invocation survives long enough to finish it.
  after(async () => {
    await Promise.all([
      // Some of it went on: not "it wasn't used".
      (decision === 'rejected' && (submission.payload as { someApproved?: boolean } | null)?.someApproved ? Promise.resolve() : sendDecisionEmail(submission, decision, reason)).catch((err) =>
        reportServerError('[admin/submissions/:id] Decision email failed:', err),
      ),
      sendReviewActionNotification(submission, decision, admin.email).catch((err) =>
        reportServerError('[admin/submissions/:id] Review-action notification failed:', err),
      ),
    ])
  })

  // A new eruv, approved: its status page and map read now, not at their
  // next turn (Fridays, for its status). Best-effort, as the emails are.
  if (decision === 'approved' && submission.target_type === 'eruv' && submission.operation === 'create') {
    const id = (submission.payload as { eruvId?: string }).eruvId
    if (id) after(() => readEruvNowById(community.slug, community.timezone, id).catch((err) => reportServerError('[admin/submissions/:id] Reading the new eruv failed:', err)))
  }

  // Notify category subscribers (see SubscribeSection.tsx / subscriberStore.ts)
  // — a new listing they picked, or one closing. Best-effort, scheduled with
  // after() same as the decision/review emails above; a lookup or send
  // failure here must never affect the approval that already happened.
  // 'update' is deliberately excluded — subscribers only opted into add/
  // closure, never edits.
  if (decision === 'approved' && (submission.operation === 'create' || submission.operation === 'delete')) {
    after(async () => {
      try {
        const resource = submission.target_id ? await getResourceRowById(submission.target_id, community.slug) : null
        if (!resource) return
        const category = await getCategoryById(community.slug, resource.category)
        if (!category) return

        const kind = submission.operation === 'create' ? 'add' : 'closure'
        const subscribers = await listSubscribersForCategory(community.slug, resource.category, kind)
        if (subscribers.length === 0) return

        if (kind === 'add') {
          const url = `${siteUrl()}${routes.listing(community.slug, resource.category, listingSlug(resource))}`
          await sendNewListingNotification(subscribers, { name: resource.name, url }, category.pluralLabel)
        } else {
          await sendClosureNotification(subscribers, { name: resource.name }, category.pluralLabel)
        }
      } catch (err) {
        reportServerError('[admin/submissions/:id] Subscriber notification failed:', err)
      }
    })
  }

  // Sync the listing against Google when there's something new to learn.
  //
  // That's exactly "the row has no googleSyncedAt": a newly created listing, a
  // listing whose edit repointed it at a different Google place (approval
  // clears the timestamp then — see withClearedSyncOnNewPlaceId), or one whose
  // earlier sync never landed. An ordinary edit to a note or a tag leaves the
  // timestamp in place and spends no Google call; tonight's run covers it, the
  // same as it always did.
  //
  // AFTER approveSubmission, deliberately, not inside it: approval is what
  // resolves `googleFields` from the submission's googleAutofill (see
  // withResolvedGoogleFields), and that list is what decides which fields the
  // sync is allowed to overwrite. Run first and it would write against the
  // wrong ownership set and could stomp what the submitter typed.
  //
  // Not removals. Approving one archives the listing, and syncing it then
  // would ask Google about a place that's just been taken down; a
  // CLOSED_PERMANENTLY answer would file a fresh removal submission and put it
  // straight back in the queue. loadSyncableListing filters on `approved` as
  // well, so this holds even if another caller forgets.
  //
  // After the response (Nov 20): it was awaited so the wrapper's invalidation
  // would publish the synced values too, and kept the admin waiting on Google
  // for every new listing. The listing goes on at once with what was
  // approved, and the sync's hours and phone follow it. Never allowed to fail
  // the approval, which has already happened: Google unreachable only means
  // tonight's run picks it up.
  // Not an eruv suggestion: an eruv has no Google place.
  if (decision === 'approved' && submission.operation !== 'delete' && submission.target_type !== 'eruv') {
    const listingId = submission.target_id ?? ''
    after(() => syncApprovedListing(community.slug, listingId))
  }

  // A new or moved listing's walks along the streets, now rather than
  // tonight (walkRouteJob.ts); after the response, so the admin isn't kept.
  if (decision === 'approved' && submission.target_type !== 'eruv') after(() => runWalkRoutesAfterChange(community.slug))
  return Response.json({ ok: true, submission })
})

/** The Google sync of a listing just approved, after the response. What it
 *  writes reaches the site by its own invalidation: the wrapper's ran before
 *  the response. Its listings' tag with 'days', not 'max' — the same tag and
 *  profile as the wrapper's would be dropped, as Next runs only the
 *  revalidations an after() callback adds that weren't already pending
 *  (revalidation-utils' diffRevalidationState). Either profile marks it
 *  stale at once and serves the old copy while the new one renders.
 *
 *  The page entries come round again with the save's second pass, 5s after
 *  the response (revalidateAfterInFlightRenders.ts), which catches a render
 *  in flight at this invalidation when Google answers within it, as it
 *  does; tonight's run settles one that doesn't. */
async function syncApprovedListing(community: string, listingId: string): Promise<void> {
  try {
    const row = await loadSyncableListing(listingId)
    if (!row || row.details.googleSyncedAt) return
    const result = await syncOneListing(row)
    if (result.outcome !== 'synced') return
    revalidateTag(TAGS.resources(community), 'days')
    // The cron digests these for a whole run; a sync that happens here
    // would otherwise discover a closure and tell nobody. A permanent one
    // still files its own submission from inside syncOneListing.
    if (result.statusChange) {
      await sendStatusChangeDigest([result.statusChange]).catch((err) =>
        reportServerError('[admin/submissions/:id] Status digest failed:', err),
      )
    }
  } catch (err) {
    reportServerError('[admin/submissions/:id] Post-approval sync failed:', err)
  }
}
