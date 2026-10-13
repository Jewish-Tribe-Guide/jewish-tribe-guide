import type { DirectoryResource, ZmanimData } from '@/types'
import { selectValues, type CategoryConfig } from '@/lib/categories'
import { searchAsk, type AskOptions, type AskResult } from '@/lib/askSearch'
import { words, type TimesAsk } from '@/lib/ask'
import { itemName } from '@/lib/itemNames'
import { itemCounts, itemFields, listingHas, searchItems } from '@/lib/itemFilter'
import { hoursOpenNow, businessClosure } from '@/lib/hours'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import type { Reading } from '@/lib/questionReader'

// ── Search takes you to the page (Oct 13) ─────────────────────────────────────
// The home search used to answer in place: a sentence, places and categories
// under the box, out of nowhere, which testers didn't trust. Now typing shows
// a short list of where it could go, each line saying what you'd find there
// ("Grocery · 10 open now with Challah"), and Enter goes to the first: a real
// page, with your words still in its box and what they meant set as that
// page's own Filters, which you can see and switch off.
//
// Where Enter goes (canvas page "lands"):
//   a place's name             → its listing
//   a kind of place, with or
//   without conditions         → that category's page, the conditions in its
//                                Filters (Open now, a pick-list, Has)
//   something in more than one
//   category ("challah")       → the one with the most; the other is a line
//   a minyan                   → Minyanim by time, the words in its box
//   a zman                     → the times page, that time picked out
//   the eruv                   → the eruv page
//   the guide itself           → About, or "+ Add" for "how do I add"
//   nothing anywhere           → stays on home and says so
//
// Pure: the page hands in what it holds (listings, categories, the search's
// own reading of the words) and gets back lines, each with where it goes.

/** One line in the list under the home box. The first is what Enter does. */
export type SearchLine = {
  key: string
  kind: 'listing' | 'category' | 'minyanim' | 'times' | 'eruv' | 'about' | 'add' | 'card'
  title: string
  /** What you'd find there: "10 open now with Challah", "Mincha next at 2
   *  PM · Kahal Kadosh Mikveh Israel, 0.9 mi". */
  sub: string
  /** Where it goes. Null for "+ Add", which opens the box in place, and for
   *  a home card that isn't a page (Patient & Family Support's form). */
  href: string | null
  categoryId?: string
  listing?: DirectoryResource
  /** A home card's id ("support"), for a line that opens it. */
  cardId?: string
}

/** A category page's filters, as its address holds them (see
 *  GenericDirectory): `openNow=1`, `f_<key>=1`, `sel_<key>=a,b`,
 *  `has_<key>=Challah,Wine`. */
export type LandFilters = {
  openNow: boolean
  bool: string[]
  select: Record<string, string[]>
  has: Record<string, string[]>
}

export const NO_FILTERS: LandFilters = { openNow: false, bool: [], select: {}, has: {} }

export function filterCount(f: LandFilters): number {
  return (f.openNow ? 1 : 0) + f.bool.length + Object.values(f.select).filter((v) => v.length).length + Object.values(f.has).filter((v) => v.length).length
}

/** The listings a category page shows with these filters and nothing
 *  typed: what a line's count promises the page will show. */
export function withFilters(items: readonly DirectoryResource[], category: CategoryConfig, f: LandFilters, now: Date | null): DirectoryResource[] {
  const hours = category.detailFields.filter((d) => d.type === 'hours' && d.filterable)
  return items.filter((item) => {
    if (item.category !== category.id) return false
    for (const key of f.bool) if (!item[key]) return false
    for (const [key, chosen] of Object.entries(f.select)) if (chosen.length && !selectValues(item[key]).some((v) => chosen.includes(v))) return false
    for (const [key, chosen] of Object.entries(f.has)) if (!listingHas(item, key, chosen)) return false
    if (f.openNow && hours.length) {
      if (businessClosure(item as unknown as Record<string, unknown>)) return false
      if (now && !hours.some((h) => hoursOpenNow(item[h.key], now) === true)) return false
    }
    return true
  })
}

// ── The address a line opens ──────────────────────────────────────────────────

/** A category page with your words in its box and what they meant in its
 *  Filters. `read` says the Filters hold all of it: the page then shows the
 *  words without searching by them again, so switching a filter off really
 *  widens the list (see GenericDirectory's `landedSearch`). */
