import type { DirectoryResource } from '@/types'
import { selectValues, type CategoryConfig } from './categories'
import { haversineMiles, type LatLng } from './geo'
import { conceptCategories, formatOpenAtTime, parseAsk, termMatches, words, type AskQuery } from './ask'
import { openState, type AskHit, type AskResult } from './askSearch'
import { activeFilters, passesFields } from './mapFilters'
import { placeFor, reachLabel, readingFilters, readingItemsOn, readingReach, widenReach, type ReaderPlace, type Reading, type ReadingReach } from './questionReader'

// ── Answering a question from its reading (see questionReader.ts) ───────────
// The home and category searches' side of the reader. The work is split
// (decided Sep 30, after "meat restaurants open until 10pm or later" lost
// its hours): the AI's reading picks what our own parser is weak at, the
// kinds of place, their filters, the items and where; our own parser
// (ask.ts) keeps everything it's sure of, the times ("open until 10",
// "after 6", "today", "now"), "best", "other than Giant" and "a 15-minute
// drive", which the reading can't hold and mustn't overrule. The listings
// then answer both together, exactly as the site's own search would (the
// same hours, the same distances), in the same shape (AskResult), so the
// answer sentence and the results list are the ones the page already has.
// Nothing here comes from the AI but the choice of filters.
//
// The rule, since "food in Bala Cynwyd" lost its town the same way (Sep
// 30): the AI can add to what our own search understood, never take away.
// And it's only asked at all when our search left something it didn't
// understand (needsReading): a question our search fully understood is
// answered by it alone, instantly, and nothing changes under the visitor.

/** A place our own search is sure the question named: a town or
 *  neighbourhood ("in Bala Cynwyd"), or a listing ("near HUP"). */
export type OwnPlace = ReaderPlace & { label: string }

/** What our own search is sure of in a question, kept whatever the
 *  reading says. */
export type OwnConditions = Pick<AskQuery, 'openNow' | 'openToday' | 'openAt' | 'best' | 'excluding' | 'within'> & { place: OwnPlace | null }

/** From the question alone: everything but a place, which takes the
 *  listings and neighbourhoods to find (see ownFrom). */
export function ownConditions(question: string): OwnConditions {
  const { openNow, openToday, openAt, best, excluding, within } = parseAsk(question)
  return { openNow, openToday, openAt, best, excluding, within, place: null }
}

/** From what our own search made of the question: its conditions and the
 *  place it found, a listing ("near HUP") or a town ("in Bala Cynwyd"),
 *  called what the reader's places call it ("HUP", not the whole name). */
export function ownFrom(result: AskResult, places: ReadonlyMap<string, ReaderPlace> = new Map()): OwnConditions {
  const { openNow, openToday, openAt, best, excluding, within } = result.query
  const labelOf = (name: string) => placeFor(name, places)?.label ?? name
  const place: OwnPlace | null = result.anchor?.geo
    ? { name: result.anchor.name, label: labelOf(result.anchor.name), geo: result.anchor.geo }
    : result.place
      ? { name: result.place.name, label: labelOf(result.place.name), geo: result.place.geo, ...(result.place.inside ? { radius: result.place.radius } : {}) }
      : null
  return { openNow, openToday, openAt, best, excluding, within, place }
}

/** Whether our own search left anything it didn't understand, so the AI
 *  is worth asking: it found nothing, or some words it could only look for
 *  as text ("IKC dairy" found 27 places for its words, where the filters
 *  find 2). Not when every word was understood: a kind of place ("kosher
 *  food"), a place ("in Bala Cynwyd"), a time, or an item's own name
 *  ("challah", "cholov yisroel milk", found as the item). Nor questions it
 *  has its own answers for: the guide, zmanim, the eruv, minyanim. */
export function needsReading(result: AskResult): boolean {
  const q = result.query
  if (q.meta || q.times || q.eruv || q.minyan) return false
  if (result.hits.length === 0 && result.noHours.length === 0) return true
  const left = result.terms
  if (left.length === 0) return false
  // An item's own name only when every place found has it as an item:
  // "meat" is a store's item and a food place's type, and "sushi" a
  // store's item and a restaurant's description, and those need reading.
  // A real item, in one of the category's item lists: a food place's
  // type is a list of values too ("Meat"), which our search also matches.
  const asItem = (h: AskHit) => {
    const tag = h.matched[0]?.tag
    if (!tag) return false
    const listed = h.category.detailFields.some(
      (f) => f.type === 'tags' && [...selectValues(h.item[f.key]), ...selectValues(h.item[`${f.key}_sometimes`])].includes(tag),
    )
    const tagWords = words(tag)
    return listed && tagWords.length === left.length && left.every((t) => termMatches(t, tagWords))
  }
  return ![...result.hits, ...result.noHours].every(asItem)
}

