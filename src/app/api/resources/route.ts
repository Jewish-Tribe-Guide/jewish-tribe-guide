import { listApprovedResources } from '@/lib/resourceStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/resources?category=grocery
// Returns every approved listing for a category. Distance to the selected
// hospital is computed on the client. (Writes go through POST /api/submissions.)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') ?? undefined

  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
      const resources = await listApprovedResources(community.slug, { category })
    return Response.json({ ok: true, resources })
  } catch (err) {
    console.error('[resources] GET failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not load resources. Please try again.'] },
      { status: 502 },
    )
  }
}
