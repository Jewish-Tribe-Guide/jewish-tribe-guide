import { listHospitals } from '@/lib/hospitalStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/hospitals — the hospital list, with each hospital's "Jewish life"
// info. Empty for a non-hospital community. Public read.
//
// No screen fetches this: every page gets it from the [community] layout
// (loadCommunityContent). It stays for the e2e suites, which read it to know
// what the site should show instead of hardcoding it, and warm the cache
// through it (Nov 18, review item 43). Read by e2e/warmup.setup.ts.
export async function GET(request: Request) {
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const hospitals = await listHospitals(community.slug)
    return Response.json({ ok: true, hospitals })
  } catch (err) {
    console.error('[hospitals] GET failed:', err)
    return Response.json({ ok: false, hospitals: [] }, { status: 502 })
  }
}
