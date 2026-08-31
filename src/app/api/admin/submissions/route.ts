import { getAdminUser } from '@/lib/adminAuth'
import { listSubmissionsByStatus } from '@/lib/submissionStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import type { SubmissionStatus } from '@/types'

const VALID_STATUSES: SubmissionStatus[] = ['pending', 'approved', 'rejected']

// GET /api/admin/submissions?status=pending|approved|rejected — changes in
// that status, most-recently-acted-on first. Defaults to 'pending' (the
// moderation queue's own call never passes one). Admin only.
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) {
    return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  }

  const requested = new URL(request.url).searchParams.get('status') ?? 'pending'
  if (!VALID_STATUSES.includes(requested as SubmissionStatus)) {
    return Response.json(
      { ok: false, errors: ["status must be 'pending', 'approved', or 'rejected'."] },
      { status: 400 },
    )
  }

  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const submissions = await listSubmissionsByStatus(community.slug, requested as SubmissionStatus)
    return Response.json({ ok: true, submissions })
  } catch (err) {
    console.error('[admin/submissions] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load submissions.'] }, { status: 502 })
  }
}
