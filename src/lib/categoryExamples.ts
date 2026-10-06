import { conceptCategories, type Concept } from './ask'
import { selectValues, type CategoryConfig } from './categories'
import { haversineMiles } from './geo'
import { parseGroupBy } from './listGroups'
import type { Place } from './places'
import type { DirectoryResource } from '@/types'

// ── Example searches under a category page's search box ─────────────────────
// "Try  meat open now  dairy open now  parve": a few searches to tap, under
// the box on every category page. Asking goes above the list, arranging (the
// Filters and Sort) in the list's own heading, so these are searches, never
// filter switches: a tap types the words into the box.
//
// Built from the category's own listings, so any community gets sensible ones
// without anyone writing them, and each is offered only once the page has run
// it through the real search and it answers well (see answersWell), the same
// test the questions under the home search pass.
//
// Never a question the page already answers on its own: a shul page shows the
// next minyan in a card, so "next minyan" isn't an example there.

/** Every example worth trying on this category's page, most useful first.
 *  `all` is every category, for knowing what kind of place this one is;
 *  `places` the community's neighbourhoods and towns. */
export function categoryExamples(
  category: CategoryConfig,
  items: readonly DirectoryResource[],
  all: readonly CategoryConfig[] = [category],
  places: readonly Place[] = [],
): string[] {
  const out: string[] = []
  const walkIn = OPEN_NOW_KINDS.some((k) => conceptCategories(k, all).includes(category.id))
  const hasHours = category.detailFields.some((f) => f.type === 'hours')

  // The kinds a place comes in (Meat / Dairy / Parve): the most common two
  // asked with "open now" where people walk in, then each plain, which is
  // what's left to offer at night when nothing is open. Of a category's
  // pick-lists, the one with the fewest kinds is the most basic way to tell
  // its places apart (meat, dairy or parve, before restaurant, bakery or
  // caterer, before a list of hechshers).
  // Not the pick-list the page is grouped by: each of its values is a group
  // of its own already, and offering one alone reads as favouring it
  // ("orthodox (ashkenazi)" on Synagogues; agreed Sep 28, again Oct 6).
  const grouped = parseGroupBy(category.groupBy)
  const groupKey = grouped?.kind === 'field' ? grouped.key : null
  const kinds = category.detailFields
    .filter((f) => f.filterable && f.type === 'select' && f.key !== groupKey)
    .map((f) => common(items.flatMap((i) => [...new Set(selectValues(i[f.key]).map((v) => v.trim()))])))
    // One value, or nearly every place the same, tells nobody anything.
    .filter((values) => values.length >= 2)
    .sort((a, b) => a.length - b.length)[0]
  if (kinds) {
    const top = kinds.slice(0, 3)
    if (walkIn && hasHours) out.push(...top.slice(0, 2).map((v) => `${lower(v)} open now`))
    out.push(...top.map(lower))
  }

  // The items most places carry: "challah", "wine".
  const tagKeys = category.detailFields.filter((f) => f.type === 'tags').map((f) => f.key)
  const itemNames = common(
    items.flatMap((i) => {
      const seen = new Set<string>()
      for (const k of tagKeys) {
        const v = i[k]
        if (!Array.isArray(v)) continue
        for (const tag of v) {
          if (typeof tag !== 'string') continue
          const label = tag.trim()
          // Short names only: "Prepared Shabbos food from the deli counter"
          // isn't how anyone would ask.
          if (label && label.split(/\s+/).length <= 3) seen.add(label)
        }
      }
      return [...seen]
    }),
  )
  out.push(...itemNames.slice(0, 5).map(lower))

  // A yes/no the category keeps (Shabbat friendly): asking for the yeses.
  for (const field of category.detailFields.filter((f) => f.filterable && f.type === 'boolean')) {
    if (items.some((i) => i[field.key] === true)) out.push(lower(field.filterLabel ?? field.label))
  }

  // Davening questions aren't offered here: a shul page has a Minyanim tab
  // with its own (minyanimSearch.ts MINYANIM_EXAMPLES; the user's note 6,
  // agreed Oct 2), and these are the Synagogues tab's.

  // Where most of them are: "in Old City".
  const byPlace = common(
    items.flatMap((i) => {
      const at = i.geo ? nearestPlace(i.geo, places) : null
      // "in the Main Line" isn't how anyone says it.
      return at && !/^the\s/i.test(at.name) ? [at.name] : []
    }),
  )
  out.push(...byPlace.slice(0, 2).map((name) => `in ${name}`))

  return [...new Set(out)]
}

const OPEN_NOW_KINDS: Concept[] = ['food', 'grocery', 'mikvah']

const lower = (s: string) => s.toLowerCase()

/** Values held by at least two listings, most common first; ties
 *  alphabetically, so the order doesn't shuffle between visits. */
function common(values: readonly string[]): string[] {
  const counts = new Map<string, { label: string; n: number }>()
  for (const v of values) {
    const key = v.toLowerCase()
    const c = counts.get(key)
    if (c) c.n++
    else counts.set(key, { label: v, n: 1 })
  }
  return [...counts.values()]
    .filter((c) => c.n >= 2)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .map((c) => c.label)
}

/** The place a listing sits in: of those whose reach includes it, the one
 *  it's most central to. */
function nearestPlace(geo: { lat: number; lng: number }, places: readonly Place[]): Place | null {
  let best: { place: Place; score: number } | null = null
  for (const place of places) {
    const d = haversineMiles(place.geo, geo)
    if (d > place.radius) continue
    const score = d / place.radius
    if (!best || score < best.score) best = { place, score }
  }
  return best?.place ?? null
}
