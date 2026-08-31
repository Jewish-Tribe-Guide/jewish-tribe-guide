import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { publishDraft } from '@/lib/formStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// POST /api/admin/forms/:id/publish — promotes a form's draft to published
// content (what the live wizard reads) and clears the draft. Admin only.
export async function POST(request: NextRequest, ctx: RouteContext<'/api/admin/forms/[id]/publish'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const form = await publishDraft(community.slug, id)
    if (!form) return Response.json({ ok: false, errors: ['Form not found.'] }, { status: 404 })
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, form })
  } catch (err) {
    console.error('[admin/forms/:id/publish] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not publish form.'] }, { status: 502 })
  }
}
