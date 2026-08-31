import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { setFormActive } from '@/lib/formStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// PATCH /api/admin/forms/:id/active — turns a form's public visibility
// on/off. Separate from the main PATCH (which only ever writes a draft) and
// from publish (which promotes that draft) — this applies immediately to
// the published row, regardless of any pending draft. Admin only.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/forms/[id]/active'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params

  let body: { active?: boolean }
  try {
    body = (await request.json()) as { active?: boolean }
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  if (typeof body.active !== 'boolean') {
    return Response.json({ ok: false, errors: ['active must be a boolean.'] }, { status: 400 })
  }

  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const form = await setFormActive(community.slug, id, body.active)
    if (!form) return Response.json({ ok: false, errors: ['Form not found.'] }, { status: 404 })
    // The public site caches this content; drop it so the change shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, form })
  } catch (err) {
    console.error('[admin/forms/:id/active] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update form.'] }, { status: 502 })
  }
}
