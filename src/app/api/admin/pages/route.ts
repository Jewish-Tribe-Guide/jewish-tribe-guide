import { siteAdminRead } from '@/lib/adminRoute'
import { listPagesUncached } from '@/lib/pagesStore'

// GET /api/admin/pages — every static page (About, Privacy), for the admin
// Pages tab. Admin only.
export const GET = siteAdminRead(async () => {
  try {
    const pages = await listPagesUncached()
    return Response.json({ ok: true, pages })
  } catch (err) {
    console.error('[admin/pages] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load pages.'] }, { status: 502 })
  }
})
