import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { listWatches } from '@/lib/watchStore'
import { loadListings } from '@/lib/listingReads'
import { listApprovedResources } from '@/lib/resourceStore'
import { newsletterLines } from '@/lib/nightKinds'
import { askGmail, readWebAppLink } from '@/lib/gmailNow'
import { getNewsletterSetup, saveNewsletterWebApp } from '@/lib/newsletterSetupStore'
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
        readNow: !!setup?.webAppUrl,
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

// POST { url } — Paste its link: tried at once, kept only if it answers with
// this community's key (SetupBad14).
export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null
  const link = readWebAppLink(body?.url)
  if (!link) return Response.json({ ok: false, errors: ['That isn’t its web app link. It ends in /exec.'] }, { status: 400 })
  try {
    const setup = await getNewsletterSetup(community.slug)
    if (!setup) return Response.json({ ok: false, errors: ['Newsletters can’t be set up here yet.'] }, { status: 503 })
    const answer = await askGmail(link, setup.key)
    if (!answer.ok) return Response.json({ ok: false, errors: ['That link didn’t answer. Check access is set to Anyone.'] }, { status: 400 })
    if (!(await saveNewsletterWebApp(community.slug, link))) return Response.json({ ok: false, errors: ['Read now can’t be turned on here yet.'] }, { status: 503 })
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/watches/newsletters] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save that.'] }, { status: 502 })
  }
}
