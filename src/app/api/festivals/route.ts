import { reportServerError } from '@/lib/serverError'
import { enforceRateLimit } from '@/lib/rateLimit'
import { fetchFestivals } from '@/lib/festivals'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/festivals — the festivals from now to a year ahead (step 4):
// "Sukkos 5787, Sep 26 – Oct 4", each day named, for starting a shul's
// special schedule without typing dates. One Hebcal request, shared at the
// CDN by everyone: the answer changes only when a festival ends.
//
// `?community=`: whose calendar day a festival starts and ends on, its own
// clock (Nov 18, item 33). The CDN keeps one answer per community.

const CACHE_CONTROL = 'public, max-age=0, s-maxage=21600'

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'festivals', { limit: 30, windowSec: 60 })
  if (limited) return limited
  try {
    const { timezone } = await resolveCommunity(communitySlugFromRequest(request))
    const festivals = await fetchFestivals(timezone)
    return Response.json({ ok: true, festivals }, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (err) {
    reportServerError('[festivals] fetch failed:', err)
    return Response.json({ ok: false, error: 'Could not load the calendar right now.' }, { status: 502 })
  }
}
