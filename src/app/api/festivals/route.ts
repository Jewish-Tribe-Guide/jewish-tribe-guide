import { community } from '@/community.config'
import { enforceRateLimit } from '@/lib/rateLimit'
import { fetchFestivals } from '@/lib/festivals'

// GET /api/festivals — the festivals from now to a year ahead (step 4):
// "Sukkos 5787, Sep 26 – Oct 4", each day named, for starting a shul's
// special schedule without typing dates. One Hebcal request, shared at the
// CDN by everyone: the answer changes only when a festival ends.

const CACHE_CONTROL = 'public, max-age=0, s-maxage=21600'

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'festivals', { limit: 30, windowSec: 60 })
  if (limited) return limited
  try {
    const festivals = await fetchFestivals(community.timezone)
    return Response.json({ ok: true, festivals }, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (err) {
    console.error('[festivals] fetch failed:', err)
    return Response.json({ ok: false, error: 'Could not load the calendar right now.' }, { status: 502 })
  }
}
