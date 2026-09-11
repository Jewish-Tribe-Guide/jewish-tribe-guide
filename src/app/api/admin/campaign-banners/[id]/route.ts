import type { NextRequest } from 'next/server'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { updateCampaignBanner, deleteCampaignBanner } from '@/lib/campaignBannerStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

type PatchBody = {
  categoryId?: string
  title?: string
  subtitle?: string
  startDate?: string
  endDate?: string
  destination?: 'list' | 'map'
}

// PATCH /api/admin/campaign-banners/:id — only the provided keys change.
// Admin only.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/campaign-banners/[id]'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (body.title !== undefined && !body.title.trim()) {
    return Response.json({ ok: false, errors: ['Title cannot be empty.'] }, { status: 400 })
  }
  if (body.startDate !== undefined && body.endDate !== undefined && body.startDate > body.endDate) {
    return Response.json({ ok: false, errors: ['Start date must be on or before the end date.'] }, { status: 400 })
  }
  if (body.destination !== undefined && body.destination !== 'list' && body.destination !== 'map') {
    return Response.json({ ok: false, errors: ['Invalid destination.'] }, { status: 400 })
  }

  try {
    const banner = await updateCampaignBanner(community.slug, id, body)
    if (!banner) {
      return Response.json({ ok: false, errors: ['Campaign banner not found.'] }, { status: 404 })
    }
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, banner })
  } catch (err) {
    console.error('[admin/campaign-banners/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update campaign banner.'] }, { status: 502 })
  }
}

// DELETE /api/admin/campaign-banners/:id — admin only.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/admin/campaign-banners/[id]'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    await deleteCampaignBanner(community.slug, id)
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/campaign-banners/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not delete campaign banner.'] }, { status: 502 })
  }
}
