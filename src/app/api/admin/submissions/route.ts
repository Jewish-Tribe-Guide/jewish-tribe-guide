import { getAdminUser } from '@/lib/adminAuth'
import { listPendingSubmissions } from '@/lib/submissionStore'

// GET /api/admin/submissions — pending changes awaiting review. Admin only.
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) {
    return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  }

  try {
    const submissions = await listPendingSubmissions()
    return Response.json({ ok: true, submissions })
  } catch (err) {
    console.error('[admin/submissions] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load submissions.'] }, { status: 502 })
  }
}
