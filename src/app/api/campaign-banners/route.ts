import { listCampaignBanners } from '@/lib/campaignBannerStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/campaign-banners — every campaign banner for this community
// (active or not; the caller decides via activeCampaignBanner). Public read,
// same shape as /api/home-sections.
export async function GET(request: Request) {
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const banners = await listCampaignBanners(community.slug)
    return Response.json({ ok: true, banners })
  } catch (err) {
    console.error('[campaign-banners] GET failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not load campaign banners. Please try again.'] },
      { status: 502 },
    )
  }
}
