import type { DirectoryResource } from '@/types'
import { selectValues, type CategoryConfig } from '@/lib/categories'
import { listingSearchText } from '@/lib/searchListing'
import { haversineMiles, type LatLng } from '@/lib/geo'
import { findPlace, townsFrom, type Place } from '@/lib/places'
import { DAY_KEYS, businessClosure, fmt12, getOpenStatus, isStructuredHours, type DayHours } from '@/lib/hours'
import { filterWords, readTaught, type AskWord, type TaughtWord } from '@/lib/askWords'
import { NEAR_ME, conceptCategories, initialisms, parseAsk, termMatches, termsRequired, typedWords, wordMatches, words, type AskQuery, type OpenAt, withoutOpenAt } from '@/lib/ask'

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
  /** For "open after 6" and its kin (AskQuery.openAt): today's hours that
   *  answer it, each named. Empty when none do; null for any other
   *  question. */
  atTime: DayWindow[] | null
}

/** One stretch of a day's hours: "Men's", 4:30 AM to 10:00 AM. */
export type DayWindow = { label: string; opens: string; closes: string }

export type MatchedField = {
  label: string
  text: string
  /** A describing field (see describingFields): what the place offers, so
   *  an answer can count it as having the thing asked for. A hechsher or a
   *  denomination matching doesn't mean the place "has" it. */
  describes: boolean
}

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
  /** The town or neighborhood the question was about, when it named one
   *  that isn't a listing: "food in Cherry Hill", "shul near Center City".
   *  Results are measured from it, and for "in" kept to within it. */
  place: { name: string; inside: boolean; geo: LatLng; radius: number } | null
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
  /** The names of the places left out for "than Giant" (see AskQuery's
   *  `excluding`), each once, for the answer to say "besides GIANT". */
  excluded: string[]
  /** A question read by the reader (readingSearch.ts) can ask "open now"
   *  of some kinds of place and not others: those it asked it of, whose
   *  results then say their hours. */
  openNowIn?: string[]
  /** The words an admin taught the search that the question used ("ikc":
   *  Kosher Cert: IKC), read as filters rather than looked for. */
  taught?: TaughtWord[]
  /** "Within 3 miles" and nothing is: the nearest place that answers the
   *  rest of the question, outside the distance. Never one of `hits`. */
  outside?: AskHit
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
  /** For a place with no item list (a restaurant), the words of its own
   *  descriptions: what it serves, said the only way it's said. Counts as
   *  fully as an item, without forgiving typos in running text. */
  describes: string[]
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
/** A food place with no item list says what it serves in its name and its
 *  own text — "Center City Pretzel Co.", "hand-rolled soft pretzels" — so
 *  those answer "who has pretzels" the way a store's items do. Only food
 *  places: a shul's name matching doesn't mean it "has" anything. And not
 *  where a category lists items: there the list is the answer, and a
 *  description is only a general one. */
export function describedByItsText(category: CategoryConfig): boolean {
  return !category.detailFields.some((f) => f.type === 'tags') && conceptCategories('food', [category]).length > 0
}

function describingFields(category: CategoryConfig) {
  if (!describedByItsText(category)) return []
  return category.detailFields.filter((f) => f.type === 'text' || f.type === 'textarea')
}

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
    describes: describingFields(category).flatMap((f) => (typeof item[f.key] === 'string' ? words(item[f.key] as string) : [])),
  }
  byCategory.set(category.id, p)
  return p
}

/** The listing's own fields, other than its name, address and items, whose
 *  text matched: see AskHit.matchedFields. At most two. */
