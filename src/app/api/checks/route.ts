import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { listCategories } from '@/lib/categoryStore'
import { listWatches } from '@/lib/watchStore'
import { checksRun } from '@/lib/checksRun'
import { enforceRateLimit } from '@/lib/rateLimit'

// GET /api/checks — each kind of check the guide runs on its own (minyan
// times, mikvah hours, kosher certifications, menus, hospitals, eruv
// status), with when one of its pages was last read properly, for the
// phone home's "How this guide stays right" sheet (checksRun.ts). Just the
// kind and the time: no addresses, errors or names, which are the admin's.
//
// Shared at the CDN for ten minutes: the reads are daily.

const CACHE_CONTROL = 'public, max-age=0, s-maxage=600'

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'checks', { limit: 60, windowSec: 60 })
  if (limited) return limited
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const [{ watches, available }, listings, categories] = await Promise.all([
      listWatches(community.slug),
      listApprovedResources(community.slug),
      listCategories(community.slug),
    ])
    const checks = available ? checksRun(watches, listings, categories) : []
    return Response.json({ ok: true, checks }, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (err) {
    console.error('[checks] GET failed:', err)
    return Response.json({ ok: false, checks: [] }, { status: 502 })
  }
}
