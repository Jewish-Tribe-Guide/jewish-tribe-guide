import { getAdminUser } from '@/lib/adminAuth'
import { getSyncCoverage } from '@/lib/syncCoverage'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/admin/sync-coverage — the Metrics tab's Google sync coverage
// report: listings never synced (no place id), listings with fields the
// sync is deliberately not touching (hand-edited), and listings whose sync
// is actively failing. Admin only.
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const coverage = await getSyncCoverage(community.slug)
    return Response.json({ ok: true, coverage })
  } catch (err) {
    console.error('[admin/sync-coverage] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load sync coverage.'] }, { status: 502 })
  }
}
