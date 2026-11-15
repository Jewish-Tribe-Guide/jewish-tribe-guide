import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listChangeLog } from '@/lib/changesStore'
import { whatChanged } from '@/lib/whatChanged'
import { latestChangeByListing } from '@/lib/youChanges'

// GET /api/changes — when each listing last changed, for the blue dot on
// You (board PhoneYouDot, the user, Nov 15). The tab bar and the header sit
// outside the pages that load the change log, so they ask for this: the same
// cached log What changed and You read, cut down to a time per listing.
// Public read; it says nothing the listings themselves don't.
export async function GET(request: Request) {
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const rows = await listChangeLog(community.slug)
    return Response.json({ ok: true, latest: latestChangeByListing(whatChanged(rows, community.timezone)) })
  } catch (err) {
    console.error('[changes] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load what changed.'] }, { status: 502 })
  }
}
