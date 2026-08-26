import { getAdminUser } from '@/lib/adminAuth'
import { listPagesUncached } from '@/lib/pagesStore'

// GET /api/admin/pages — every static page (About, Privacy), for the admin
// Pages tab. Admin only.
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const pages = await listPagesUncached()
    return Response.json({ ok: true, pages })
  } catch (err) {
    console.error('[admin/pages] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load pages.'] }, { status: 502 })
  }
}
