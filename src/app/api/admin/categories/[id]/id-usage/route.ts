import type { NextRequest } from 'next/server'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { countCategoryListings } from '@/lib/categoryStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/admin/categories/:id/id-usage — how many listings currently sit
// under this category id. The category editor calls this when the admin
// changes the URL-slug field, so it can confirm the real scope of the
// migration (see renameCategoryId) before cascading it for real. Read-only;
// admin only.
export async function GET(request: NextRequest, ctx: RouteContext<'/api/admin/categories/[id]/id-usage'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params

  try {
    const count = await countCategoryListings(community.slug, id)
    return Response.json({ ok: true, count })
  } catch (err) {
    console.error('[admin/categories/:id/id-usage] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not check existing listings.'] }, { status: 502 })
  }
}
