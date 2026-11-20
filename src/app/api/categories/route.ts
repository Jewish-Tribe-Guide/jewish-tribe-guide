import { reportServerError } from '@/lib/serverError'
import { listCategories } from '@/lib/categoryStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/categories — all categories (for the directory index, forms, and the
// generic card renderer). Public read.
export async function GET(request: Request) {
  const slug = communitySlugFromRequest(request)
  try {
    const community = await resolveCommunity(slug)
    const categories = await listCategories(community.slug)
    return Response.json({ ok: true, categories })
  } catch (err) {
    reportServerError('[categories] GET failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not load categories. Please try again.'] },
      { status: 502 },
    )
  }
}
