import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { listingSearchText } from '@/lib/searchListing'
import { haversineMiles } from '@/lib/geo'
import { DAY_KEYS, businessClosure, fmt12, getOpenStatus, isStructuredHours, type DayHours } from '@/lib/hours'
import { conceptCategories, initialisms, parseAsk, termMatches, termsRequired, wordMatches, words, type AskQuery } from '@/lib/ask'

// Runs an `ask` query (see ask.ts) against the listings a page already holds.
// Shared by the home search, every category page's own search box and the
// map, so a place found in one is found in the others.

export type AskHit = {
  item: DirectoryResource
  category: CategoryConfig
  /** Higher is a better match. Only meaningful relative to other hits. */
  score: number
  /** The listing's tags that the query matched, best first — "Chalav Yisroel
   *  Milk" for "cholov yisroel". */
  matchedTags: string[]
  /** The same, with whether each is only sometimes in stock (a tag field's
   *  `_sometimes` companion). What a result shows as the reason it's there:
   *  a list of stores for "wine" said nothing about wine until you opened one. */
  matched: { tag: string; sometimes: boolean }[]
  /** The other things about it the query matched, when not an item: its
   *  hechsher, a note, a yes/no field that's on ("Shabbat Friendly") — each
   *  with the field's label and the matching text, cut down around the
   *  match. What a result shows as its reason when there's no item to show:
   *  "OU restaurants" used to list places with nothing to say why. */
  matchedFields: MatchedField[]
  /** Straight-line miles from the place asked about ("near HUP") or, failing
   *  that, from the visitor. Null when neither is known or the listing has no
   *  coordinates. */
  miles: number | null
  /** Open right now, by its saved hours; null when it has no hours saved at
   *  all, which is not the same as closed — a mikvah nobody has entered hours
   *  for may well be open, and saying "closed" would be the guide making it up. */
  open: boolean | null
  /** When it closes today, "9:00 PM", while it's open; otherwise null. */
  closesAt: string | null
  /** Each of its hours still to come today, open ones first, then by when
   *  they open: a mikvah's men's hours this morning, its women's tonight.
   *  What an answer names, so "open" says which part is open. */
  today: HoursWindow[]
}

export type MatchedField = { label: string; text: string }

/** Why a listing turned up for a search, as a page shows it: the items and
 *  other fields that matched, and the words to bold in them. Carried from a
 *  search result into the listing it opens, so the listing can mark what
 *  was asked for instead of leaving it to be found again. */
export type SearchFound = {
  terms: string[]
  items: { tag: string; sometimes: boolean }[]
  fields: MatchedField[]
}

export type HoursWindow = {
  /** Which hours these are — the field's label less "Hours": "Men's",
   *  "Keilim". Empty for a category's plain Hours. */
  label: string
  opens: string
  closes: string
  /** Open right now, rather than later today. */
  openNow: boolean
}

export type AskResult = {
  query: AskQuery
  hits: AskHit[]
  /** The categories the question named ("food", "shul"), or null if none. */
  categoryIds: string[] | null
  /** The place the question was about, when it said where: "food at HUP",
   *  "shul near Jefferson". Results are measured from it. */
  anchor: DirectoryResource | null
  /** For an "open now" or "open today" question: how many places matched
   *  but are closed then, and so aren't in `hits`. Lets the page say "none
   *  open right now" instead of showing nothing, or showing closed places as
   *  answers. */
  closedCount: number
  /** For the same questions: places that matched but have no hours saved.
   *  Kept out of `hits` (the map and category pages show only what's known
   *  to be open) but not counted as closed; the home screen lists them after
   *  the open ones, marked as having no hours listed. */
  noHours: AskHit[]
  /** The words the listings were searched for, once kinds of place and the
   *  place asked about are taken out — what to highlight in a result. */
  terms: string[]
}

type Prepared = {
  item: DirectoryResource
  category: CategoryConfig
  /** Every word a listing can be found by: name, address, tags, details,
   *  and the name's initials. */
  hay: string[]
  /** The name's and the tags' words: what a listing says it is, as against
   *  what an address or a Google description happens to mention. */
  ownWords: string[]
  nameWords: string[]
  initials: string[]
  tags: { tag: string; words: string[]; sometimes: boolean }[]
}

