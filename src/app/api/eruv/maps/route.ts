import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listEruvMapSources, saveLineRead } from '@/lib/eruvStore'
import { readEruvMap } from '@/lib/eruvLines'
import { enforceRateLimit } from '@/lib/rateLimit'

// GET /api/eruv/maps — each eruv's own map, read from its file now and
// shown as the eruv draws it, without what an admin left out (eruvLines.ts).
// Kept at the CDN for an hour: an eruv's change shows within the hour, and
// the maps are read about once an hour however many people look. Stale for
// five minutes more at most while it's read again: a browser honours that
// too, and a day of it showed an admin's change a visit late. An eruv
// whose site can't be reached shows the last good read.

export const maxDuration = 30
const CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=300'

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'eruv-maps', { limit: 30, windowSec: 60 })
  if (limited) return limited
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const sources = await listEruvMapSources(community.slug)
    const now = new Date()
    const maps = await Promise.all(
      sources.map(async (source) => {
        const read = await readEruvMap(source, now)
        if (read.save) await saveLineRead(community.slug, source.id, read.save).catch((err) => console.error('[eruv/maps] save failed:', err))
        return { id: source.id, map: read.map }
      }),
    )
    return Response.json({ ok: true, maps: maps.filter((m) => m.map) }, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (err) {
    console.error('[eruv/maps] GET failed:', err)
    return Response.json({ ok: false, maps: [] }, { status: 502 })
  }
}
