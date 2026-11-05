import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { listListingPagesEverywhere } from '@/lib/categoryStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/admin/ready-made — every community's listing pages on the site,
// for Category pages' ready-made lists (What kind of places?, + Add a
// field). Admin of any one community only: a page's fields are the same
// thing the public site shows, so nothing here is another community's
// private data.
export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const pages = await listListingPagesEverywhere()
    return Response.json({ ok: true, pages })
  } catch (err) {
    console.error('[admin/ready-made] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the ready-made pages.'] }, { status: 502 })
  }
}
