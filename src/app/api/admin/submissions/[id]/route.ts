import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { approveSubmission, rejectSubmission } from '@/lib/submissionStore'
import { sendDecisionEmail } from '@/lib/confirmationEmail'

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

  // The public site caches this content; drop it so the edit shows up.
  await revalidatePublicContent()
  return Response.json({ ok: true, submission })
}
