import { selectValues, type CategoryConfig } from './categories'
import { filterFields, keepsHours, type MapFilterState } from './mapFilters'
import { neighborhoodsFor, townsFrom } from './places'
import { itemName } from './itemNames'
import type { LatLng } from './geo'
import type { DirectoryResource } from '@/types'

// ── Reading a question into filters (decided Sep 30) ────────────────────────
// An AI reads what someone typed and says which of the site's own filters
// it means: "meat open now, all synagogues regardless, and the shabbos
// friendly hotels" is Food with Meat and Open now, Synagogues, and Hotels
// that are Shabbat friendly. It never writes the answer, and it can't
// invent anything: it picks from what the site has (the vocabulary below),
// and whatever it says that isn't there is dropped (tidyReading). The
// site's own search then answers from the listings, with their sources
// and dates, as it always does.
//
// A reading is the Map page's filters (mapFilters.ts), plus what those
// can't hold: items to look for ("challah"), a place to be near, how far.

export type Reading = {
  categories: { id: string; openNow?: boolean; bool?: string[]; select?: Record<string, string[]> }[]
  /** Items or dishes to look for, as the site names them ("Challah"). */
  items?: string[]
  /** "me" (the visitor), or a place the site knows (a hospital, a town). */
  near?: string | null
  withinMiles?: number | null
  sortByDistance?: boolean
  /** Narrower filters the question might mean but the reader wasn't sure
   *  of ("restaurant": Type: Restaurant, or any food place). Not applied:
   *  the page offers them, so an unsure reading asks rather than narrows. */
  maybe?: Reading['categories']
  /** Where `near` is, when it's a place: filled in by the server from the
   *  site's own places (placeFor), never by the AI, so a page can measure
   *  from it without knowing every hospital and neighbourhood itself. */
  place?: ReaderPlace & { label: string }
}

export type ReaderVocabulary = {
  categories: {
    id: string
    name: string
    openNow: boolean
    filters: { key: string; label: string; kind: 'yes/no' | 'pick'; values?: string[] }[]
  }[]
  items: string[]
  places: string[]
}

/** A question as it's remembered: "Meat near me?" and "meat  near me" are
 *  one question, read once. */
export function questionKey(question: string): string {
  return question.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().replace(/[\s?!.,;:]+$/g, '').slice(0, 200)
}

export type ReaderPlace = {
  name: string
  geo: LatLng
  /** A neighbourhood's own size, in miles: "in Center City" is within it. */
  radius?: number
}

/** The places a question can name, by every name people use: the same
 *  places our own search knows (askSearch.ts), so the reader never knows
 *  fewer than it does ("food in Bala Cynwyd" lost its town when the
 *  reader's list had no towns, Sep 30). The community's neighbourhoods
 *  (with their other names, "South Philly"), its hospitals by name and by
 *  their initials ("HUP"), the towns in the listings' addresses, and every
 *  listing with a location ("near Trader Joe's"). Keyed lowercase; the
 *  first to claim a name keeps it. */
export function readerPlaces(listings: readonly DirectoryResource[], communitySlug: string): Map<string, ReaderPlace> {
  const out = new Map<string, ReaderPlace>()
  for (const p of neighborhoodsFor(communitySlug)) for (const n of [p.name, ...(p.aliases ?? [])]) out.set(n.toLowerCase(), { name: p.name, geo: p.geo, radius: p.radius })
  for (const h of listings) {
    if (h.category !== 'hospital' || !h.geo) continue
    const place = { name: h.name, geo: h.geo as LatLng }
    out.set(h.name.toLowerCase(), place)
    // Initials, before any " - Main Building": the capitalised words' (HUP,
    // Hospital of the University of Pennsylvania), and with "of" too (CHOP,
    // Children's Hospital of Philadelphia). People say both kinds.
    const words = h.name.split(' - ')[0].split(/\s+/)
    for (const keep of [(w: string) => /^[A-Z]/.test(w), (w: string) => /^[A-Z]/.test(w) || w === 'of']) {
      const initials = words.filter(keep).map((w) => w[0].toUpperCase()).join('')
      if (initials.length >= 3 && !out.has(initials.toLowerCase())) out.set(initials.toLowerCase(), place)
    }
  }
  const claim = (name: string, place: ReaderPlace) => {
    if (!out.has(name.toLowerCase())) out.set(name.toLowerCase(), place)
  }
  for (const t of townsFrom(listings)) for (const n of [t.name, ...(t.aliases ?? [])]) claim(n, { name: t.name, geo: t.geo, radius: t.radius })
  for (const l of listings) if (l.geo) claim(l.name, { name: l.name, geo: l.geo as LatLng })
  return out
}

