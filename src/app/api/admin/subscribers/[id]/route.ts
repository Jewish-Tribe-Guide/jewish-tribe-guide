import type { NextRequest } from 'next/server'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { deleteSubscriberById } from '@/lib/subscriberStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// DELETE /api/admin/subscribers/:id — admin-initiated removal (a bounced or
// spam address, say). Doesn't touch site_settings/category caches — this
// data never renders on the public site, so there's nothing to revalidate.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/admin/subscribers/[id]'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    const removed = await deleteSubscriberById(community.slug, id)
    if (!removed) return Response.json({ ok: false, errors: ['Subscriber not found.'] }, { status: 404 })
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/subscribers/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not remove subscriber.'] }, { status: 502 })
  }
}