export function categoryHref(slug: string, categoryId: string, words: string, f: LandFilters, read: boolean): string {
  const p = new URLSearchParams()
  if (words) p.set('q', words)
  if (f.openNow) p.set('openNow', '1')
  for (const key of f.bool) p.set(`f_${key}`, '1')
  for (const [key, v] of Object.entries(f.select)) if (v.length) p.set(`sel_${key}`, v.join(','))
  for (const [key, v] of Object.entries(f.has)) if (v.length) p.set(`has_${key}`, v.join(','))
  if (read && words) p.set('read', '1')
  const qs = p.toString()
  return `${routes.slug(slug, categoryId)}${qs ? `?${qs}` : ''}`
}

/** Words a question starts or ends with that say nothing on the page it
 *  lands on: "where can I buy", "kosher", "please". Not "in", "near",
 *  "open", "best" or "now", which the page reads ("in Rittenhouse" is
 *  inside it, "near" only measures from it). */
const LEAD_FILLER = new Set([
  'where', 'wheres', 'what', 'whats', 'which', 'who', 'how', 'is', 'are', 'there', 'theres', 'can', 'could', 'would', 'should',
  'i', 'im', 'we', 'you', 'a', 'an', 'the', 'some', 'any', 'to', 'for', 'with', 'of', 'that', 'has', 'have', 'sells', 'sell',
  'get', 'buy', 'find', 'looking', 'need', 'want', 'do', 'does', 'kosher', 'jewish', 'frum', 'please', 'pls', 'place', 'places', 'spot', 'spots', 'store', 'stores', 'shop', 'shops',
])

/** What stays in the page's box: what was typed, less the words that named
 *  the page ("grocery") and the filler it started with ("where can I
 *  buy"). "grocery with challah open now" lands as "challah open now". */
export function boxWords(raw: string, named: readonly string[] = []): string {
  const namedWords = new Set(named.flatMap(words))
  const tokens = raw.trim().replace(/[?!.,;:]+$/g, '').split(/\s+/).filter((t) => {
    const ws = words(t)
    return ws.length > 0 && !ws.every((w) => namedWords.has(w))
  })
  const filler = (t: string) => words(t).every((w) => LEAD_FILLER.has(w))
  while (tokens.length > 0 && filler(tokens[0])) tokens.shift()
  while (tokens.length > 0 && filler(tokens[tokens.length - 1])) tokens.pop()
  return tokens.join(' ')
}

// ── What a search means on one category's page ────────────────────────────────

export type CategoryLand = {
  category: CategoryConfig
  filters: LandFilters
  /** The Filters hold everything asked. From the AI reader's reading, the
   *  page then doesn't search the words again (`read=1`); from our own
   *  search, the line can say what it found rather than "10 for …". */
  read: boolean
  /** How many listings the page will show. */
  count: number
  words: string
  href: string
}

/** The search as the category's own page will read it, once it lands there
 *  with the words in its box: how many it shows, and the Filters the words
 *  tick (Open now, a pick-list value said, an item said). The page works
 *  those out from the words itself, so the address carries only the words. */
export function landOn(
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  category: CategoryConfig,
  raw: string,
  { slug, named = [], ...options }: AskOptions & { slug: string; named?: string[] },
): CategoryLand {
  const own = listings.filter((l) => l.category === category.id)
  const words = boxWords(raw, named)
  const result = searchAsk(own, categories, words, { ...options, categoryId: category.id })
  const hasHours = category.detailFields.some((d) => d.type === 'hours' && d.filterable)
  const filters: LandFilters = { openNow: result.query.openNow && hasHours, bool: [], select: {}, has: {} }
  for (const t of result.taught ?? []) {
    if (t.categoryId !== category.id || !t.field) continue
    const field = category.detailFields.find((d) => d.key === t.field && d.filterable)
    if (field?.type === 'boolean' && !filters.bool.includes(field.key)) filters.bool.push(field.key)
    if (field?.type === 'select' && t.value) filters.select[field.key] = [...new Set([...(filters.select[field.key] ?? []), t.value])]
  }
  for (const [key, tags] of searchItems(category, own, result)) filters.has[key] = [...tags.keys()]
  // Everything the words asked is a filter (a taught word or a pick-list
  // value is already out of the terms): the line can say what it found
  // ("10 open now with Challah") rather than "10 for …".
  const covered = new Set([...searchItems(category, own, result).values()].flatMap((m) => [...m.values()]))
  const said = result.terms.every((t) => covered.has(t)) && !result.anchor && !result.place
  // Nothing left to search ("kosher food"): the whole page.
  const count = words ? result.hits.length : own.length
  return { category, filters, read: said, count, words, href: categoryHref(slug, category.id, words, NO_FILTERS, false) }
}

