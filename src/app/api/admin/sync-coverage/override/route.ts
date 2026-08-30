import { getAdminUser } from '@/lib/adminAuth'
import { setBusinessStatusOverride } from '@/lib/syncCoverage'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { BusinessStatus } from '@/lib/hours'

const VALID: BusinessStatus[] = ['OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY']

// POST /api/admin/sync-coverage/override — corrects what the public sees about
// whether a business is trading, when Google has it wrong and the daily sync
// keeps rewriting the value (see effectiveBusinessStatus). `status: null`
// clears the override and hands the listing back to Google. Admin only.
export async function POST(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: { id?: string; status?: string | null }
  try {
    body = (await request.json()) as { id?: string; status?: string | null }
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  if (!body.id) return Response.json({ ok: false, errors: ['id is required.'] }, { status: 400 })

  const status = body.status ?? null
  if (status !== null && !VALID.includes(status as BusinessStatus)) {
    return Response.json({ ok: false, errors: ['Unknown status.'] }, { status: 400 })
  }

  try {
    await setBusinessStatusOverride(body.id, status as BusinessStatus | null)
    // This changes what every visitor sees on a cached page, so it has to
    // invalidate the same way an admin save does — otherwise the correction
    // sits invisible behind cacheLife for up to a day, which looks exactly
    // like the override having silently failed.
    await revalidatePublicContent()
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/sync-coverage/override] POST failed:', err)
    const message = err instanceof Error ? err.message : 'Could not save the override.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}