// Every string-array value on a listing (tag fields and their `_sometimes`
// companions), for reporting which tags matched. Same set the old home search
// ranked on. A tag listed both ways counts as always.
function listingTags(item: DirectoryResource): { tag: string; sometimes: boolean }[] {
  const out = new Map<string, boolean>()
  for (const [key, value] of Object.entries(item)) {
    if (!Array.isArray(value) || !value.every((x) => typeof x === 'string')) continue
    const sometimes = key.endsWith('_sometimes')
    for (const tag of value as string[]) out.set(tag, (out.get(tag) ?? true) && sometimes)
  }
  return [...out].map(([tag, sometimes]) => ({ tag, sometimes }))
}

// A store's Google description says what the chain sells in general ("imported
// cheeses", "most sell wine"), not what this one has that's kosher: that's
// what its item list is for, and a match only in the description put Di
// Bruno Bros. forward for "cheese" when nobody had listed a kosher cheese
// there. So where a category lists items, the description isn't searched.
// A restaurant's is — everything a kosher restaurant serves is kosher, and
// "pretzels" finding the pretzel bakery is the description doing its job.
function searchableFields(category: CategoryConfig): CategoryConfig {
  if (!category.detailFields.some((f) => f.type === 'tags')) return category
  return { ...category, detailFields: category.detailFields.filter((f) => f.key !== 'googleDescription') }
}

// The per-listing words, worked out once per listing object. A page searches
// the same few hundred listings on every keystroke, so this is what keeps a
// keystroke cheap.
const prepared = new WeakMap<DirectoryResource, Map<string, Prepared>>()
function prepare(item: DirectoryResource, category: CategoryConfig): Prepared {
  let byCategory = prepared.get(item)
  if (!byCategory) prepared.set(item, (byCategory = new Map()))
  const hit = byCategory.get(category.id)
  if (hit) return hit
  const initials = initialisms(item.name)
  // A yes/no field that's on says something about the place in its label
  // ("Shabbat Friendly"), which listingSearchText leaves out.
  const flags = category.detailFields.filter((f) => f.type === 'boolean' && item[f.key] === true).map((f) => f.label)
  const nameWords = words(item.name)
  const tags = listingTags(item).map(({ tag, sometimes }) => ({ tag, words: words(tag), sometimes }))
  const p: Prepared = {
    item,
    category,
    hay: [...words(listingSearchText(item, searchableFields(category))), ...words(flags.join(' ')), ...initials],
    ownWords: [...nameWords, ...initials, ...tags.flatMap((t) => t.words), ...words(flags.join(' '))],
    nameWords,
    initials,
    tags,
  }
  byCategory.set(category.id, p)
  return p
}

/** The listing's own fields, other than its name, address and items, whose
 *  text matched: see AskHit.matchedFields. At most two. */
function matchedFieldsOf(item: DirectoryResource, category: CategoryConfig, terms: string[]): MatchedField[] {
  if (terms.length === 0) return []
  const out: MatchedField[] = []
  for (const f of searchableFields(category).detailFields) {
    if (out.length === 2) break
    const v = item[f.key]
    if (f.type === 'boolean') {
      if (v === true && f.label.split(/\s+/).some((w) => wordMatches(w, terms))) out.push({ label: f.label, text: '' })
      continue
    }
    let text: string | null = null
    if (f.type === 'select') {
      const values = (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []) as string[]
      text = values.map((val) => f.options?.find((o) => o.value === val)?.label ?? val).join(', ') || null
    } else if ((f.type === 'text' || f.type === 'textarea') && typeof v === 'string' && v.trim()) {
      text = v.trim()
    }
    if (text) {
      const cut = snippetAround(text, terms)
      if (cut) out.push({ label: f.label, text: cut })
    }
  }
  return out
}

/** The text around its first matching word, about a line's worth, or null
 *  if no word in it matches. */