/** A question the AI reader read (see questionReader.ts), on one of the
 *  categories it named: its filters are the page's Filters, all of it. */
export function landOnReading(
  listings: readonly DirectoryResource[],
  category: CategoryConfig,
  reading: Reading,
  raw: string,
  { slug, now }: { slug: string; now: Date | null },
): CategoryLand {
  const c = reading.categories.find((x) => x.id === category.id)
  const own = listings.filter((l) => l.category === category.id)
  const hasHours = category.detailFields.some((d) => d.type === 'hours' && d.filterable)
  const field = itemFields(category)[0]
  const has: Record<string, string[]> = {}
  if (field && reading.items?.length) {
    const known = new Set(itemCounts(own, field.key).map((i) => i.tag.toLowerCase()))
    const items = reading.items.map(itemName).filter((i) => known.has(i.toLowerCase()))
    if (items.length) has[field.key] = items
  }
  const filters: LandFilters = { openNow: !!c?.openNow && hasHours, bool: c?.bool ?? [], select: c?.select ?? {}, has }
  const words = raw.trim()
  return { category, filters, read: true, count: withFilters(own, category, filters, now).length, words, href: categoryHref(slug, category.id, words, filters, true) }
}

/** "10 open now with Challah", "3 Orthodox", "22 listings". */
export function landSub(land: CategoryLand): string {
  const { filters: f, count } = land
  const picked = Object.values(f.select).flat()
  const items = Object.values(f.has).flat()
  const parts = [
    String(count),
    ...picked,
    ...land.category.detailFields.filter((d) => f.bool.includes(d.key)).map((d) => d.filterLabel ?? d.label),
    ...(f.openNow ? ['open now'] : []),
    ...(items.length ? [`with ${items.join(' and ')}`] : []),
  ]
  if (parts.length === 1) {
    if (land.words && !land.read) return `${count} for “${land.words}”`
    return `${count} ${count === 1 ? 'listing' : 'listings'}`
  }
  return parts.join(' ')
}

// ── The lines ─────────────────────────────────────────────────────────────────

export type LinesContext = {
  slug: string
  categories: readonly CategoryConfig[]
  listings: readonly DirectoryResource[]
  /** The home search's own reading of the words, across every category. */
  result: AskResult
  options: AskOptions
  /** The AI reader's reading, when it read this question (see
   *  readingSearch.ts): it decides the categories and their Filters. */
  reading?: Reading | null
  /** "Mincha next at 2 PM · Kahal Kadosh Mikveh Israel, 0.9 mi", for a
   *  minyan question (the home works it out from the schedules). */
  minyanSub?: string | null
  /** The day the first minyan in minyanSub is on, when it isn't today
   *  ("next mincha" in the evening is tomorrow's): Minyanim by time opens
   *  on it (`?day=wed`), not on a today with nothing left. */
  minyanDay?: string | null
  /** "Candles Fri 6:01 PM · Havdalah Sat 6:59 PM", for a zman question. */
  timesSub?: string | null
  /** The home's other cards whose words match (see cardSearch.ts): Patient
   *  & Family Support, the Map, a form. */
  cards?: readonly { id?: string; title: string; href?: string | null; description?: string }[]
  /** How a listing line says where it is and whether it's open. */
  placeSub?: (item: DirectoryResource, category: CategoryConfig) => string
}

