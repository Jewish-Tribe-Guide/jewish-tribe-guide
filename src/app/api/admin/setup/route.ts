import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { getSetupState } from '@/lib/setupStore'

// GET /api/admin/setup — what To do's "Set up your guide" ticks off (see
// setup.ts): a logo, a second admin, a category with places, the home
// page's words and a kosher list watched. Admin only.
export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    return Response.json({ ok: true, setup: await getSetupState(community) })
  } catch (err) {
    console.error('[admin/setup] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the setup.'] }, { status: 502 })
  }
}
