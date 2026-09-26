import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { listingSearchText } from '@/lib/searchListing'
import { haversineMiles } from '@/lib/geo'
import { getOpenStatus } from '@/lib/hours'
import { conceptCategories, initialisms, parseAsk, termMatches, termsRequired, words, type AskQuery } from '@/lib/ask'

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
  /** Straight-line miles from the place asked about ("near HUP") or, failing
   *  that, from the visitor. Null when neither is known or the listing has no
   *  coordinates. */
  miles: number | null
  /** Open right now, by its saved hours. */
  open: boolean
}

export type AskResult = {
  query: AskQuery
  hits: AskHit[]
  /** The categories the question named ("food", "shul"), or null if none. */
  categoryIds: string[] | null
  /** The place the question was about, when it said where: "food at HUP",
   *  "shul near Jefferson". Results are measured from it. */
  anchor: DirectoryResource | null
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
  tags: { tag: string; words: string[] }[]
}

// Every string-array value on a listing (tag fields and their `_sometimes`
// companions), for reporting which tags matched. Same set the old home search
// ranked on.
function listingTags(item: DirectoryResource): string[] {
  const out: string[] = []
  for (const value of Object.values(item)) {
    if (Array.isArray(value) && value.every((x) => typeof x === 'string')) out.push(...(value as string[]))
  }
  return out
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
  const tags = [...new Set(listingTags(item))].map((tag) => ({ tag, words: words(tag) }))
  const p: Prepared = {
    item,
    category,
    hay: [...words(listingSearchText(item, category)), ...words(flags.join(' ')), ...initials],
    ownWords: [...nameWords, ...initials, ...tags.flatMap((t) => t.words), ...words(flags.join(' '))],
    nameWords,
    initials,
    tags,
  }
  byCategory.set(category.id, p)
  return p
}

function hoursKeys(category: CategoryConfig): string[] {
  return category.detailFields.filter((f) => f.type === 'hours').map((f) => f.key)
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
  const empty: AskResult = { query, hits: [], categoryIds: null, anchor: null }
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

    const matchedTags = searchTerms.length
      ? p.tags
          .map(({ tag, words: tw }) => ({ tag, n: searchTerms.filter((t) => termMatches(t, tw)).length }))
          .filter((t) => t.n > 0)
          .sort((a, b) => b.n - a.n || a.tag.length - b.tag.length)
          .slice(0, 3)
          .map((t) => t.tag)
      : []
    const miles = origin && p.item.geo && p.category.hasAddress !== false ? haversineMiles(origin, p.item.geo) : null
    const keys = hoursKeys(p.category)
    const open = keys.length > 0 && getOpenStatus(p.item as Record<string, unknown>, keys, now).isOpen
    hits.push({ item: p.item, category: p.category, score, matchedTags, miles, open })
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      (query.openNow ? Number(b.open) - Number(a.open) : 0) ||
      (a.miles ?? Infinity) - (b.miles ?? Infinity) ||
      (b.item.upvotes ?? 0) - (a.item.upvotes ?? 0) ||
      a.item.name.localeCompare(b.item.name),
  )
  return { query, hits: limit ? hits.slice(0, limit) : hits, categoryIds, anchor }
}