function snippetAround(text: string, terms: string[], room = 90): string | null {
  const flat = text.replace(/\s+/g, ' ')
  for (const m of flat.matchAll(/[\p{L}\p{N}'’]+/gu)) {
    if (!wordMatches(m[0], terms)) continue
    if (flat.length <= room) return flat
    const at = m.index ?? 0
    let start = Math.max(0, at - 30)
    if (start > 0) start = flat.indexOf(' ', start) + 1 || start
    let end = Math.min(flat.length, start + room)
    if (end < flat.length) end = flat.lastIndexOf(' ', end) > at ? flat.lastIndexOf(' ', end) : end
    return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`
  }
  return null
}

/** What a result carries into the listing it opens: see SearchFound. Null
 *  when nothing beyond the name matched. */
export function foundFor(hit: AskHit, result: AskResult): SearchFound | null {
  if (!hit.matched.length && !hit.matchedFields.length) return null
  return { terms: result.terms, items: hit.matched, fields: hit.matchedFields }
}

function hoursKeys(category: CategoryConfig): string[] {
  return category.detailFields.filter((f) => f.type === 'hours').map((f) => f.key)
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Whether any of a listing's hours fields has a day with times in it. An
 *  hours field saved with every day empty says nothing, same as none. */
function hasHours(item: DirectoryResource, category: CategoryConfig): boolean {
  return hoursKeys(category).some((k) => {
    const v = item[k]
    return isStructuredHours(v) && Object.values(v).some((d) => !!d?.open && !!d?.close)
  })
}

/** The hours still ahead today, one per hours field: open now, or opening
 *  later today. Reads the day and time the same way getOpenStatus does, so
 *  the two never disagree about whether a place is open. */
function hoursToday(item: DirectoryResource, category: CategoryConfig, now: Date): HoursWindow[] {
  if (businessClosure(item as Record<string, unknown>)) return []
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const out: (HoursWindow & { at: number })[] = []
  for (const f of category.detailFields) {
    const v = item[f.key]
    if (f.type !== 'hours' || !isStructuredHours(v)) continue
    const day = (v as Record<string, DayHours>)[DAY_KEYS[now.getDay()]]
    if (!day?.open || !day.close || nowMinutes > toMinutes(day.close)) continue
    out.push({
      label: f.label.replace(/\s*hours$/i, '').trim(),
      opens: fmt12(day.open),
      closes: fmt12(day.close),
      openNow: nowMinutes >= toMinutes(day.open),
      at: toMinutes(day.open),
    })
  }
  // What's open now first, then the rest in the order they open.
  return out.sort((a, b) => Number(b.openNow) - Number(a.openNow) || a.at - b.at).map((w) => ({ label: w.label, opens: w.opens, closes: w.closes, openNow: w.openNow }))
}

/** Finds the place a question is about. Only asked when the question also
 *  named a kind of place ("food at HUP"): on its own, "HUP" is simply a search
 *  for that listing. A match is a listing outside the categories asked for
 *  whose initials are one of the leftover words, or whose name has all of
 *  them. Returns the words it used up so they aren't searched for again. */
function findAnchor(
  terms: string[],
  all: Prepared[],
  categoryIds: string[],
): { anchor: DirectoryResource; used: string[] } | null {
  if (terms.length === 0) return null
  const candidates = all.filter((p) => !categoryIds.includes(p.category.id) && p.item.geo)
  for (const p of candidates) {
    const used = terms.filter((t) => p.initials.includes(t))
    if (used.length) return { anchor: p.item, used }
  }
  for (const p of candidates) {
    if (terms.every((t) => p.nameWords.includes(t))) return { anchor: p.item, used: terms }
  }
  return null
}

export type AskOptions = {
  /** The visitor's location, when they've given one. */
  coords?: { lat: number; lng: number } | null
  /** For "open now". Defaults to the real clock. */
  now?: Date
  /** Limit the search to one category (a category page's own search box).
   *  The question's own category words are then ignored rather than
   *  required: on the Restaurants page, "kosher food" means restaurants. */
  categoryId?: string
  /** At most this many hits. Defaults to all of them. */
  limit?: number
}

export function searchAsk(
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  input: string,
  { coords = null, now = new Date(), categoryId, limit }: AskOptions = {},
): AskResult {
  const query = parseAsk(input)
  const empty: AskResult = { query, hits: [], categoryIds: null, anchor: null, closedCount: 0, noHours: [], terms: [] }
  if (!query.raw) return empty

  const configById = new Map(categories.map((c) => [c.id, c]))
  const all: Prepared[] = []
  for (const item of listings) {
    const category = configById.get(item.category)
    if (category) all.push(prepare(item, category))
  }

  // A kind of place this community has no category for stays a word to look
  // for, so "mikvah" still finds a listing that mentions one.
  const terms = [...query.terms]
  let categoryIds: string[] | null = null
  if (!categoryId) {
    for (const { concept, word } of query.concepts) {
      const ids = conceptCategories(concept, categories)
      if (ids.length) categoryIds = [...new Set([...(categoryIds ?? []), ...ids])]
      else terms.push(word)
    }
  }

  const found = categoryIds ? findAnchor(terms, all, categoryIds) : null
  const anchor = found?.anchor ?? null
  const searchTerms = found ? terms.filter((t) => !found.used.includes(t)) : terms
  const origin = anchor?.geo ?? coords ?? null

  // With nothing left to look for, the question was only a kind of place
  // ("kosher food", "shul near me"): every listing of that kind answers it.
  if (searchTerms.length === 0 && !categoryIds && !categoryId) return empty

  // The word still being typed is scored but not required (see AskQuery's
  // `partial`), and may be as short as a letter, since the others narrow it.
  const partial = query.partial && searchTerms.at(-1) === query.partial ? query.partial : null
  const required = partial ? searchTerms.slice(0, -1) : searchTerms
  const needed = termsRequired(required.length)
  const hits: AskHit[] = []
  for (const p of all) {
    if (categoryId && p.category.id !== categoryId) continue
    if (categoryIds && !categoryIds.includes(p.category.id)) continue
    if (anchor && p.item === anchor) continue

    let score = 0
    let matched = 0
    // A word in the listing's name or items is worth more than one that only
    // turns up elsewhere (its address, a Google description saying "most sell
    // wine"), but name and items count the same: "meat restaurant" should put
    // the nearest meat restaurant first, not the farthest place called Meat.
    // Typos are forgiven only in the name and items.
    const scoreTerm = (t: string, minPrefix?: number) =>
      termMatches(t, p.ownWords, minPrefix) ? 10 : termMatches(t, p.hay, minPrefix, false) ? 7 : 0
    for (const t of required) {
      const s = scoreTerm(t)
      if (!s) continue
      matched++
      score += s
    }
    if (matched < needed) continue
    const partialScore = partial ? scoreTerm(partial, 1) : 0
    if (partialScore) {
      matched++
      score += partialScore
    }
    if (searchTerms.length && matched === searchTerms.length) score += 5

    const matchedItems = searchTerms.length
      ? p.tags
          .map(({ tag, words: tw, sometimes }) => ({ tag, sometimes, n: searchTerms.filter((t) => termMatches(t, tw)).length }))
          .filter((t) => t.n > 0)
          .sort((a, b) => b.n - a.n || a.tag.length - b.tag.length)
          .slice(0, 3)
          .map(({ tag, sometimes }) => ({ tag, sometimes }))
      : []
    const matchedTags = matchedItems.map((m) => m.tag)
    const miles = origin && p.item.geo && p.category.hasAddress !== false ? haversineMiles(origin, p.item.geo) : null
    const keys = hoursKeys(p.category)
    const status = keys.length > 0 ? getOpenStatus(p.item as Record<string, unknown>, keys, now) : null
    const known = hasHours(p.item, p.category)
    // A closed business is closed whether or not it has hours saved.
    const open = status?.isOpen ? true : known || status?.closure ? false : null
    hits.push({
      item: p.item,
      category: p.category,
      score,
      matchedTags,
      matched: matchedItems,
      // Only when no item explains it: a store found by "cheese" doesn't
      // need its Google description quoted as well.
      matchedFields: matchedItems.length ? [] : matchedFieldsOf(p.item, p.category, searchTerms),
      miles,
      open,
      closesAt: status?.closing?.closeLabel ?? null,
      today: known ? hoursToday(p.item, p.category, now) : [],
    })
  }

  // "Open now" is a condition, not a preference: a closed place doesn't
  // answer "which meat restaurants are open now", however well it matches.
  // It used to only sort open places first, so a better-matching closed one
  // still came out on top.
  // "Within 15 minutes' drive" is a condition too, measured from the place
  // asked about or the visitor. With neither known there's nothing to
  // measure from, so it can't rule anything out; the answer says so.
  const inReach = (h: AskHit) => !query.within || !origin || (h.miles !== null && h.miles <= query.within.miles)
  const openEnough = (h: AskHit) => (query.openNow ? h.open === true : query.openToday ? h.today.length > 0 : true)
  const asksOpen = query.openNow || query.openToday
  const answering = hits.filter((h) => openEnough(h) && inReach(h))
  const noHours = asksOpen ? hits.filter((h) => h.open === null && inReach(h)) : []
  const byMatch = (a: AskHit, b: AskHit) =>
      b.score - a.score ||
      (a.miles ?? Infinity) - (b.miles ?? Infinity) ||
      (b.item.upvotes ?? 0) - (a.item.upvotes ?? 0) ||
      a.item.name.localeCompare(b.item.name)
  answering.sort(byMatch)
  noHours.sort(byMatch)
  return {
    query,
    hits: limit ? answering.slice(0, limit) : answering,
    categoryIds,
    anchor,
    closedCount: asksOpen ? hits.filter((h) => !openEnough(h) && h.open !== null && inReach(h)).length : 0,
    noHours,
    terms: searchTerms,
  }
}