/** A question as the page answers it: the AI's reading, and our own
 *  parser's conditions. The visitor can remove a chip from either. */
export type Asked = { reading: Reading; own: OwnConditions }

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

/** Whether the reading lost the kind of place our own parser is sure the
 *  question named: "shul near HUP" read as only Food. Then the site's own
 *  search answers, not the reading, when it finds anything: never trade an
 *  answer for none ("after school program" is Childcare's After School,
 *  though our parser hears "school"). A reading of items is about the
 *  items, whatever kind of place the question said ("challah at a
 *  bakery"). */
export function readingLoses(question: string, reading: Reading, categories: readonly CategoryConfig[]): boolean {
  if (reading.items?.length) return false
  const named = new Set(parseAsk(question).concepts.flatMap(({ concept }) => conceptCategories(concept, categories)))
  return named.size > 0 && !reading.categories.some((c) => named.has(c.id))
}

const keepsAnyHours = (c: CategoryConfig) => c.detailFields.some((f) => f.type === 'hours')

export function searchReading(
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  { reading, own }: Asked,
  question: string,
  { coords = null, now = new Date(), places, categoryId }: ReadingOptions,
): AskResult & { reach: ReadingReach | null } {
  const byId = new Map(categories.map((c) => [c.id, c]))
  // Where: our own search's place when it found one ("in Bala Cynwyd"),
  // whatever the reading says. "Within a 15-minute drive" is our parser's
  // too, measured from there, or where the reading says, or the visitor.
  const where: Partial<Reading> = own.place ? { near: own.place.name.toLowerCase(), place: own.place } : {}
  const withinMiles = reading.withinMiles ?? own.within?.miles ?? null
  const read: Reading = {
    ...reading,
    ...where,
    categories: categoryId ? reading.categories.filter((c) => c.id === categoryId) : reading.categories,
    ...(withinMiles ? { withinMiles, near: where.near ?? reading.near ?? 'me' } : {}),
  }
  const { filters } = readingFilters(read)
  const items = read.items ?? []
  const itemTerms = [...new Set(items.flatMap((i) => i.toLowerCase().split(/\s+/)))]
  // On a category page, the page's category is asked about whether or not
  // the reading named it ("challah" on Grocery).
  const catIds = categoryId ? [categoryId] : read.categories.map((c) => c.id)
  // When: "until 10" or "today" from our parser, for every kind of place
  // that keeps hours. "Now" is the reading's where it said it of some kinds
  // and not others ("meat open now, and every synagogue"), and our parser's
  // for every kind when the reading didn't say it at all.
  const timed = own.openAt ?? (own.openToday ? 'today' : null)
  const readOpen = read.categories.filter((c) => c.openNow).map((c) => c.id)
  const nowFor = new Set(
    timed ? [] : readOpen.length ? readOpen : own.openNow ? catIds.filter((id) => byId.get(id) && keepsAnyHours(byId.get(id)!)) : [],
  )

  const query: AskQuery = {
    ...parseAsk(''),
    raw: question.trim(),
    terms: itemTerms,
    nearMe: read.near === 'me',
    // Open now for the question as a whole only when it asked it of every
    // kind of place it's about: that's what the answer sentence then says
    // ("5 food places open now"). "Meat open now and the hotels" isn't,
    // and the hotels aren't open now, only there.
    openNow: nowFor.size > 0 && catIds.every((id) => nowFor.has(id)),
    openToday: !own.openAt && own.openToday,
    openAt: own.openAt,
    best: own.best,
    excluding: own.excluding,
    within: read.near === 'me' && read.withinMiles ? (own.within ?? { miles: read.withinMiles, asked: null }) : null,
  }

  const baseReach = readingReach(read, places, coords)
  const origin = baseReach?.from ?? coords
  const found: AskHit[] = []
  const closed: AskHit[] = []
  const noHours: AskHit[] = []
  const excluded = new Set<string>()
  for (const item of listings) {
    const category = byId.get(item.category)
    if (!category) continue
    if (catIds.length ? !catIds.includes(item.category) : false) continue
    if (!passesFields(item as unknown as Record<string, unknown>, filters[item.category])) continue
    const matched = readingItemsOn(item, items)
    if (items.length && matched.length === 0) continue
    if (!catIds.length && !items.length) continue
    if (own.excluding.length && own.excluding.every((w) => termMatches(w, words(item.name), 3, false))) {
      excluded.add(item.name)
      continue
    }
    const miles = origin && item.geo && category.hasAddress !== false ? haversineMiles(origin, item.geo) : null
    const state = openState(item, category, now, own.openAt)
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
      atTime: state.atTime,
    }
    // Asked when of a kind of place that keeps hours: only what's open
    // then answers; one with no hours saved isn't counted closed.
    const when = timed && keepsAnyHours(category) ? timed : nowFor.has(item.category) ? 'now' : null
    const fits = when === null || (when === 'now' ? hit.open === true : when === 'today' ? hit.today.length > 0 : !!hit.atTime?.length)
    if (fits) found.push(hit)
    else if (hit.open === null && !state.known) noHours.push(hit)
    else closed.push(hit)
  }

  // How far: "within 3 miles", or "near HUP" grown to the nearest that
  // answers (see widenReach). Measured from where the reading says.
  const reach = baseReach ? widenReach(baseReach, found.flatMap((h) => (h.miles === null ? [] : [h.miles]))) : null
  const inReach = (h: AskHit) => !reach || reach.miles === null || (h.miles !== null && h.miles <= reach.miles)
  const byNearest = (a: AskHit, b: AskHit) =>
    (a.miles ?? Infinity) - (b.miles ?? Infinity) || (b.item.upvotes ?? 0) - (a.item.upvotes ?? 0) || a.item.name.localeCompare(b.item.name)
  const byUpvotes = (a: AskHit, b: AskHit) => (b.item.upvotes ?? 0) - (a.item.upvotes ?? 0) || byNearest(a, b)
  // "Best": neighbours' upvotes first, the only ranking the guide has.
  const order = own.best || !origin ? byUpvotes : byNearest

  return {
    query,
    hits: found.filter(inReach).sort(order),
    categoryIds: catIds.length ? catIds : null,
    anchor: null,
    place: reach && reach.label !== 'you' ? { name: reach.label, inside: reach.inside, geo: reach.from, radius: reach.miles ?? 0 } : null,
    closedCount: closed.filter(inReach).length,
    noHours: noHours.filter(inReach).sort(order),
    terms: itemTerms,
    excluded: [...excluded],
    openNowIn: [...nowFor],
    reach,
  }
}