const fold = (s: string) => s.toLowerCase().replace(/['’]/g, '').trim()

/** Listings named by what was typed: by the whole of it ("maxx") or every
 *  word starting one of the name's ("trader jo"). Names starting with it
 *  first. */
export function namedListings(listings: readonly DirectoryResource[], raw: string): DirectoryResource[] {
  const typed = fold(raw)
  if (typed.length < 2) return []
  const typedWords = words(raw)
  const scored = listings
    .map((l) => {
      const name = fold(l.name)
      const nameWords = words(l.name)
      const rank = name.startsWith(typed) ? 0 : name.includes(typed) ? 1 : typedWords.length > 0 && typedWords.every((w) => nameWords.some((n) => n.startsWith(w))) ? 2 : -1
      return { l, rank }
    })
    .filter((x) => x.rank >= 0)
  return scored.sort((a, b) => a.rank - b.rank || a.l.name.localeCompare(b.l.name)).map((x) => x.l)
}

export function searchLines(raw: string, ctx: LinesContext): SearchLine[] {
  const q = raw.trim()
  if (!q) return []
  const { slug, categories, listings, result } = ctx
  const ask = result.query
  const byKind = (kind: CategoryConfig['kind']) => categories.find((c) => c.kind === kind)

  // The guide itself: "how do I add a listing" opens + Add (or the Add form
  // of the kind of place it named); "what's on this site" is About.
  if (ask.meta === 'add') {
    const kind = result.categoryIds?.length === 1 ? categories.find((c) => c.id === result.categoryIds![0]) : undefined
    return [
      kind
        ? { key: 'add', kind: 'add', title: `Add a ${kind.label.toLowerCase()} listing`, sub: 'Anyone can add one. An admin checks it first.', href: `${routes.slug(slug, kind.id)}?form=create` }
        : { key: 'add', kind: 'add', title: 'Add to the guide', sub: 'Add a place, or correct one', href: null },
    ]
  }
  if (ask.meta) return [{ key: 'about', kind: 'about', title: 'About the guide', sub: 'What’s here, and who keeps it', href: routes.about(slug) }]

  // A zman: the times page, with the time asked for picked out.
  const zmanim = byKind('zmanim')
  if (ask.times && zmanim) {
    return [{ key: 'times', kind: 'times', title: zmanim.pluralLabel, sub: ctx.timesSub ?? 'Zmanim and Shabbos times', href: `${routes.slug(slug, zmanim.id)}?time=${encodeURIComponent(ask.times)}`, categoryId: zmanim.id }]
  }

  // The eruv.
  const eruv = byKind('eruv')
  if (ask.eruv && eruv) {
    return [{ key: 'eruv', kind: 'eruv', title: eruv.pluralLabel, sub: 'Each eruv’s status this week', href: routes.slug(slug, eruv.id), categoryId: eruv.id }]
  }

  const lines: SearchLine[] = []

  // A minyan: Minyanim by time, which reads the words itself (a tefillah,
  // a day, a shul); then the shuls.
  const shuls = categories.find((c) => c.kind === 'listing' && c.detailFields.some((f) => f.type === 'minyanim'))
  if (ask.minyan && shuls) {
    lines.push({
      key: 'minyanim',
      kind: 'minyanim',
      title: 'Minyanim by time',
      sub: ctx.minyanSub ?? 'Every minyan, by time',
      href: `${routes.slug(slug, shuls.id)}?davening=1${ctx.minyanDay ? `&day=${ctx.minyanDay}` : ''}&q=${encodeURIComponent(q)}`,
      categoryId: shuls.id,
    })
    const n = listings.filter((l) => l.category === shuls.id).length
    lines.push({ key: `category:${shuls.id}`, kind: 'category', title: shuls.pluralLabel, sub: `${n} ${n === 1 ? 'listing' : 'listings'}`, href: routes.slug(slug, shuls.id), categoryId: shuls.id })
  }

  // Places by name.
  const named = namedListings(listings, q).slice(0, 3)
  const placeLines: SearchLine[] = named.flatMap((l) => {
    const category = categories.find((c) => c.id === l.category)
    if (!category) return []
    return [{
      key: `listing:${l.id}`,
      kind: 'listing' as const,
      title: l.name,
      sub: ctx.placeSub?.(l, category) ?? category.label,
      href: routes.listing(slug, category.id, listingSlug(l)),
      categoryId: category.id,
      listing: l,
    }]
  })

  // Kinds of place: each category the search found something in, with
  // what its page would show, most first; a kind of place named comes
  // first even with nothing found ("grocery open now" at midnight).
  const conceptWords = ask.concepts.map((c) => c.word)
  const now = ctx.options.now ?? null
  const lands: CategoryLand[] = []
  if (ctx.reading && ctx.reading.categories.length) {
    for (const c of ctx.reading.categories) {
      const category = categories.find((x) => x.id === c.id && x.kind === 'listing')
      if (category) lands.push(landOnReading(listings, category, ctx.reading, q, { slug, now }))
    }
  } else if (!ask.minyan) {
    const found = new Map<string, number>()
    for (const h of [...result.hits, ...result.noHours]) found.set(h.category.id, (found.get(h.category.id) ?? 0) + 1)
    const ids = [...new Set([...(result.categoryIds ?? []), ...[...found].sort((a, b) => b[1] - a[1]).map(([id]) => id)])]
    for (const id of ids) {
      const category = categories.find((c) => c.id === id && c.kind === 'listing')
      if (!category) continue
      const land = landOn(listings, categories, category, q, { ...ctx.options, slug, named: conceptWords })
      if (land.count > 0 || result.categoryIds?.includes(id)) lands.push(land)
    }
  }
  lands.sort((a, b) => Number(!!result.categoryIds?.includes(b.category.id)) - Number(!!result.categoryIds?.includes(a.category.id)) || b.count - a.count)
  const categoryLines: SearchLine[] = lands.slice(0, 2).map((land) => ({
    key: `category:${land.category.id}`,
    kind: 'category',
    title: land.category.pluralLabel,
    sub: landSub(land),
    href: land.href,
    categoryId: land.category.id,
  }))

  // The home's other cards the words name ("support", "map", "volunteer"),
  // when no kind of place already answers.
  const cardLines: SearchLine[] = (ctx.cards ?? [])
    .filter((c) => !lines.some((l) => l.categoryId === c.id) && !categoryLines.some((l) => l.categoryId === c.id))
    .slice(0, Math.max(0, 2 - categoryLines.length))
    .map((c) => {
      const category = categories.find((x) => x.id === c.id)
      const count = category?.kind === 'listing' ? listings.filter((l) => l.category === category.id).length : null
      return {
        key: `card:${c.id ?? c.title}`,
        kind: 'card' as const,
        title: c.title,
        sub: count !== null ? `${count} ${count === 1 ? 'listing' : 'listings'}` : (c.description ?? ''),
        href: c.href ?? null,
        cardId: c.id,
        categoryId: category?.id,
      }
    })

  // A name typed from its start is the place first ("maxx"), unless the
  // words are a kind of place or an item somewhere ("challah" is Grocery's
  // Challah before it's Challah Corner Bakery); otherwise the kinds of
  // place lead, and the places with the words in their name follow. After
  // a name, a kind of place only when the words meant something there
  // ("Grocery · 1 for “maxx”" is the same place again).
  const nameFirst = named.length > 0 && fold(named[0].name).startsWith(fold(q)) && ask.concepts.length === 0 && !lands.some((l) => l.read)
  if (nameFirst) lines.push(...placeLines, ...categoryLines.filter((_, i) => lands[i].read), ...cardLines)
  else lines.push(...categoryLines, ...cardLines, ...placeLines)
  return lines
}

/** A minyan question's line: "Mincha next at 2 PM · Kahal Kadosh Mikveh
 *  Israel, 0.9 mi", from the first minyan its answer found. */
export function minyanLine(row: { label: string; time: string; shulName: string; miles: number | null; tomorrow: boolean } | undefined, fallback: string): string {
  if (!row) return fallback
  const far = row.miles !== null ? `, ${row.miles < 10 ? row.miles.toFixed(1).replace(/\.0$/, '') : Math.round(row.miles)} mi` : ''
  return `${row.label} next at ${row.time}${row.tomorrow ? ' tomorrow' : ''} · ${row.shulName}${far}`
}


/** A zman question's line: "Candles Friday 6:01 PM · Havdalah Saturday
 *  6:59 PM", "Sunset today 6:24 PM". Null while the times load. */
export function timesLine(times: TimesAsk, zmanim: ZmanimData | null): string | null {
  if (!zmanim) return null
  if (times !== 'candles' && times !== 'havdalah' && times !== 'shabbos') {
    const z = zmanim.dailyZmanim.find((e) => e.label === times)
    return z ? `${z.label} today ${z.time}` : null
  }
  const { candleLighting, havdalah } = zmanim.shabbos
  const parts = [
    times !== 'havdalah' && candleLighting ? `Candles ${candleLighting.label} ${candleLighting.time}` : null,
    times !== 'candles' && havdalah ? `Havdalah ${havdalah.label} ${havdalah.time}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}
