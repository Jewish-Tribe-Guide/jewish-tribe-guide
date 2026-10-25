import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listJobRuns } from '@/lib/jobRunStore'
import { listWatches } from '@/lib/watchStore'
import { loadGoogleJob } from '@/lib/googleJobRun'
import { nightKinds } from '@/lib/nightKinds'

// GET /api/admin/watches/runs — the Watches tab's Last night (Oct 25): a
//     line per kind of source, its run's time, what was read, what wasn't
//     and its last 14 nights (nightKinds.ts). The jobs run for the whole
//     site; the counts and misses are this community's. `available` is
//     false before migration 086.

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  try {
    const now = Date.now()
    const [{ available, runs }, { watches }, google] = await Promise.all([listJobRuns(), listWatches(community.slug), loadGoogleJob(community.slug, now)])
    return Response.json({ ok: true, available, kinds: nightKinds(community.slug, runs, watches, google, now) })
  } catch (err) {
    console.error('[admin/watches/runs] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the nightly runs.'] }, { status: 502 })
  }
}
