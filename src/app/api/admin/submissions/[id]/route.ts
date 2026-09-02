import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { NextRequest } from 'next/server'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { approveSubmission, rejectSubmission } from '@/lib/submissionStore'
import { sendDecisionEmail } from '@/lib/confirmationEmail'
import { sendReviewActionNotification, sendStatusChangeDigest } from '@/lib/email'
import { loadSyncableListing, syncOneListing } from '@/lib/syncListing'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// PATCH /api/admin/submissions/:id
// body: { status: 'approved' | 'rejected', reason?: string }
// Approving APPLIES the change to the live tables. Admin only.
// A best-effort decision email is sent to the submitter if they provided one.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/submissions/[id]'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) {
    return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  }

  const { id } = await ctx.params

  let body: { status?: string; reason?: string }
  try {
    body = (await request.json()) as { status?: string; reason?: string }
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

  let submission
  try {
    submission =
      decision === 'approved'
        ? await approveSubmission(id, community.slug, admin.email)
        : await rejectSubmission(id, community.slug, admin.email)
  } catch (err) {
    console.error('[admin/submissions/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update submission.'] }, { status: 502 })
  }

  // Best-effort — never fails the moderation action
  sendDecisionEmail(submission, decision, reason).catch((err) =>
    console.error('[admin/submissions/:id] Decision email failed:', err),
  )
  sendReviewActionNotification(submission, decision, admin.email).catch((err) =>
    console.error('[admin/submissions/:id] Review-action notification failed:', err),
  )

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
  // Awaited rather than fired off, so the revalidate below publishes the
  // synced values too — but never allowed to fail the approval, which has
  // already happened by this point and must not be reported as failed because
  // Google was unreachable. It's just late instead: tonight's run picks it up.
  if (decision === 'approved' && submission.operation !== 'delete') {
    try {
      const row = await loadSyncableListing(submission.target_id ?? '')
      if (row && !row.details.googleSyncedAt) {
        const result = await syncOneListing(row)
        // The cron digests these for a whole run; a sync that happens here
        // would otherwise discover a closure and tell nobody. A permanent one
        // still files its own submission from inside syncOneListing.
        if (result.outcome === 'synced' && result.statusChange) {
          await sendStatusChangeDigest([result.statusChange]).catch((err) =>
            console.error('[admin/submissions/:id] Status digest failed:', err),
          )
        }
      }
    } catch (err) {
      console.error('[admin/submissions/:id] Post-approval sync failed:', err)
    }
  }

  // The public site caches this content; drop it so the edit shows up.
  await revalidatePublicContent()
  return Response.json({ ok: true, submission })
}
