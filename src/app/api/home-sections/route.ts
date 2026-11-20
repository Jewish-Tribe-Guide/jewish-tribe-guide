import { listHomeSections } from '@/lib/homeSectionStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/home-sections — the home screen's section grouping (title + which
// cards belong to each, in order). Public read.
//
// No screen fetches this: every page gets it from the [community] layout
// (loadCommunityContent). It stays for the e2e suites, which read it to know
// what the site should show instead of hardcoding it, and warm the cache
// through it (Nov 18, review item 43). Read by e2e/helpers.ts,
// e2e/warmup.setup.ts.
export async function GET(request: Request) {
  const slug = communitySlugFromRequest(request)
  try {
    const community = await resolveCommunity(slug)
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