/** What the reader may choose from: each category with its filters and the
 *  values its listings actually have, the items the site lists, and the
 *  places it knows. Built from the live data, so a new hechsher or a new
 *  category is readable the day it's added. */
export function readerVocabulary(categories: readonly CategoryConfig[], listings: readonly DirectoryResource[], places: readonly string[]): ReaderVocabulary {
  const items = new Set<string>()
  const cats = categories.map((c) => {
    const own = listings.filter((l) => l.category === c.id)
    for (const f of c.detailFields.filter((x) => x.type === 'tags')) {
      // By the name the guide uses for each (itemNames.ts): "Sliced
      // Cheeses" and "Some Sliced Cheese" are one item to read into.
      for (const l of own) for (const v of [...selectValues(l[f.key]), ...selectValues(l[`${f.key}_sometimes`])]) items.add(itemName(v))
    }
    return {
      id: c.id,
      name: c.pluralLabel,
      openNow: keepsHours(c),
      filters: filterFields(c).flatMap((f): ReaderVocabulary['categories'][number]['filters'] => {
        if (f.type === 'boolean') return [{ key: f.key, label: f.filterLabel ?? f.label, kind: 'yes/no' as const }]
        const values = [...new Set(own.flatMap((l) => selectValues(l[f.key])))].sort()
        return values.length ? [{ key: f.key, label: f.filterLabel ?? f.label, kind: 'pick' as const, values }] : []
      }),
    }
  })
  return { categories: cats, items: [...items].sort(), places: [...places] }
}

/** Keeps only what the vocabulary has: known categories, their own filter
 *  keys, values that exist, items the site lists, places it knows. A
 *  reading the AI got partly wrong loses the wrong part; it never gains
 *  something the site doesn't have. */
/** The two loose words of the reader's instructions, held to in code: the
 *  reader applied Type: Restaurant to "dairy restaurant" on two runs in a
 *  row (Oct 1), and a filter applied wrongly is a confident wrong answer.
 *  Said in the question, the value they name is only offered, unless the
 *  question insists ("a sit-down restaurant"). */
const LOOSE: { said: RegExp; value: string; insists?: RegExp }[] = [
  { said: /\brestaurants?\b/i, value: 'restaurant', insists: /\bsit[- ]?down\b|\bnot take-?out\b/i },
  { said: /\bkosher grocer(?:y|ies)\b/i, value: 'kosher store' },
]

export function tidyReading(raw: unknown, vocab: ReaderVocabulary, question = ''): Reading {
  const r = (raw ?? {}) as Partial<Reading>
  const lower = (s: string) => s.toLowerCase().trim()
  const byId = new Map(vocab.categories.map((c) => [c.id, c]))
  const tidyCategory = (c: Reading['categories'][number]): Reading['categories'][number] | null => {
    const known = c && typeof c.id === 'string' ? byId.get(c.id) : undefined
    if (!known) return null
    const out: Reading['categories'][number] = { id: known.id }
    if (c.openNow === true && known.openNow) out.openNow = true
    const bool = (Array.isArray(c.bool) ? c.bool : []).filter((k) => known.filters.some((f) => f.kind === 'yes/no' && f.key === k))
    if (bool.length) out.bool = [...new Set(bool)]
    const select: Record<string, string[]> = {}
    for (const [key, values] of Object.entries(c.select && typeof c.select === 'object' ? c.select : {})) {
      const field = known.filters.find((f) => f.kind === 'pick' && f.key === key)
      if (!field || !Array.isArray(values)) continue
      // Matched without regard to case ("keystone-k"), kept as the site writes it.
      const kept = values.flatMap((v) => (typeof v === 'string' ? (field.values ?? []).filter((x) => lower(x) === lower(v)) : []))
      if (kept.length) select[key] = [...new Set(kept)]
    }
    if (Object.keys(select).length) out.select = select
    return out
  }
  const categories: Reading['categories'] = []
  for (const c of Array.isArray(r.categories) ? r.categories : []) {
    const out = tidyCategory(c)
    if (out && !categories.some((x) => x.id === out.id)) categories.push(out)
  }
  // An unsure filter, only on a kind of place the reading is about, and
  // only a filter: when isn't the reader's, and a kind of place isn't unsure.
  const maybe: Reading['categories'] = []
  for (const c of Array.isArray(r.maybe) ? r.maybe : []) {
    const out = tidyCategory(c)
    if (!out || !categories.some((x) => x.id === out.id)) continue
    delete out.openNow
    if (out.bool || out.select) maybe.push(out)
  }
  // A loose word's value, applied, is moved to maybe (see LOOSE).
  for (const loose of LOOSE) {
    if (!loose.said.test(question) || loose.insists?.test(question)) continue
    for (const c of categories) {
      for (const [key, values] of Object.entries(c.select ?? {})) {
        const named = values.filter((v) => lower(v) === loose.value)
        if (named.length === 0) continue
        c.select![key] = values.filter((v) => !named.includes(v))
        let m = maybe.find((x) => x.id === c.id)
        if (!m) maybe.push((m = { id: c.id }))
        m.select = { ...m.select, [key]: [...new Set([...(m.select?.[key] ?? []), ...named])] }
      }
    }
  }
  // Unsure of a filter means it isn't applied: one the reader put in both
  // ("meat restaurant" read as Type: Restaurant and maybe Type: Restaurant,
  // Oct 1) is only offered.
  for (const m of maybe) {
    const c = categories.find((x) => x.id === m.id)
    if (!c) continue
    if (m.bool && c.bool) c.bool = c.bool.filter((k) => !m.bool!.includes(k))
    for (const [key, values] of Object.entries(m.select ?? {})) if (c.select?.[key]) c.select[key] = c.select[key].filter((v) => !values.includes(v))
    if (c.bool && c.bool.length === 0) delete c.bool
    if (c.select) {
      for (const key of Object.keys(c.select)) if (c.select[key].length === 0) delete c.select[key]
      if (Object.keys(c.select).length === 0) delete c.select
    }
  }
  const items = (Array.isArray(r.items) ? r.items : []).flatMap((v) => (typeof v === 'string' ? vocab.items.filter((x) => lower(x) === lower(v)) : []))
  const near = typeof r.near === 'string' ? (lower(r.near) === 'me' ? 'me' : (vocab.places.find((p) => lower(p) === lower(r.near as string)) ?? null)) : null
  const within = typeof r.withinMiles === 'number' && r.withinMiles > 0 && r.withinMiles <= 100 ? r.withinMiles : null
  // "Within 3 miles" or "nearest first" with nowhere named is from here.
  const from = near ?? (within || r.sortByDistance === true ? 'me' : null)
  return {
    categories,
    ...(maybe.length ? { maybe } : {}),
    ...(items.length ? { items: [...new Set(items)] } : {}),
    ...(from ? { near: from } : {}),
    ...(within ? { withinMiles: within } : {}),
    ...(r.sortByDistance === true || from ? { sortByDistance: true } : {}),
  }
}

