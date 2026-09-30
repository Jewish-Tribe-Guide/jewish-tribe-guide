import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from './categories'
import { haversineMiles, type LatLng } from './geo'
import { parseAsk } from './ask'
import { openState, type AskHit, type AskResult } from './askSearch'
import { activeFilters, passesFields } from './mapFilters'
import { reachLabel, readingFilters, readingItemsOn, readingReach, widenReach, type ReaderPlace, type Reading, type ReadingReach } from './questionReader'

// ── Answering a question from its reading (see questionReader.ts) ───────────
// The home and category searches' side of the reader: the reading picks
// the categories, their filters, the items and how far; the listings
// answer, exactly as the site's own search would (the same open-now
// reading, the same distances), in the same shape (AskResult), so the
// answer sentence and the results list are the ones the page already has.
// Nothing here comes from the AI but the choice of filters.

export type ReadingOptions = {
  coords?: LatLng | null
  now?: Date
  places: ReadonlyMap<string, ReaderPlace>
  /** A category page: only its own part of the reading. */
  categoryId?: string
}

/** Whether a reading says anything this page can answer from. An empty one
 *  (the reader knew none of it) leaves the site's own search to answer. */
export function readingAnswers(reading: Reading, categoryId?: string): boolean {
  const cats = categoryId ? reading.categories.filter((c) => c.id === categoryId) : reading.categories
  return cats.length > 0 || (reading.items?.length ?? 0) > 0 || (!!categoryId && !!reading.near)
}

export function searchReading(
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  reading: Reading,
  question: string,
  { coords = null, now = new Date(), places, categoryId }: ReadingOptions,
): AskResult & { reach: ReadingReach | null } {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const read = categoryId ? { ...reading, categories: reading.categories.filter((c) => c.id === categoryId) } : reading
  const { filters } = readingFilters(read)
  const items = read.items ?? []
  const itemTerms = [...new Set(items.flatMap((i) => i.toLowerCase().split(/\s+/)))]
  // On a category page, the page's category is asked about whether or not
  // the reading named it ("challah" on Grocery).
  const catIds = categoryId ? [categoryId] : read.categories.map((c) => c.id)
  const wantsOpen = new Set(read.categories.filter((c) => c.openNow).map((c) => c.id))

  const query = {
    ...parseAsk(''),
    raw: question.trim(),
    terms: itemTerms,
    nearMe: read.near === 'me',
    // Open now for the question as a whole only when it asked it of every
    // kind of place it's about: that's what the answer sentence then says
    // ("5 food places open now"). "Meat open now and the hotels" isn't,
    // and the hotels aren't open now, only there.
    openNow: wantsOpen.size > 0 && catIds.every((id) => wantsOpen.has(id)),
    within: read.near === 'me' && read.withinMiles ? { miles: read.withinMiles, asked: null } : null,
  }

  const baseReach = readingReach(read, places, coords)
  const origin = baseReach?.from ?? coords
  const found: AskHit[] = []
  const closed: AskHit[] = []
  const noHours: AskHit[] = []
  for (const item of listings) {
    const category = byId.get(item.category)
    if (!category) continue
    if (catIds.length ? !catIds.includes(item.category) : false) continue
    if (!passesFields(item as unknown as Record<string, unknown>, filters[item.category])) continue
    const matched = readingItemsOn(item, items)
    if (items.length && matched.length === 0) continue
    if (!catIds.length && !items.length) continue
    const miles = origin && item.geo && category.hasAddress !== false ? haversineMiles(origin, item.geo) : null
    const state = openState(item, category, now)
    const hit: AskHit = {
      item,
      category,
      score: matched.length,
      matchedTags: matched.map((m) => m.tag),
      matched,
      matchedFields: [],
      miles,
      open: state.open,
      closesAt: state.closesAt,
      today: state.today,
      atTime: null,
    }
    if (!wantsOpen.has(item.category) || hit.open === true) found.push(hit)
    else if (hit.open === null) noHours.push(hit)
    else closed.push(hit)
  }

  // How far: "within 3 miles", or "near HUP" grown to the nearest that
  // answers (see widenReach). Measured from where the reading says.
  const reach = baseReach ? widenReach(baseReach, found.flatMap((h) => (h.miles === null ? [] : [h.miles]))) : null
  const inReach = (h: AskHit) => !reach || reach.miles === null || (h.miles !== null && h.miles <= reach.miles)
  const byNearest = (a: AskHit, b: AskHit) =>
    (a.miles ?? Infinity) - (b.miles ?? Infinity) || (b.item.upvotes ?? 0) - (a.item.upvotes ?? 0) || a.item.name.localeCompare(b.item.name)
  const byUpvotes = (a: AskHit, b: AskHit) => (b.item.upvotes ?? 0) - (a.item.upvotes ?? 0) || byNearest(a, b)
  const order = origin ? byNearest : byUpvotes

  return {
    query,
    hits: found.filter(inReach).sort(order),
    categoryIds: catIds.length ? catIds : null,
    anchor: null,
    place: reach && reach.label !== 'you' ? { name: reach.label, inside: reach.inside } : null,
    closedCount: closed.filter(inReach).length,
    noHours: noHours.filter(inReach).sort(order),
    terms: itemTerms,
    excluded: [],
    openNowIn: [...wantsOpen],
    reach,
  }
}

export type ReadingChip = { key: string; label: string; without: Reading }

/** How the question was read, as chips: each category, each filter on it,
 *  each item, and how far (`reach`, as searchReading measured it), every
 *  one removable (`without` is the reading less that chip). A filter names
 *  its category when there's more than one ("Food: Meat"). */
export function readingChips(
  reading: Reading,
  categories: readonly CategoryConfig[],
  { reach, categoryId }: { reach: ReadingReach | null; categoryId?: string },
): ReadingChip[] {
  const chips: ReadingChip[] = []
  const shown = categoryId ? reading.categories.filter((c) => c.id === categoryId) : reading.categories
  const several = shown.length > 1
  for (const c of shown) {
    const category = categories.find((x) => x.id === c.id)
    if (!category) continue
    const others = reading.categories.filter((x) => x.id !== c.id)
    // A category page's own category is the page, not a chip.
    if (!categoryId) chips.push({ key: `cat:${c.id}`, label: category.pluralLabel, without: { ...reading, categories: others } })
    const { filters } = readingFilters({ categories: [c] })
    for (const a of activeFilters(filters, [category])) {
      const left = readingFromFilter(c, a.remove(filters)[c.id])
      chips.push({
        key: `${c.id}:${a.key}`,
        label: several ? `${category.pluralLabel}: ${a.label}` : a.label,
        without: { ...reading, categories: reading.categories.map((x) => (x.id === c.id ? left : x)) },
      })
    }
  }
  for (const item of reading.items ?? []) {
    chips.push({ key: `item:${item}`, label: item, without: { ...reading, items: (reading.items ?? []).filter((i) => i !== item) } })
  }
  const reachText = reach && reachLabel(reach)
  if (reachText) chips.push({ key: 'reach', label: reachText, without: { ...reading, near: null, withinMiles: null } })
  return chips
}

function readingFromFilter(c: Reading['categories'][number], f: ReturnType<typeof readingFilters>['filters'][string] | undefined): Reading['categories'][number] {
  return {
    id: c.id,
    ...(f?.openNow ? { openNow: true } : {}),
    ...(f?.bool?.length ? { bool: f.bool } : {}),
    ...(f?.select && Object.keys(f.select).length ? { select: f.select } : {}),
  }
}
