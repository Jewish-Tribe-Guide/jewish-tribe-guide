import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { discardDraft } from '@/lib/formStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// DELETE /api/admin/forms/:id/draft — discard the form's pending draft (NOT
// the form itself). Leaves published content untouched. Admin only. Moved
// here (from the bare /:id path) so that path can mean real deletion instead
// — see /api/admin/forms/[id]/route.ts.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/admin/forms/[id]/draft'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const form = await discardDraft(community.slug, id)
    if (!form) return Response.json({ ok: false, errors: ['Form not found.'] }, { status: 404 })
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, form })
  } catch (err) {
    console.error('[admin/forms/:id/draft] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not discard draft.'] }, { status: 502 })
  }
}
