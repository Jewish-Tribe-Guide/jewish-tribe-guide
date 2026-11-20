import { reportServerError } from '@/lib/serverError'
import { getZmanimData } from '@/lib/zmanim'
import { parseZmanimRequest, zmanimDateCheck } from '@/lib/zmanimRequest'
import { enforceRateLimit } from '@/lib/rateLimit'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// Cacheable at the CDN: the answer depends only on the (rounded) location, the
// timezone and today's date, so every visitor near the same spot can share one.
// Short, because "today" is part of the answer and rolls over at local midnight.
const CACHE_CONTROL = 'public, max-age=0, s-maxage=600'

export async function GET(request: Request) {
  // Unauthenticated, and a cache miss costs four Hebcal requests. The limit is
  // generous because one page load can legitimately ask once per distinct
  // synagogue location (useZmanAnchors), but it is a limit.
  const limited = await enforceRateLimit(request, 'zmanim', { limit: 120, windowSec: 60 })
  if (limited) return limited

  const params = new URL(request.url).searchParams
  // No `tzid`: the requested community's clock (`?community=`), else the
  // default community's, never the deployment config's (Nov 18, item 33).
  const parsed = parseZmanimRequest(params, (await resolveCommunity(communitySlugFromRequest(request))).timezone)
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 })
  }
  const dated = zmanimDateCheck(params, parsed.timezone)
  if (dated === 'invalid') return Response.json({ ok: false, error: 'Invalid date.' }, { status: 400 })
  const cacheControl = dated === 'cache' ? CACHE_CONTROL : 'no-store'

  try {
    const data = await getZmanimData({ latitude: parsed.latitude, longitude: parsed.longitude, timezone: parsed.timezone })
    return Response.json({ ok: true, data }, { headers: { 'Cache-Control': cacheControl } })
  } catch (err) {
    reportServerError('[zmanim] fetch failed:', err)
    return Response.json({ ok: false, error: 'Could not load zmanim right now.' }, { status: 502 })
  }
}
