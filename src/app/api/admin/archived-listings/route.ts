import { getAdminUser } from '@/lib/adminAuth'
import { listArchivedResources } from '@/lib/resourceStore'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { getDefaultCommunity } from '@/lib/communityStore'

// GET /api/admin/archived-listings — every soft-deleted listing (an approved
// removal report leaves the row as status='archived' rather than dropping
// it — see submissionStore.ts), enriched with its category's label so the
// admin cleanup view doesn't have to show bare category ids. Admin only.
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const community = await getDefaultCommunity()
    const [listings, categories] = await Promise.all([
      listArchivedResources(),
      listCategoriesUncached(community.slug),
    ])
    const labelById = new Map(categories.map((c) => [c.id, c.pluralLabel]))
    const enriched = listings.map((l) => ({ ...l, categoryLabel: labelById.get(l.category) ?? l.category }))
    return Response.json({ ok: true, listings: enriched })
  } catch (err) {
    console.error('[admin/archived-listings] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load archived listings.'] }, { status: 502 })
  }
}
