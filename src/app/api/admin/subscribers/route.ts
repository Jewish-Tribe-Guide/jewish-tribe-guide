import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { listSubscribers } from '@/lib/subscriberStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/admin/subscribers — every category-subscription row for this
// community, newest first, for the admin Subscribers tab. Admin only: the
// `subscriber` table has no public SELECT policy at all (see that
// migration's own doc) — personal data, not public content — so this is the
// only read path for it besides a subscriber's own token-scoped manage link.
export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const subscribers = await listSubscribers(community.slug)
    return Response.json({ ok: true, subscribers })
  } catch (err) {
    console.error('[admin/subscribers] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load subscribers.'] }, { status: 502 })
  }
}
