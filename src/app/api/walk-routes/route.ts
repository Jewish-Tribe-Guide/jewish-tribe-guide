import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { enforceRateLimit } from '@/lib/rateLimit'
import { walkRoutesFrom } from '@/lib/walkRouteStore'

// GET /api/walk-routes?from=<listing id> — the walks along the streets from
// one listing to the places it lists "Within a walk" (walkRoutes.ts), by the
// place's id. The page uses each only while neither end has moved.
//
// Shared at the CDN for an hour: a walk is worked out at most nightly.

const CACHE_CONTROL = 'public, max-age=0, s-maxage=3600'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'walk-routes', { limit: 120, windowSec: 60 })
  if (limited) return limited
  const from = new URL(request.url).searchParams.get('from') ?? ''
  if (!UUID.test(from)) return Response.json({ ok: false, routes: {} }, { status: 400 })
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const routes = await walkRoutesFrom(community.slug, from)
    return Response.json({ ok: true, routes }, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (err) {
    console.error('[walk-routes] GET failed:', err)
    return Response.json({ ok: false, routes: {} }, { status: 502 })
  }
}
