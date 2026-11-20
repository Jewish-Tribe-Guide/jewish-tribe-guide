import { reportServerError } from '@/lib/serverError'
import { adminWrite } from '@/lib/adminRoute'
import type { NextRequest } from 'next/server'
import { updateCampaignBanner, deleteCampaignBanner } from '@/lib/campaignBannerStore'

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
export const PATCH = adminWrite(async (request: NextRequest, { community }, ctx: RouteContext<'/api/admin/campaign-banners/[id]'>) => {
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
    return Response.json({ ok: true, banner })
  } catch (err) {
    reportServerError('[admin/campaign-banners/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update campaign banner.'] }, { status: 502 })
  }
})

// DELETE /api/admin/campaign-banners/:id — admin only.
export const DELETE = adminWrite(async (request: NextRequest, { community }, ctx: RouteContext<'/api/admin/campaign-banners/[id]'>) => {
  const { id } = await ctx.params
  try {
    await deleteCampaignBanner(community.slug, id)
    return Response.json({ ok: true })
  } catch (err) {
    reportServerError('[admin/campaign-banners/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not delete campaign banner.'] }, { status: 502 })
  }
})
