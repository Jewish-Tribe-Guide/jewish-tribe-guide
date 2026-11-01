import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listEruvMapSources } from '@/lib/eruvStore'
import { savedMap } from '@/lib/eruvLines'
import { enforceRateLimit } from '@/lib/rateLimit'

// GET /api/eruv/maps — each eruv's saved map, shown as the eruv draws it,
// without what an admin left out. Nothing is read here: the nightly job
// reads them, and an admin's save or Read it now (the user, Nov 1), so
// visitors never set off a read (eruvLines.ts). Kept at the CDN for an hour,
// so a new copy shows within the hour; stale for five minutes more at most,
// since a browser honours that too and a day of it showed an admin's change
// a visit late.

const CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=300'

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'eruv-maps', { limit: 30, windowSec: 60 })
  if (limited) return limited
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const sources = await listEruvMapSources(community.slug)
    const maps = sources.map((source) => ({ id: source.id, map: savedMap(source, source.rawLine) }))
    return Response.json({ ok: true, maps: maps.filter((m) => m.map) }, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (err) {
    console.error('[eruv/maps] GET failed:', err)
    return Response.json({ ok: false, maps: [] }, { status: 502 })
  }
}
