import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { listCampaignBannersUncached, createCampaignBanner } from '@/lib/campaignBannerStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/admin/campaign-banners — every banner (active or not), for the
// admin Campaigns tab. Admin only — the public GET /api/campaign-banners
// serves the same rows to the site.
export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const banners = await listCampaignBannersUncached(community.slug)
    return Response.json({ ok: true, banners })
  } catch (err) {
    console.error('[admin/campaign-banners] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load campaign banners.'] }, { status: 502 })
  }
}

type CreateBody = {
  categoryId?: string
  title?: string
  subtitle?: string
  startDate?: string
  endDate?: string
}

// POST /api/admin/campaign-banners — create a new campaign banner.
export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (!body.title?.trim()) {
    return Response.json({ ok: false, errors: ['Title is required.'] }, { status: 400 })
  }
  if (!body.categoryId) {
    return Response.json({ ok: false, errors: ['A category is required.'] }, { status: 400 })
  }
  if (!body.startDate || !body.endDate) {
    return Response.json({ ok: false, errors: ['Start and end date are required.'] }, { status: 400 })
  }
  if (body.startDate > body.endDate) {
    return Response.json({ ok: false, errors: ['Start date must be on or before the end date.'] }, { status: 400 })
  }

  try {
    const banner = await createCampaignBanner(community.slug, {
      categoryId: body.categoryId,
      title: body.title,
      subtitle: body.subtitle,
      startDate: body.startDate,
      endDate: body.endDate,
    })
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, banner })
  } catch (err) {
    console.error('[admin/campaign-banners] POST failed:', err)
    const message = err instanceof Error ? err.message : 'Could not create campaign banner.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}
