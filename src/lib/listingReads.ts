import { listApprovedResources } from './resourceStore'
import { listCategories } from './categoryStore'
import { pageReadsFor } from './listingPageWatch'
import type { ReadsOf } from './watchGroups'
import { dishCategories } from './watchFindings'
import { siteGap } from './hoursJob'

/** Each listing's name, and what its own page is read for by its category:
 *  the server's copy of the Watches tab's `readsOf`, so What's tracked
 *  counts a mikvah's page as Mikvah hours whatever its label says, and
 *  names a newsletter by its shul. `siteGap`: for a food place, whose own
 *  website is read for what Google doesn't have, why ("Not on Google");
 *  null for any other place. */
export type SiteGap = (resourceId: string) => string | null
export type ListingInfo = { readsOf: ReadsOf; nameOf: (resourceId: string) => string | null; siteGap: SiteGap }

/** In each of `communities`. */
export async function loadListings(communities: Iterable<string>): Promise<ListingInfo> {
  const reads = new Map<string, 'times' | 'hours'>()
  const names = new Map<string, string>()
  const gaps = new Map<string, string>()
  await Promise.all(
    [...new Set(communities)].map(async (community) => {
      const [listings, categories] = await Promise.all([listApprovedResources(community), listCategories(community)])
      const categoryOf = new Map(categories.map((c) => [c.id, c]))
      const food = new Set(dishCategories(categories).map((c) => c.id))
      for (const l of listings) {
        names.set(l.id, l.name)
        const category = categoryOf.get(l.category)
        const kind = category && pageReadsFor(category)?.kind
        if (kind) reads.set(l.id, kind)
        if (category && food.has(category.id)) gaps.set(l.id, siteGap(category, l as unknown as Record<string, unknown>))
      }
    }),
  )
  return { readsOf: (id) => reads.get(id) ?? null, nameOf: (id) => names.get(id) ?? null, siteGap: (id) => gaps.get(id) ?? null }
}
