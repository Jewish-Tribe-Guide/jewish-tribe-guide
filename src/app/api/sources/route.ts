import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listWatches } from '@/lib/watchStore'
import { enforceRateLimit } from '@/lib/rateLimit'

// GET /api/sources — the outside lists the guide reads on its own (a
// kashrus agency's list: the Keystone K's, Oct 5), each with when it was
// last read properly, for the phone home's "How this guide stays right"
// sheet. It names one only once it has actually run, so a watch that was
// set up and never worked claims nothing. Just the name and the time: no
// addresses, errors or who set it up, which are the admin's.
//
// Shared at the CDN for ten minutes: the reads are daily.

const CACHE_CONTROL = 'public, max-age=0, s-maxage=600'

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'sources', { limit: 60, windowSec: 60 })
  if (limited) return limited
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const { watches, available } = await listWatches(community.slug)
    const lists = available
      ? watches.filter((w) => w.active && w.kind === 'keystone_list' && w.lastOkAt).map((w) => ({ label: w.label, okAt: w.lastOkAt }))
      : []
    return Response.json({ ok: true, lists }, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (err) {
    console.error('[sources] GET failed:', err)
    return Response.json({ ok: false, lists: [] }, { status: 502 })
  }
}