/** The reading's categories and their filters, as the Map page holds them. */
export function readingFilters(reading: Reading): { categories: string[]; filters: MapFilterState } {
  const filters: MapFilterState = {}
  for (const c of reading.categories) {
    const f: MapFilterState[string] = {}
    if (c.openNow) f.openNow = true
    if (c.bool?.length) f.bool = c.bool
    if (c.select && Object.keys(c.select).length) f.select = c.select
    if (Object.keys(f).length) filters[c.id] = f
  }
  return { categories: reading.categories.map((c) => c.id), filters }
}

// ── Answering from a reading ───────────────────────────────────────────────
// The categories and filters are the Map page's own (above). What's left is
// what a reading adds: items, and how far from where.

/** The items asked for that a listing has, as its own tags, each with
 *  whether it's only sometimes in stock. Empty when none were asked for. */
export function readingItemsOn(listing: DirectoryResource, items: readonly string[]): { tag: string; sometimes: boolean }[] {
  if (items.length === 0) return []
  const wanted = new Set(items.map((i) => itemName(i).toLowerCase()))
  const out = new Map<string, boolean>()
  for (const [key, value] of Object.entries(listing)) {
    if (!Array.isArray(value)) continue
    const sometimes = key.endsWith('_sometimes')
    for (const tag of value) if (typeof tag === 'string' && wanted.has(itemName(tag).toLowerCase())) out.set(tag, (out.get(tag) ?? true) && sometimes)
  }
  return [...out].map(([tag, sometimes]) => ({ tag, sometimes }))
}

export type ReadingReach = {
  from: LatLng
  /** "you", "HUP", "Center City". */
  label: string
  /** How far it reaches; null with no distance given ("near me", "near
   *  HUP"), which only puts the nearest first. */
  miles: number | null
  /** A neighbourhood with no distance given: "in", not "within a mile of". */
  inside: boolean
  /** The distance was the question's own ("within 3 miles"), not ours. */
  asked?: boolean
}

/** Where a reading measures from, what it's called, and how far it
 *  reaches. Null when it says nowhere, or says "me" and the visitor hasn't
 *  shared where they are. A place named with no distance ("near HUP") is
 *  where the nearest come first, as our own search measures from it, not
 *  a limit: it used to be a mile, grown to the nearest that answered, and
 *  so took places away that our own search showed (decided Sep 30). A
 *  neighbourhood ("in Center City") is its own size, as it is for our own
 *  search too. */
