import { listApprovedResources } from './resourceStore'
import { listCategories } from './categoryStore'
import { pageReadsFor } from './listingPageWatch'
import type { ReadsOf } from './watchGroups'
import { dishCategories } from './watchFindings'
import { ownSiteCategories, siteGap } from './hoursJob'

/** Each listing's name, and what its own page is read for by its category:
 *  the server's copy of the Watches tab's `readsOf`, so What's tracked
 *  counts a mikvah's page as Mikvah hours whatever its label says, and
 *  names a newsletter by its shul. `siteGap`: for a place whose own
 *  website is read for what Google doesn't have (ownSiteCategories), why
 *  ("Not on Google") and the job page holding what it finds (a food
 *  place's, Dishes; any other's, its kind's page, kind/hotel); null for
 *  any other. */
export type SiteGap = (resourceId: string) => { why: string; page: string } | null
export type ListingInfo = { readsOf: ReadsOf; nameOf: (resourceId: string) => string | null; siteGap: SiteGap }

/** In each of `communities`. */
export async function loadListings(communities: Iterable<string>): Promise<ListingInfo> {
  const reads = new Map<string, 'times' | 'hours'>()
  const names = new Map<string, string>()
  const gaps = new Map<string, { why: string; page: string }>()
  await Promise.all(
    [...new Set(communities)].map(async (community) => {
      const [listings, categories] = await Promise.all([listApprovedResources(community), listCategories(community)])
      const categoryOf = new Map(categories.map((c) => [c.id, c]))
      const own = new Set(ownSiteCategories(categories).map((c) => c.id))
      const food = new Set(dishCategories(categories).map((c) => c.id))
      for (const l of listings) {
        names.set(l.id, l.name)
        const category = categoryOf.get(l.category)
        const kind = category && pageReadsFor(category)?.kind
        if (kind) reads.set(l.id, kind)
        if (category && own.has(category.id)) gaps.set(l.id, { why: siteGap(category, l as unknown as Record<string, unknown>), page: food.has(category.id) ? 'dishes' : `kind/${category.id}` })
      }
    }),
  )
  return { readsOf: (id) => reads.get(id) ?? null, nameOf: (id) => names.get(id) ?? null, siteGap: (id) => gaps.get(id) ?? null }
}
