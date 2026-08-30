import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { approveSubmission, rejectSubmission } from '@/lib/submissionStore'
import { sendDecisionEmail } from '@/lib/confirmationEmail'
import { loadSyncableListing, syncOneListing } from '@/lib/syncListing'

// PATCH /api/admin/submissions/:id
// body: { status: 'approved' | 'rejected', reason?: string }
// Approving APPLIES the change to the live tables. Admin only.
// A best-effort decision email is sent to the submitter if they provided one.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/submissions/[id]'>) {
  const admin = await getAdminUser(request)
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
    submission = decision === 'approved' ? await approveSubmission(id) : await rejectSubmission(id)
  } catch (err) {
    console.error('[admin/submissions/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update submission.'] }, { status: 502 })
  }

  // Best-effort — never fails the moderation action
  sendDecisionEmail(submission, decision, reason).catch((err) =>
    console.error('[admin/submissions/:id] Decision email failed:', err),
  )

  // Sync the listing against Google the moment it goes live, rather than
  // leaving it for tonight's cron.
  //
  // Approval is the first moment the data is public, and until now a listing
  // with a place id could sit up to a day never having synced at all — a state
  // that fell through every section of the sync-coverage report, that the
  // business-status override couldn't reach, and that showed a shop Google had
  // marked closed as open in the meantime.
  //
  // AFTER approveSubmission, deliberately, not inside it: approval is what
  // resolves `googleFields` from the submission's googleAutofill (see
  // withResolvedGoogleFields), and that list is what decides which fields the
  // sync is allowed to overwrite. Run first and it would write against the
  // wrong ownership set and could stomp what the submitter typed.
  //
  // Awaited rather than fired off, so the revalidate below publishes the
  // synced values too — but never allowed to fail the approval, which has
  // already happened by this point and must not be reported as failed because
  // Google was unreachable. It's just late instead: tonight's run picks it up.
  if (decision === 'approved') {
    try {
      const row = await loadSyncableListing(submission.target_id ?? '')
      if (row) await syncOneListing(row)
    } catch (err) {
      console.error('[admin/submissions/:id] Post-approval sync failed:', err)
    }
  }

  // The public site caches this content; drop it so the edit shows up.
  await revalidatePublicContent()
  return Response.json({ ok: true, submission })
}
