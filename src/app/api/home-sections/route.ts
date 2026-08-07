import { listHomeSections } from '@/lib/homeSectionStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/home-sections — the home screen's section grouping (title + which
// cards belong to each, in order). Public read.
export async function GET(request: Request) {
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const sections = await listHomeSections(community.slug)
    return Response.json({ ok: true, sections })
  } catch (err) {
    console.error('[home-sections] GET failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not load home sections. Please try again.'] },
      { status: 502 },
    )
  }
}