function matchedFieldsOf(item: DirectoryResource, category: CategoryConfig, terms: string[]): MatchedField[] {
  if (terms.length === 0) return []
  const describing = new Set(describingFields(category).map((f) => f.key))
  const out: MatchedField[] = []
  for (const f of searchableFields(category).detailFields) {
    if (out.length === 2) break
    const v = item[f.key]
    if (f.type === 'boolean') {
      if (v === true && f.label.split(/\s+/).some((w) => wordMatches(w, terms))) out.push({ label: f.label, text: '', describes: false })
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
      if (cut) out.push({ label: f.label, text: cut, describes: describing.has(f.key) })
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

// The towns a set of listings' addresses name, worked out once per set.
const townCache = new WeakMap<readonly DirectoryResource[], Place[]>()
function townsOf(listings: readonly DirectoryResource[]): Place[] {
  let towns = townCache.get(listings)
  if (!towns) townCache.set(listings, (towns = townsFrom(listings)))
  return towns
}

/** A question naming a place to be near: "food near Jefferson", "shul by
 *  Penn", "kosher food at HUP". */
const SAYS_WHERE = /\b(?:near|nearest|nearby|at|by|around|close to|closest to|next to|across from|walking distance|(?:miles?|mi|minutes?|mins?|blocks?|walk|drive) (?:of|from))\b/i

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

/** Today's hours that answer "open after 6", "open until 10", "open at
 *  8am". A place that closes after midnight ("11:00 AM to 1:00 AM") is open
 *  after 10 PM, not closed before it opened. */
function hoursAt(item: DirectoryResource, category: CategoryConfig, now: Date, at: OpenAt): DayWindow[] {
  if (businessClosure(item as Record<string, unknown>)) return []
  const out: DayWindow[] = []
  for (const f of category.detailFields) {
    const v = item[f.key]
    if (f.type !== 'hours' || !isStructuredHours(v)) continue
    const day = (v as Record<string, DayHours>)[DAY_KEYS[now.getDay()]]
    if (!day?.open || !day.close) continue
    const opens = toMinutes(day.open)
    let closes = toMinutes(day.close)
    if (closes <= opens) closes += 1440
    const t = at.minutes
    const fits =
      at.how === 'after' ? closes > t
      : at.how === 'until' ? opens < t && closes >= t
      : at.how === 'at' ? opens <= t && closes > t
      : opens < t
    if (fits) out.push({ label: f.label.replace(/\s*hours$/i, '').trim(), opens: fmt12(day.open), closes: fmt12(day.close) })
  }
  return out
}

/** Finds the place a question is about. Only asked when the question also
 *  named a kind of place ("food at HUP"): on its own, "HUP" is simply a search
 *  for that listing. A match is a listing outside the categories asked for
 *  whose initials are one of the leftover words, or whose name has all of
 *  them. Returns the words it used up so they aren't searched for again. */
/** A category page's own filter values as words (askWords.ts's
 *  filterWords), from the values its listings have. Worked out once per
 *  set of listings. */
const pageWordsCache = new WeakMap<readonly DirectoryResource[], WeakMap<CategoryConfig, AskWord[]>>()
function pageWords(listings: readonly DirectoryResource[], category: CategoryConfig): AskWord[] {
  let byCategory = pageWordsCache.get(listings)
  if (!byCategory) pageWordsCache.set(listings, (byCategory = new WeakMap()))
  let out = byCategory.get(category)
  if (!out) {
    const own = listings.filter((l) => l.category === category.id)
    out = filterWords(category, (key) => [...new Set(own.flatMap((l) => selectValues(l[key])))])
    byCategory.set(category, out)
  }
  return out
}

/** Every word that describes listings rather than names one: their items,
 *  types and other picks ("meat", "dairy", "challah"). Worked out once per
 *  set of listings. */
const describingCache = new WeakMap<readonly DirectoryResource[], Set<string>>()
function describingWords(listings: readonly DirectoryResource[], all: Prepared[]): Set<string> {
  let out = describingCache.get(listings)
  if (!out) {
    out = new Set(all.flatMap((p) => p.tags.flatMap((t) => t.words)))
    describingCache.set(listings, out)
  }
  return out
}

function findAnchor(
  terms: string[],
  all: Prepared[],
  categoryIds: string[],
  saysWhere: boolean,
  describing: ReadonlySet<string>,
): { anchor: DirectoryResource; used: string[] } | null {
  if (terms.length === 0) return null
  const candidates = all.filter((p) => !categoryIds.includes(p.category.id) && p.item.geo)
  for (const p of candidates) {
    const used = terms.filter((t) => p.initials.includes(t))
    if (used.length) return { anchor: p.item, used }
  }
  // A name only when the question says it's a place to be near, or when
  // the words find nothing of the kind asked for otherwise: "grocery store
  // with pretzels" is asking for pretzels (a grocery has them), not for the
  // grocery closest to Center City Pretzel Co.; "food jefferson" finds no
  // food called Jefferson, so it's about the hospital.
  const foundAsAsked = all.some((p) => categoryIds.includes(p.category.id) && terms.every((t) => termMatches(t, p.hay, 3, false)))
  if (!saysWhere && foundAsAsked) return null
  // Words that only describe places ("meat") name one only as most of its
  // name: "Shlomo's Kosher Meat & Fish Market" isn't "near meat". A word
  // that describes nothing ("jefferson", "shlomos") is the place it's in
  // the name of.
  for (const p of candidates) {
    if (!terms.every((t) => p.nameWords.includes(t))) continue
    if (terms.every((t) => describing.has(t)) && terms.length * 2 <= p.nameWords.length) continue
    return { anchor: p.item, used: terms }
  }
  return null
}

/** Whether a place is open now by its saved hours, when it closes, and
 *  what's still to come today: the same reading for every search, so a
 *  place is never "open" in one answer and closed in another. `open` is
 *  null when it has no hours saved (see AskHit). */
export function openState(item: DirectoryResource, category: CategoryConfig, now: Date, at: OpenAt | null = null): Pick<AskHit, 'open' | 'closesAt' | 'today' | 'atTime'> & { known: boolean } {
  const keys = hoursKeys(category)
  const status = keys.length > 0 ? getOpenStatus(item as Record<string, unknown>, keys, now) : null
  const known = hasHours(item, category)
  // A closed business is closed whether or not it has hours saved.
  const open = status?.isOpen ? true : known || status?.closure ? false : null
  return {
    open,
    closesAt: status?.closing?.closeLabel ?? null,
    today: known ? hoursToday(item, category, now) : [],
    atTime: at ? (known ? hoursAt(item, category, now, at) : []) : null,
    known,
  }
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
  /** The community's own neighborhoods (see places.ts). Towns come from
   *  the listings' addresses without being given. */
  places?: readonly Place[]
}

export function searchAsk(
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  input: string,
  { coords = null, now = new Date(), categoryId, limit, places = [] }: AskOptions = {},
): AskResult {
  const query = parseAsk(input)
  const empty: AskResult = { query, hits: [], categoryIds: null, anchor: null, closedCount: 0, noHours: [], terms: [], excluded: [], place: null }
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

  // A town or neighborhood named ("in Cherry Hill"): its words are where,
  // not what. Unless they're a listing's own name being looked up —
  // "center city pretzel" is the store, not pretzels near Center City.
  // Only a listing of the kind asked for: "shul near center city" isn't
  // looking up the Cambria Hotel … Center City.
  const namesListing = (ws: string[], ids: string[] | null) =>
    ws.length > 0 && all.some((p) => (!ids || ids.includes(p.category.id)) && ws.every((t) => p.nameWords.includes(t)))
  const lookingUp = namesListing(terms, categoryIds)
  // Where is read without "open at 8am": that "at" names a time, not a place.
  const whereText = query.openAt ? withoutOpenAt(query.raw) : query.raw
  const placeSaid = findPlace(whereText, [...places, ...townsOf(listings)])
  const named = placeSaid && (placeSaid.introduced || !lookingUp) ? placeSaid : null
  const placeless = named ? terms.filter((t) => !named.used.includes(t)) : terms

  // Words an admin taught the search ("ikc" is Kosher Cert: IKC): filters,
  // not text to look for (see askWords.ts). After the place, so "cherry
  // hill" stays a town and never becomes the Cherry-K hechsher. Not in a
  // name looked up, when they're most of it: "dairy queen", but not
  // "dairy" for a Dairy Barn.
  const looksUp = all.some(
    (p) => (!categoryIds || categoryIds.includes(p.category.id)) && placeless.every((t) => p.nameWords.includes(t)) && placeless.length * 2 > p.nameWords.length,
  )
  // On a category page, its own filters' values work the same way:
  // "orthodox" on Synagogues is the Denomination filter (see filterWords).
  const withPageWords = categoryId ? categories.map((c) => (c.id === categoryId ? { ...c, askWords: [...(c.askWords ?? []), ...pageWords(listings, c)] } : c)) : categories
  const taught = readTaught(placeless, withPageWords, { categoryIds, categoryId, lookingUp: placeless.length > 0 && looksUp })
  categoryIds = taught.categoryIds
  const unplaced = taught.terms

  // Somewhere named with "near"/"at" counts without a kind of place too:
  // "sushi near HUP" is measured from HUP.
  // "Near me" is the visitor, not a place to find among the words: it
  // made "meat near me" the closest to Shlomo's Kosher Meat in Baltimore.
  const saysWhere = SAYS_WHERE.test(whereText.replace(NEAR_ME, ' '))
  // And once a town or neighbourhood is found, that's where: "meat near
  // rittenhouse" isn't also near a listing with Meat in its name.
  const found = !named && (categoryIds || saysWhere) ? findAnchor(unplaced, all, categoryIds ?? [], saysWhere, describingWords(listings, all)) : null
  const anchor = found?.anchor ?? null
  const searchTerms = found ? unplaced.filter((t) => !found.used.includes(t)) : unplaced
  const origin = anchor?.geo ?? named?.place.geo ?? coords ?? null
  // A place named with nothing else to look for ("cherry hill") is every
  // listing in it.
  const inside = named && (named.inside || (searchTerms.length === 0 && !categoryIds)) ? named.place : null

  // With nothing left to look for, the question was only a kind of place
  // ("kosher food", "shul near me"): every listing of that kind answers it.
  // "What's open after 10" asks about every kind of place, though: the
  // hours are what's being looked for.
  const asksHours = query.openNow || query.openToday || !!query.openAt
  if (searchTerms.length === 0 && !categoryIds && !categoryId && !named && !asksHours) return empty

  // The word still being typed is scored but not required (see AskQuery's
  // `partial`), and may be as short as a letter, since the others narrow it.
  const partial = query.partial && searchTerms.at(-1) === query.partial ? query.partial : null
  const required = partial ? searchTerms.slice(0, -1) : searchTerms
  const needed = termsRequired(required.length)
  const hits: AskHit[] = []
  const excluded = new Set<string>()
  for (const p of all) {
    if (categoryId && p.category.id !== categoryId) continue
    if (categoryIds && !categoryIds.includes(p.category.id)) continue
    // "What's open" with nothing else asked: only kinds of place that keep
    // hours. A WhatsApp group isn't a place with "no hours listed".
    if (asksHours && searchTerms.length === 0 && !categoryIds && !categoryId && hoursKeys(p.category).length === 0) continue
    if (anchor && p.item === anchor) continue
    if (!taught.passes(p.item)) continue
    if (query.excluding.length && query.excluding.every((w) => termMatches(w, p.nameWords, 3, false))) {
      excluded.add(p.item.name)
      continue
    }

    let score = 0
    let matched = 0
    // A word in the listing's name or items is worth more than one that only
    // turns up elsewhere (its address, a Google description saying "most sell
    // wine"), but name and items count the same: "meat restaurant" should put
    // the nearest meat restaurant first, not the farthest place called Meat.
    // Typos are forgiven only in the name and items. A restaurant's own
    // description counts as its items: "pretzels" puts the pretzel bakery
    // level with a store stocking pretzel buns, nearest first.
    const scoreTerm = (t: string, minPrefix?: number) =>
      termMatches(t, p.ownWords, minPrefix) || termMatches(t, p.describes, minPrefix, false)
        ? 10
        : termMatches(t, p.hay, minPrefix, false)
          ? 7
          : 0
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
    const { open, closesAt, today, atTime } = openState(p.item, p.category, now, query.openAt)
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
      closesAt,
      today,
      atTime,
    })
  }

  // "Open now" is a condition, not a preference: a closed place doesn't
  // answer "which meat restaurants are open now", however well it matches.
  // It used to only sort open places first, so a better-matching closed one
  // still came out on top.
  // "Within 15 minutes' drive" is a condition too, measured from the place
  // asked about or the visitor. With neither known there's nothing to
  // measure from, so it can't rule anything out; the answer says so.
  const inReach = (h: AskHit) =>
    (!query.within || !origin || (h.miles !== null && h.miles <= query.within.miles)) &&
    (!inside || (!!h.item.geo && haversineMiles(inside.geo, h.item.geo) <= inside.radius))
  const openEnough = (h: AskHit) =>
    query.openAt ? !!h.atTime?.length : query.openNow ? h.open === true : query.openToday ? h.today.length > 0 : true
  const asksOpen = query.openNow || query.openToday || !!query.openAt
  const answering = hits.filter((h) => openEnough(h) && inReach(h))
  const noHours = asksOpen ? hits.filter((h) => h.open === null && inReach(h)) : []
  // "Best pizza": neighbors' upvotes first, the only ranking the guide has.
  const byMatch = (a: AskHit, b: AskHit) =>
      (query.best ? (b.item.upvotes ?? 0) - (a.item.upvotes ?? 0) : 0) ||
      b.score - a.score ||
      (a.miles ?? Infinity) - (b.miles ?? Infinity) ||
      (b.item.upvotes ?? 0) - (a.item.upvotes ?? 0) ||
      a.item.name.localeCompare(b.item.name)
  answering.sort(byMatch)
  noHours.sort(byMatch)
  // "Within 3 miles" with nothing in it: the nearest that answers all the
  // rest, for the answer to name as outside it, never in the list.
  const outside = query.within && origin && answering.length === 0
    ? (hits.filter((h) => openEnough(h) && h.miles !== null && !inReach(h)).sort((a, b) => a.miles! - b.miles!)[0] ?? null)
    : null
  return {
    query,
    hits: limit ? answering.slice(0, limit) : answering,
    categoryIds,
    anchor,
    closedCount: asksOpen ? hits.filter((h) => !openEnough(h) && h.open !== null && inReach(h)).length : 0,
    noHours,
    terms: searchTerms,
    excluded: [...excluded],
    place: named ? { name: named.place.name, inside: !!inside, geo: named.place.geo, radius: named.place.radius } : null,
    ...(taught.used.length ? { taught: taught.used } : {}),
    ...(outside ? { outside } : {}),
  }
}

/** A looser version of a question that found nothing, and what it found:
 *  "packaged pretzels" finds nothing, "pretzels" finds three places. */
export type NearMiss = {
  /** The words kept and the words dropped, as typed. */
  kept: string
  dropped: string
  result: AskResult
}

/**
 * When a question finds nothing, the closest thing the guide does have: the
 * same question with a searched word or two left out, keeping as many as
 * still find something. Only words that were searched for are ever dropped
 * — never the kind of place or where — and a looser question that leaves
 * nothing to look for but a kind of place ("vegan food" → every food place)
 * doesn't count, unless it was about somewhere ("vegan food near HUP" →
 * the food nearest HUP), which is exactly what's close. Null when nothing
 * looser finds anything either, or for a minyan question, which the
 * schedules answer.
 */
export function nearMiss(
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  input: string,
  options: AskOptions = {},
): NearMiss | null {
  const query = parseAsk(input)
  if (!query.raw || query.minyan) return null
  // Nothing in the place asked about ("shul in the northeast"): what's
  // closest to it is what's close.
  const strict = searchAsk(listings, categories, input, options)
  if (strict.place?.inside) {
    const near = searchAsk(listings, categories, `${query.raw.replace(/\b(in|within)\b/gi, 'near')} `, options)
    if (near.hits.length) return { kept: `near ${strict.place.name}`, dropped: 'in', result: near }
  }
  const typed = typedWords(query.raw, query.terms)
  const searched = typed.flatMap((w, i) => (w.term ? [i] : []))
  if (searched.length === 0) return null

  const tryWithout = (drop: number[]): NearMiss | null => {
    // A trailing space: nothing left is a word still being typed.
    const looser = typed.filter((_, i) => !drop.includes(i)).map((w) => w.word).join(' ') + ' '
    const result = searchAsk(listings, categories, looser, options)
    if (result.hits.length === 0 || (result.terms.length === 0 && !result.anchor)) return null
    return {
      kept: typed.filter((w, i) => w.term && !drop.includes(i)).map((w) => w.word).join(' '),
      dropped: drop.map((i) => typed[i].word).join(' '),
      result,
    }
  }
  // Better is: more of what was asked kept, then more places that list it
  // as an item, then more places.
  const rank = (m: NearMiss) => [m.kept.split(' ').length, m.result.hits.filter((h) => h.matched.length).length, m.result.hits.length]
  const better = (a: NearMiss, b: NearMiss) => {
    const [x, y] = [rank(a), rank(b)]
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i]
    return false
  }
  const pick = (drops: number[][]) =>
    drops.reduce<NearMiss | null>((best, d) => {
      const m = tryWithout(d)
      return m && (!best || better(m, best)) ? m : best
    }, null)

  const one = searched.length > 1 || query.concepts.length > 0 ? pick(searched.map((i) => [i])) : null
  if (one || searched.length < 3) return one
  const pairs = searched.flatMap((a, x) => searched.slice(x + 1).map((b) => [a, b]))
  return pick(pairs)
}
