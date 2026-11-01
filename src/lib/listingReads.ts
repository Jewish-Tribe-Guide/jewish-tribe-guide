import { listApprovedResources } from './resourceStore'
import { listCategories } from './categoryStore'
import { pageReadsFor } from './listingPageWatch'
import type { ReadsOf } from './watchGroups'
import { ownSiteCategories, siteGap } from './hoursJob'
import { listEruvimForAdmin } from './eruvStore'
import { websiteWatchOf } from './eruvJob'
import { placePath } from './placeLink'

/** Each listing's name, and what its own page is read for by its category:
 *  the server's copy of the Watches tab's `readsOf`, so What's tracked
 *  counts a mikvah's page as Mikvah hours whatever its label says, and
 *  names a newsletter by its shul. `siteGap`: for a place whose own
 *  website is read for what Google doesn't have (ownSiteCategories), why
 *  ("Not on Google"); null for any other. `placePage`: the place's own
 *  screen under the Watches tab (place/<id>), and `eruvPage` an eruv's, by
 *  the watch on its website, for a job's lines. */
export type SiteGap = (resourceId: string) => { why: string } | null
export type ListingInfo = { readsOf: ReadsOf; nameOf: (resourceId: string) => string | null; siteGap: SiteGap; placePage?: (resourceId: string) => string | null; eruvPage?: (watch: { url: string }) => string | null }

/** In each of `communities`. */
export async function loadListings(communities: Iterable<string>): Promise<ListingInfo> {
  const reads = new Map<string, 'times' | 'hours'>()
  const names = new Map<string, string>()
  const gaps = new Map<string, { why: string }>()
  const pages = new Map<string, string>()
  const eruvs: { id: string; website: string | null }[] = []
  await Promise.all(
    [...new Set(communities)].map(async (community) => {
      const [listings, categories, eruvim] = await Promise.all([listApprovedResources(community), listCategories(community), listEruvimForAdmin(community)])
      eruvs.push(...eruvim.eruvim)
      const categoryOf = new Map(categories.map((c) => [c.id, c]))
      const own = new Set(ownSiteCategories(categories).map((c) => c.id))
      for (const l of listings) {
        names.set(l.id, l.name)
        pages.set(l.id, placePath(l.id))
        const category = categoryOf.get(l.category)
        const kind = category && pageReadsFor(category)?.kind
        if (kind) reads.set(l.id, kind)
        if (category && own.has(category.id)) gaps.set(l.id, { why: siteGap(category, l as unknown as Record<string, unknown>) })
      }
    }),
  )
  return { readsOf: (id) => reads.get(id) ?? null, nameOf: (id) => names.get(id) ?? null, siteGap: (id) => gaps.get(id) ?? null, placePage: (id) => pages.get(id) ?? null, eruvPage: (watch) => { const e = eruvs.find((x) => websiteWatchOf(x, [watch])); return e ? placePath(e.id) : null } }
}
