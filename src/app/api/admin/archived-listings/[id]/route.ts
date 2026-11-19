import { runWalkRoutesAfterChange } from '@/lib/walkRouteJob'
import { after, type NextRequest } from 'next/server'
import { adminWrite } from '@/lib/adminRoute'
import { restoreResource, hardDeleteArchivedResource } from '@/lib/resourceStore'

// PATCH /api/admin/archived-listings/:id — restore an archived listing back
// to 'approved' (it reappears on the public site exactly as it was). Admin
// only.
export const PATCH = adminWrite(async (_request: NextRequest, { community }, ctx: RouteContext<'/api/admin/archived-listings/[id]'>) => {
  const { id } = await ctx.params
  try {
    const resource = await restoreResource(id, community.slug)
    if (!resource) {
      return Response.json({ ok: false, errors: ['Listing not found (or not archived).'] }, { status: 404 })
    }
    // Its walks along the streets now, not tonight (walkRouteJob.ts).
    after(() => runWalkRoutesAfterChange(community.slug))
    return Response.json({ ok: true, resource })
  } catch (err) {
    console.error('[admin/archived-listings/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not restore listing.'] }, { status: 502 })
  }
})

// DELETE /api/admin/archived-listings/:id — permanently deletes an archived
// listing. Irreversible. Admin only.
export const DELETE = adminWrite(async (_request: NextRequest, { community }, ctx: RouteContext<'/api/admin/archived-listings/[id]'>) => {
  const { id } = await ctx.params
  try {
    const found = await hardDeleteArchivedResource(id, community.slug)
    if (!found) {
      return Response.json({ ok: false, errors: ['Listing not found (or not archived).'] }, { status: 404 })
    }
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/archived-listings/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not permanently delete listing.'] }, { status: 502 })
  }
})
