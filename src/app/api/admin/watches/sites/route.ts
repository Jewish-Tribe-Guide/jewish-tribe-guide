import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { jobFindings } from '@/lib/watchFindingStore'
import { listWatches } from '@/lib/watchStore'
import { isListingPageWatch } from '@/lib/listingPageWatch'
import { sitePlaces } from '@/lib/hoursJobRun'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'

// GET /api/admin/watches/sites — the places whose own website is read with
//     no job page of their own (a grocery, a childcare, a hotel;
//     siteCategories in watchFindings.ts), for the Watches tab's rows by
//     kind of place: each one's pages, what they found that differs from
//     the listing, waiting under its kind's row (the user, Oct 25: "grocery
//     should go to grocery"), and when its last one was decided. Nothing is
//     read here. Admin only.

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const [{ watches }, { categories, places }] = await Promise.all([listWatches(community.slug), sitePlaces(community.slug)])
    const { findings, decided } = places.length ? await jobFindings(community.slug, 'sites', categories) : { findings: [], decided: new Map() }
    const rows = places.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      href: routes.listing(community.slug, p.category, listingSlug(p)),
      pages: watches.filter((w) => w.resourceId === p.id && isListingPageWatch(w)).map((watch) => ({ watch })),
      findings: findings.filter((f) => f.targetId === p.id),
      decided: decided.get(p.id) ?? null,
    }))
    return Response.json({ ok: true, places: rows })
  } catch (err) {
    console.error('[admin/watches/sites] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the places.'] }, { status: 502 })
  }
}
