import { listCampaignBanners } from '@/lib/campaignBannerStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/campaign-banners — every campaign banner for this community (active or not;
// the caller decides via activeCampaignBanner). Public read.
//
// No screen fetches this: every page gets it from the [community] layout
// (loadCommunityContent). It stays for the e2e suites, which read it to know
// what the site should show instead of hardcoding it, and warm the cache
// through it (Nov 18, review item 43). Read by e2e/warmup.setup.ts.
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
