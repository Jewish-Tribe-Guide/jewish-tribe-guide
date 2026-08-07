import { getSiteSettings } from '@/lib/siteSettingsStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/site-settings — the site's branding text (name, tagline, hero
// title, mission). Public read; the header/hero/footer fetch this via
// useSiteSettings.ts, falling back to community.config defaults if it fails.
export async function GET(request: Request) {
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const settings = await getSiteSettings(community.slug)
    return Response.json({ ok: true, settings })
  } catch (err) {
    console.error('[site-settings] GET failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not load site settings. Please try again.'] },
      { status: 502 },
    )
  }
}
