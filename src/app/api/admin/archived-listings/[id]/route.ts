import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { restoreResource, hardDeleteArchivedResource } from '@/lib/resourceStore'

// PATCH /api/admin/archived-listings/:id — restore an archived listing back
// to 'approved' (it reappears on the public site exactly as it was). Admin
// only.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/archived-listings/[id]'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    const resource = await restoreResource(id)
    if (!resource) {
      return Response.json({ ok: false, errors: ['Listing not found (or not archived).'] }, { status: 404 })
    }
    return Response.json({ ok: true, resource })
  } catch (err) {
    console.error('[admin/archived-listings/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not restore listing.'] }, { status: 502 })
  }
}

// DELETE /api/admin/archived-listings/:id — permanently deletes an archived
// listing. Irreversible. Admin only.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/admin/archived-listings/[id]'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    const found = await hardDeleteArchivedResource(id)
    if (!found) {
      return Response.json({ ok: false, errors: ['Listing not found (or not archived).'] }, { status: 404 })
    }
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/archived-listings/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not permanently delete listing.'] }, { status: 502 })
  }
}
