import { adminRead } from '@/lib/adminRoute'
import { listListingPagesEverywhere } from '@/lib/categoryStore'

// GET /api/admin/ready-made — every community's listing pages on the site,
// for Category pages' ready-made lists (What kind of places?, + Add a
// field). Admin of any one community only: a page's fields are the same
// thing the public site shows, so nothing here is another community's
// private data.
export const GET = adminRead(async () => {
  try {
    const pages = await listListingPagesEverywhere()
    return Response.json({ ok: true, pages })
  } catch (err) {
    console.error('[admin/ready-made] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the ready-made pages.'] }, { status: 502 })
  }
})
