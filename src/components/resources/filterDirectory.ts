import type { DirectoryResource } from '@/types'
import { selectValues, type CategoryConfig } from '@/lib/categories'
import { hoursOpenNow, businessClosure } from '@/lib/hours'
import { listingHas } from '@/lib/itemFilter'
import { travelCompare } from '@/lib/listingTravel'

type Field = CategoryConfig['detailFields'][number]

// A category page's list: what the search and the Filters leave, in the
// order Sort says (GenericDirectory's `filtered`).
export function filterDirectory(
  items: DirectoryResource[],
  {
    matchesSearch,
    filterableBooleans,
    boolFilters,
    filterableSelects,
    selectFilters,
    hasFilters,
    openNow,
    hasFilterableHours,
    now,
    hoursFields,
    upvotes,
    byPopular,
    liveCount,
  }: {
    matchesSearch: (item: DirectoryResource) => boolean
    filterableBooleans: Field[]
    boolFilters: Record<string, boolean>
    filterableSelects: Field[]
    selectFilters: Record<string, string[]>
    hasFilters: Record<string, string[]>
    openNow: boolean
    hasFilterableHours: boolean
    now: Date | null
    hoursFields: Field[]
    upvotes: boolean
    byPopular: boolean
    liveCount: (item: DirectoryResource) => number
  },
): DirectoryResource[] {
  return items
    .filter((item) => {
      if (!matchesSearch(item)) return false
      for (const f of filterableBooleans) {
        if (boolFilters[f.key] && !item[f.key]) return false
      }
      for (const f of filterableSelects) {
        const chosen = selectFilters[f.key]
        // A select field can hold more than one value on a single item (e.g. a
        // place that's both a Restaurant and a Caterer) — it matches a chosen
        // filter set if ANY of its own values is one of the chosen ones.
        if (chosen?.length && !selectValues(item[f.key]).some((v) => chosen.includes(v))) return false
      }
      for (const [key, chosen] of Object.entries(hasFilters)) if (!listingHas(item, key, chosen)) return false
      if (openNow && hasFilterableHours) {
        // Closed businesses are never open, whatever hours they still have
        // saved — a temporarily-closed shop kept passing this filter on last
        // season's hours.
        if (businessClosure(item as unknown as Record<string, unknown>)) return false
        // Item must be open right now according to at least one filterable
        // hours field; that waits for the time, as the rows do.
        const isOpen = !now || hoursFields
          .filter((f) => f.filterable)
          .some((f) => hoursOpenNow(item[f.key], now) === true)
        if (!isOpen) return false
      }
      return true
    })
    .sort((a, b) => {
      // Closed businesses sink to the bottom, ahead of every other sort key.
      // They stay in the list deliberately — the person most likely to walk to
      // a closed shop is the one who already knows it exists, and hiding it is
      // the one thing that guarantees they can't be warned — but they
      // shouldn't compete for attention with places that are actually
      // trading. Anyone who wants them gone entirely has the "Open now" filter.
      const closedDiff =
        Number(!!businessClosure(a as unknown as Record<string, unknown>)) -
        Number(!!businessClosure(b as unknown as Record<string, unknown>))
      if (closedDiff !== 0) return closedDiff
      // Saved places don't float to the top (Oct 14): the order is what Sort
      // says. Their badge is how they stand out.
      return upvotes && byPopular
        ? liveCount(b) - liveCount(a) || travelCompare(a, b)
        : // From the centre only when Distance was chosen or asked for
          // ("near me"); otherwise, with no location, by name.
          travelCompare(a, b, { fromCenter: !byPopular })
    })
}
