import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { listWatches } from '@/lib/watchStore'
import { loadListings } from '@/lib/listingReads'
import { listApprovedResources } from '@/lib/resourceStore'
import { newsletterLines } from '@/lib/nightKinds'
import { getNewsletterSetup } from '@/lib/newsletterSetupStore'
import { fillNewsletterScript, readNewsletterScript } from '@/lib/newsletterScript'
import { siteUrl } from '@/lib/siteUrl'

// GET /api/admin/watches/newsletters — the Newsletters page (admin drawing
// 18): whether the Gmail script is running, the script to set it up with
// (this community's own key filled in, newsletterSetupStore.ts), and the
// shul newsletters it reads, with the places one can be linked to. Admin
// only: the script carries the key.
//
// Adding a newsletter, linking a sender to its shul or skipping one is
// POST /api/admin/watches, as from a place's own page.
export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const [setup, { watches }, info, places, categories] = await Promise.all([
      getNewsletterSetup(community.slug),
      listWatches(community.slug),
      loadListings([community.slug]),
      listApprovedResources(community.slug),
      listCategories(community.slug),
    ])
    const label = new Map(categories.map((c) => [c.id, c.label]))
    return Response.json(
      {
        ok: true,
        // Without migration 090 there's no key to hand out.
        available: !!setup,
        script: setup && fillNewsletterScript(readNewsletterScript(), { site: siteUrl(), community: community.slug, key: setup.key }),
        checkedAt: setup?.checkedAt ?? null,
        account: setup?.account ?? null,
        newsletters: newsletterLines(watches, info),
        places: places.map((p) => ({ id: p.id, name: p.name, categoryLabel: label.get(p.category) ?? p.category })).sort((a, b) => a.name.localeCompare(b.name)),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('[admin/watches/newsletters] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the newsletters.'] }, { status: 502 })
  }
}
