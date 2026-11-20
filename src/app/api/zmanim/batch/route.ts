import { reportServerError } from '@/lib/serverError'
import { getZmanimData } from '@/lib/zmanim'
import { parseZmanimBatchRequest, zmanimDateCheck } from '@/lib/zmanimRequest'
import { enforceRateLimit } from '@/lib/rateLimit'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// Same cache policy as the single-location route: the answer depends only on
// the (rounded) locations, the timezone and today's date.
const CACHE_CONTROL = 'public, max-age=0, s-maxage=600'

// Many locations per request, so a lower per-minute count than the single
// route's 120 keeps the worst case (25 points × four Hebcal calls each) in
// the same ballpark.
export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'zmanim-batch', { limit: 30, windowSec: 60 })
  if (limited) return limited

  const params = new URL(request.url).searchParams
  // No `tzid`: the requested community's clock, as /api/zmanim.
  const parsed = parseZmanimBatchRequest(params, (await resolveCommunity(communitySlugFromRequest(request))).timezone)
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 })
  }
  const dated = zmanimDateCheck(params, parsed.timezone)
  if (dated === 'invalid') return Response.json({ ok: false, error: 'Invalid date.' }, { status: 400 })
  const cacheControl = dated === 'cache' ? CACHE_CONTROL : 'no-store'

  // One failing spot must not sink the rest, so each result carries its own ok.
  const settled = await Promise.allSettled(
    parsed.points.map((p) => getZmanimData({ latitude: p.lat, longitude: p.lng, timezone: parsed.timezone })),
  )
  const results = settled.map((r, i) => {
    const { lat, lng } = parsed.points[i]
    if (r.status === 'fulfilled') return { lat, lng, ok: true as const, data: r.value }
    reportServerError('[zmanim/batch] fetch failed:', r.reason)
    return { lat, lng, ok: false as const }
  })

  // Nothing succeeded: don't let the CDN hold on to an all-failure answer.
  if (results.every((r) => !r.ok)) {
    return Response.json({ ok: false, error: 'Could not load zmanim right now.' }, { status: 502 })
  }
  return Response.json({ ok: true, results }, { headers: { 'Cache-Control': cacheControl } })
}