export type ReadingChip = {
  key: string
  label: string
  without: Asked
  /** What taking it away is called when offered ("Anywhere", "Any time");
   *  otherwise "Without <label>". */
  widen?: string
}

/** How the question was read, as chips: each category, each filter on it,
 *  each item, when, how far (`reach`, as searchReading measured it), "best"
 *  and who's left out, every one removable (`without` is the question less
 *  that chip). A filter names its category when there's more than one
 *  ("Food: Meat"). */
export function readingChips(
  { reading, own }: Asked,
  categories: readonly CategoryConfig[],
  { reach, categoryId, excluded = [] }: { reach: ReadingReach | null; categoryId?: string; excluded?: string[] },
): ReadingChip[] {
  const chips: ReadingChip[] = []
  const withReading = (r: Reading): Asked => ({ reading: r, own })
  const withOwn = (o: Partial<OwnConditions>): Asked => ({ reading, own: { ...own, ...o } })
  const shown = categoryId ? reading.categories.filter((c) => c.id === categoryId) : reading.categories
  const several = shown.length > 1
  for (const c of shown) {
    const category = categories.find((x) => x.id === c.id)
    if (!category) continue
    const others = reading.categories.filter((x) => x.id !== c.id)
    // A category page's own category is the page, not a chip.
    if (!categoryId) chips.push({ key: `cat:${c.id}`, label: category.pluralLabel, without: withReading({ ...reading, categories: others }) })
    const { filters } = readingFilters({ categories: [c] })
    for (const a of activeFilters(filters, [category])) {
      const left = readingFromFilter(c, a.remove(filters)[c.id])
      chips.push({
        key: `${c.id}:${a.key}`,
        label: several ? `${category.pluralLabel}: ${a.label}` : a.label,
        without: withReading({ ...reading, categories: reading.categories.map((x) => (x.id === c.id ? left : x)) }),
      })
    }
  }
  for (const item of reading.items ?? []) {
    chips.push({ key: `item:${item}`, label: item, without: withReading({ ...reading, items: (reading.items ?? []).filter((i) => i !== item) }) })
  }
  // When, from our own parser: a time, today, or now when the reading
  // didn't say it of any kind of place (then it's said of all of them).
  if (own.openAt) {
    const how = { after: 'after', until: 'until', at: 'at', before: 'before' }[own.openAt.how]
    chips.push({ key: 'when', label: `Open ${how} ${formatOpenAtTime(own.openAt.minutes)}`, without: withOwn({ openAt: null }), widen: 'Any time' })
  } else if (own.openToday) {
    chips.push({ key: 'when', label: 'Open today', without: withOwn({ openToday: false }), widen: 'Any time' })
  } else if (own.openNow && !reading.categories.some((c) => c.openNow)) {
    chips.push({ key: 'when', label: 'Open now', without: withOwn({ openNow: false }), widen: 'Any time' })
  }
  const reachText = reach && reachLabel(reach)
  if (reachText) {
    chips.push({ key: 'reach', label: reachText, without: { reading: { ...reading, near: null, withinMiles: null }, own: { ...own, within: null, place: null } }, widen: 'Anywhere' })
  }
  if (own.best) chips.push({ key: 'best', label: 'Most upvoted first', without: withOwn({ best: false }) })
  if (own.excluding.length) {
    chips.push({ key: 'excluding', label: `Besides ${excluded.length ? excluded[0] : own.excluding.join(' ')}`, without: withOwn({ excluding: [] }) })
  }
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

export type ReadingOffer = { key: string; label: string; count: number; next: Asked }

/** What to offer beside a reading instead of saying something it isn't
 *  sure of (decided Sep 30: "we need to not confidently say something
 *  that's wrong"). Two kinds, each with how many places it would find:
 *  - the narrower filters the reader wasn't sure the question meant
 *    ("Only Restaurant", when "restaurants" may have meant any food
 *    place), never applied without a tap;
 *  - when the reading finds nothing, the one chip without which it would
 *    find something ("Without Restaurant"), rather than a bare "nothing".
 *  Offers that would find nothing aren't made. */
export function readingOffers(
  asked: Asked,
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  question: string,
  options: ReadingOptions & { found: number; chips: ReadingChip[] },
): ReadingOffer[] {
  const { reading } = asked
  const count = (next: Asked) => {
    const r = searchReading(listings, categories, next, question, options)
    return r.hits.length + r.noHours.length
  }
  const offers: ReadingOffer[] = []
  const shown = options.categoryId ? reading.categories.filter((c) => c.id === options.categoryId) : reading.categories
  for (const m of reading.maybe ?? []) {
    const category = categories.find((c) => c.id === m.id)
    const applied = reading.categories.find((c) => c.id === m.id)
    if (!category || !applied || !shown.includes(applied)) continue
    // One offer per filter it was unsure of, each added alone to what the
    // reading already has there.
    const singles: Reading['categories'][number][] = [
      ...(m.bool ?? []).map((k) => ({ id: m.id, bool: [k] })),
      ...Object.entries(m.select ?? {}).flatMap(([k, vs]) => vs.map((v) => ({ id: m.id, select: { [k]: [v] } }))),
    ]
    for (const single of singles) {
      const { filters } = readingFilters({ categories: [single] })
      const label = activeFilters(filters, [category])[0]?.label
      if (!label) continue
      const merged: Reading['categories'][number] = {
        ...applied,
        ...(single.bool ? { bool: [...new Set([...(applied.bool ?? []), ...single.bool])] } : {}),
        ...(single.select ? { select: mergeSelect(applied.select, single.select) } : {}),
      }
      if (JSON.stringify(merged) === JSON.stringify(applied)) continue
      const next: Asked = { ...asked, reading: { ...reading, categories: reading.categories.map((c) => (c.id === m.id ? merged : c)) } }
      const n = count(next)
      if (n > 0) offers.push({ key: `maybe:${m.id}:${label}`, label: `Only ${label}`, count: n, next })
    }
  }
  if (options.found === 0) {
    const widened = options.chips.map((chip) => ({ chip, n: count(chip.without) })).filter((x) => x.n > 0)
    widened.sort((a, b) => a.n - b.n)
    // The smallest step that finds something: the least taken away.
    const step = widened[0]
    if (step) offers.push({ key: `without:${step.chip.key}`, label: step.chip.widen ?? `Without ${step.chip.label}`, count: step.n, next: step.chip.without })
  }
  return offers
}

function mergeSelect(a: Record<string, string[]> | undefined, b: Record<string, string[]>): Record<string, string[]> {
  const out = { ...a }
  for (const [k, vs] of Object.entries(b)) out[k] = [...new Set([...(out[k] ?? []), ...vs])]
  return out
}

const NOTHING_OWN: OwnConditions = { openNow: false, openToday: false, openAt: null, best: false, excluding: [], within: null, place: null }

/** A reading in words, for the admin's "Read questions" list: each
 *  category, filter, item and where, as the chips say them, and what it
 *  wasn't sure of ("maybe Restaurant"). */
export function describeReading(reading: Reading, categories: readonly CategoryConfig[]): string[] {
  const reach = readingReach(reading, new Map(), null)
  const labels = readingChips({ reading, own: NOTHING_OWN }, categories, { reach }).map((c) => c.label)
  if (reading.near === 'me' && !reach) labels.push(reading.withinMiles ? `Within ${reading.withinMiles} mi of you` : 'Near you')
  else if (reading.near && !reach) labels.push(`Near ${reading.near}`)
  for (const m of reading.maybe ?? []) {
    const category = categories.find((c) => c.id === m.id)
    if (!category) continue
    for (const a of activeFilters(readingFilters({ categories: [m] }).filters, [category])) labels.push(`maybe ${a.label}`)
  }
  return labels
}
