import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listEruvim, saveStatusRead } from '@/lib/eruvStore'
import { candlesToday, refreshStale } from '@/lib/eruvReader'
import { enforceRateLimit } from '@/lib/rateLimit'

// GET /api/eruv — the community's eruvim and each one's status, read again
// first from any eruv's page whose last read is past its window (15 minutes
// on Friday afternoon, 3 hours otherwise: eruvReader.ts). `available` is
// false without migration 074, and the page shows its old list.
//
// Shared at the CDN for a minute: the window is far longer, and a busy
// Friday shouldn't send every visitor through the reads.

export const maxDuration = 30
const CACHE_CONTROL = 'public, max-age=0, s-maxage=60'

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'eruv', { limit: 60, windowSec: 60 })
  if (limited) return limited
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const { eruvim, available } = await listEruvim(community.slug)
    if (!available) return Response.json({ ok: true, available: false, eruvim: [] })
    const now = new Date()
    const place = { latitude: community.mapCenter.lat, longitude: community.mapCenter.lng, timezone: community.timezone }
    const candles = await candlesToday(place, now)
    const read = await refreshStale(eruvim, { now, timezone: community.timezone, candles, save: (id, r) => saveStatusRead(community.slug, id, r) })
    return Response.json({ ok: true, available: true, timezone: community.timezone, candles, eruvim: read }, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (err) {
    console.error('[eruv] GET failed:', err)
    return Response.json({ ok: false, eruvim: [] }, { status: 502 })
  }
}
