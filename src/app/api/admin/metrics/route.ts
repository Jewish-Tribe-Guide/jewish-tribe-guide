import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { getSubmissionFunnelStats } from '@/lib/submissionStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/admin/metrics — the Metrics tab's data: how many submissions are
// pending, the approve/reject split, and how long an approved one sits in
// the queue before a human acts on it. Admin only.
export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const stats = await getSubmissionFunnelStats(community.slug)
    return Response.json({ ok: true, stats })
  } catch (err) {
    console.error('[admin/metrics] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load metrics.'] }, { status: 502 })
  }
}
