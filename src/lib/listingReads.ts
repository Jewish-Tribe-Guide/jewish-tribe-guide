import { listApprovedResources } from './resourceStore'
import { listCategories } from './categoryStore'
import { pageReadsFor } from './listingPageWatch'
import type { ReadsOf } from './watchGroups'

/** What each listing's own page is read for, by its category, in each of
 *  `communities`: the server's copy of the Watches tab's `readsOf`, so Last
 *  night counts a mikvah's page as Mikvah hours whatever its label says. */
export async function loadReadsOf(communities: Iterable<string>): Promise<ReadsOf> {
  const reads = new Map<string, 'times' | 'hours'>()
  await Promise.all(
    [...new Set(communities)].map(async (community) => {
      const [listings, categories] = await Promise.all([listApprovedResources(community), listCategories(community)])
      const categoryOf = new Map(categories.map((c) => [c.id, c]))
      for (const l of listings) {
        const category = categoryOf.get(l.category)
        const kind = category && pageReadsFor(category)?.kind
        if (kind) reads.set(l.id, kind)
      }
    }),
  )
  return (id) => reads.get(id) ?? null
}