export function readingReach(reading: Reading, places: ReadonlyMap<string, ReaderPlace>, me: LatLng | null): ReadingReach | null {
  if (!reading.near) return null
  const within = reading.withinMiles ?? null
  if (reading.near === 'me') return me ? { from: me, label: 'you', miles: within, inside: false, asked: !!within } : null
  const place = reading.place ?? placeFor(reading.near, places)
  if (!place) return null
  const { label } = place
  if (within) return { from: place.geo, label, miles: within, inside: false, asked: true }
  return place.radius ? { from: place.geo, label, miles: place.radius, inside: true } : { from: place.geo, label, miles: null, inside: false }
}

/** A place named in a reading, with what to call it: by its initials when
 *  it has them ("HUP"), however the question named it, since a chip with
 *  the whole of "Hospital of the University of Pennsylvania" runs off the
 *  screen; otherwise its own name. */
export function placeFor(near: string, places: ReadonlyMap<string, ReaderPlace>): (ReaderPlace & { label: string }) | null {
  const place = places.get(near.toLowerCase())
  if (!place) return null
  const initials = [...places].find(([k, p]) => p.name === place.name && /^[a-z]{2,5}$/.test(k) && !p.name.toLowerCase().startsWith(k))?.[0]
  return { ...place, label: initials ? initials.toUpperCase() : place.name }
}

/** The chip for a reach: "Within 3 mi of you", "In Center City",
 *  "Nearest to HUP". None for "near me" alone: the list says how far each
 *  place is from the visitor already. */
export function reachLabel(reach: ReadingReach): string | null {
  if (reach.inside) return `In ${reach.label}`
  if (reach.miles !== null) return `Within ${reach.miles} mi of ${reach.label}`
  return reach.label === 'you' ? null : `Nearest to ${reach.label}`
}

// ── What's sent ─────────────────────────────────────────────────────────────

export const READER_INSTRUCTIONS = `You read questions typed into the search box of a community guide to kosher food, synagogues and Jewish services, and say which of the guide's own filters the question means. You never answer the question and never add places or facts.

Reply with JSON only, in this shape:
{"categories":[{"id":"<category id>","openNow":true|false,"bool":["<yes/no filter key>"],"select":{"<pick filter key>":["<value>"]}}],"maybe":[{"id":"<category id>","bool":["<yes/no filter key>"],"select":{"<pick filter key>":["<value>"]}}],"items":["<item>"],"near":"me"|"<place>"|null,"withinMiles":<number>|null,"sortByDistance":true|false}

Rules:
- Use only category ids, filter keys, values, items and places from the vocabulary. Copy values exactly. If the question asks for something the vocabulary doesn't have, leave it out.
- One entry per category the question is about. With several ("meat places, all synagogues and the hotels"), several entries, each with only its own filters.
- openNow only where the question asks what's open now, and only for that category ("synagogues regardless of open now" means no openNow for synagogues). Only categories marked openNow can have it.
- A word that is one of a category's filter values means that filter ("meat" is Food Type: Meat; "Keystone" is Kosher Cert: Keystone-K; "Orthodox" is every Orthodox denomination).
- Two words are loose, because people use them for any place of the kind: "restaurant"/"restaurants" means any food place, never Type: Restaurant, with Type: Restaurant in maybe; "kosher grocery"/"kosher groceries" means any grocery, with Type: Kosher Store in maybe. Only a question that insists ("a sit-down restaurant, not takeout") makes Type: Restaurant a filter. Every other value word is simply its filter, never maybe ("bakery" is Type: Bakery, "kosher store" is Type: Kosher Store). Leave maybe out unless one of the two loose words is used.
- A question for items ("where can I get challah", "sushi") has no categories, unless it names a kind of place itself ("challah at a grocery"). "kosher food" and "where can I eat" are Food alone.
- "open now" with no kind of place named means every category marked openNow, each with openNow.
- Any other time ("open until 10", "open after 6pm", "open today", "open late") is worked out elsewhere: leave it out, and never turn it into openNow. Likewise "best" and "other than <a place>".
- items: things to buy or eat that a place stocks ("challah", "cholov yisroel milk" is "Chalav Yisroel Milk"), matched to the item list.
- near: "me" for "near me", "nearby", "closest"; a place from the list for "near HUP", "in Cherry Hill". sortByDistance when asked for nearest first or "sort by distance".
- withinMiles only when a distance is given ("within 3 miles").
- Words with no meaning of their own ("only", "show me", "all the", "please") change nothing.`

/** The instructions and vocabulary first, the same for every question, so
 *  the provider's prompt caching charges them at a discount after the
 *  first; the question last. */
export function readerMessages(question: string, vocab: ReaderVocabulary) {
  return [
    { role: 'system' as const, content: `${READER_INSTRUCTIONS}\n\nVocabulary:\n${JSON.stringify(vocab)}` },
    { role: 'user' as const, content: question },
  ]
}
