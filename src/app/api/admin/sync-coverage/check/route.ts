import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { checkListingAgainstGoogle } from '@/lib/syncCoverage'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// POST /api/admin/sync-coverage/check — on-demand only (never run in bulk):
// fetches one listing's current Google Places data and compares it against
// every field the sync is declining to write, so an admin can see whether a
// hand-edited field has drifted, and what Google shows even when it's
// nothing at all. Costs exactly one Google Places API call, spent only when
// an admin actually clicks in on this specific listing. Admin only.
export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: { id?: string }
  try {
    body = (await request.json()) as { id?: string }
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  if (!body.id) return Response.json({ ok: false, errors: ['id is required.'] }, { status: 400 })

  try {
    const fields = await checkListingAgainstGoogle(body.id, community.slug)
    return Response.json({ ok: true, fields })
  } catch (err) {
    console.error('[admin/sync-coverage/check] POST failed:', err)
    const message = err instanceof Error ? err.message : 'Could not check this listing.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}
