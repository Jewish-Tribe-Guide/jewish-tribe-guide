import { getSiteSettings } from '@/lib/siteSettingsStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/site-settings — the site's branding text (name, tagline, hero title,
// mission). Public read.
//
// No screen fetches this: every page gets it from the [community] layout
// (loadCommunityContent). It stays for the e2e suites, which read it to know
// what the site should show instead of hardcoding it, and warm the cache
// through it (Nov 18, review item 43). Read by e2e/helpers.ts,
// warmup.setup.ts, budgets.spec.ts, share.spec.ts, admin.spec.ts.
export async function GET(request: Request) {
  const slug = communitySlugFromRequest(request)
  try {
    const community = await resolveCommunity(slug)
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
