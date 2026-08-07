import { listCategories } from '@/lib/categoryStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/categories — all categories (for the directory index, forms, and the
// generic card renderer). Public read.
export async function GET(request: Request) {
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const categories = await listCategories(community.slug)
    return Response.json({ ok: true, categories })
  } catch (err) {
    console.error('[categories] GET failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not load categories. Please try again.'] },
      { status: 502 },
    )
  }
}
