import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { AskResult } from '@/lib/askSearch'
import { itemName, namesItem } from '@/lib/itemNames'

// ── Items as a filter: "Has" (Oct 13) ─────────────────────────────────────────
// A category that keeps an item list (Grocery's items, Food's dishes) has
// "Has" in its Filters (FiltersSheet), and a search for an item ticks it.
// Apart from searchLands.ts, which uses these too, so a category page
// doesn't load the home search's own code with them.

/** The fields a category keeps an item list in (Grocery's items, Food's
 *  dishes): each is a "Has" filter on its page. */
export function itemFields(category: CategoryConfig) {
  return category.detailFields.filter((f) => f.type === 'tags')
}

/** The items on a listing in one item field, always and sometimes, each
 *  under the name the guide uses for it (see itemNames.ts). */
export function listingItems(item: DirectoryResource, key: string): { tag: string; sometimes: boolean }[] {
  const out = new Map<string, boolean>()
  const add = (value: unknown, sometimes: boolean) => {
    if (!Array.isArray(value)) return
    for (const tag of value) if (typeof tag === 'string' && tag.trim()) out.set(itemName(tag), (out.get(itemName(tag)) ?? true) && sometimes)
  }
  add(item[key], false)
  add(item[`${key}_sometimes`], true)
  return [...out].map(([tag, sometimes]) => ({ tag, sometimes }))
}

/** Whether two names are one item, whatever their capitals: "wine" from
 *  an address or a reading is the listings' "Wine". */
export function sameItem(a: string, b: string): boolean {
  return itemName(a).toLowerCase() === itemName(b).toLowerCase()
}

/** Whether a listing has every one of `chosen` in that field, always or
 *  sometimes: "Has: Challah" keeps the store that only sometimes does,
 *  and its row says so. */
export function listingHas(item: DirectoryResource, key: string, chosen: readonly string[]): boolean {
  if (chosen.length === 0) return true
  const have = listingItems(item, key)
  return chosen.every((c) => have.some((t) => sameItem(t.tag, c)))
}

/** Every item in a field across a category's listings, with how many have
 *  it, most first, then A to Z: "Challah 10, Chicken 5, Wine 5 …". */
export function itemCounts(items: readonly DirectoryResource[], key: string): { tag: string; count: number }[] {
  // One item whatever its capitals ("wine" on one store, "Wine" on
  // another), under the spelling the first store has.
  const counts = new Map<string, { tag: string; count: number }>()
  for (const item of items) {
    for (const { tag } of listingItems(item, key)) {
      const had = counts.get(tag.toLowerCase())
      counts.set(tag.toLowerCase(), { tag: had?.tag ?? tag, count: (had?.count ?? 0) + 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** The items a search names, by item field, each with the words that named
 *  it: "challah" is Has: Challah, under the name its listings use. Only an
 *  item said by its name ("bread" is a kind, and several items). Only one
 *  some listing the search found has. What the Filters sheet shows ticked
 *  for the words in the box, and taking one off there takes its word out. */
export function searchItems(category: CategoryConfig, items: readonly DirectoryResource[], result: AskResult): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>()
  const hits = [...result.hits, ...result.noHours]
  const used = new Set<string>()
  const own = items.filter((i) => i.category === category.id)
  const terms = result.terms
  for (const field of itemFields(category)) {
    const counts = itemCounts(own, field.key)
    // The longest run of words first: "chalav yisroel milk" is Chalav
    // Yisroel Milk, one item said in three words (the user, Oct 13: it
    // found the store and ticked nothing).
    for (let size = terms.length; size >= 1; size--) {
      for (let i = 0; i + size <= terms.length; i++) {
        const span = terms.slice(i, i + size)
        if (span.some((t) => used.has(t))) continue
        const best = counts.find(({ tag }) => namesItem(span, tag, { kinds: false }) && hits.some((h) => listingHas(h.item, field.key, [tag])))
        if (!best) continue
        out.set(field.key, (out.get(field.key) ?? new Map()).set(best.tag, span.join(' ')))
        for (const t of span) used.add(t)
      }
    }
  }
  return out
}

