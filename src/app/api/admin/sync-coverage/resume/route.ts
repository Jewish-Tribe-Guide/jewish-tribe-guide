import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { resumeSyncField } from '@/lib/syncCoverage'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import type { OwnableSyncField } from '@/lib/googlePlaces'

// POST /api/admin/sync-coverage/resume — hands one hand-edited field back to
// the Google sync, after re-verifying live that it still actually matches
// (see resumeSyncField's own comment for why it doesn't just trust whatever
// the admin's last "Check against Google" click showed). Admin only.
export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: { id?: string; field?: string }
  try {
    body = (await request.json()) as { id?: string; field?: string }
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  if (!body.id) return Response.json({ ok: false, errors: ['id is required.'] }, { status: 400 })
  if (!body.field) return Response.json({ ok: false, errors: ['field is required.'] }, { status: 400 })

  try {
    const result = await resumeSyncField(body.id, body.field as OwnableSyncField, community.slug)
    return Response.json({ ok: true, result })
  } catch (err) {
    console.error('[admin/sync-coverage/resume] POST failed:', err)
    const message = err instanceof Error ? err.message : 'Could not resume syncing this field.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}
