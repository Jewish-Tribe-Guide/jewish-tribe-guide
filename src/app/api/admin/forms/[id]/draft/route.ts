import { adminWrite } from '@/lib/adminRoute'
import type { NextRequest } from 'next/server'
import { discardDraft } from '@/lib/formStore'

// DELETE /api/admin/forms/:id/draft — discard the form's pending draft (NOT
// the form itself). Leaves published content untouched. Admin only. Moved
// here (from the bare /:id path) so that path can mean real deletion instead
// — see /api/admin/forms/[id]/route.ts.
export const DELETE = adminWrite(async (request: NextRequest, { community }, ctx: RouteContext<'/api/admin/forms/[id]/draft'>) => {
  const { id } = await ctx.params
  try {
    const form = await discardDraft(community.slug, id)
    if (!form) return Response.json({ ok: false, errors: ['Form not found.'] }, { status: 404 })
    return Response.json({ ok: true, form })
  } catch (err) {
    console.error('[admin/forms/:id/draft] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not discard draft.'] }, { status: 502 })
  }
})
