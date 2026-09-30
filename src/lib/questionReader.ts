import { selectValues, type CategoryConfig } from './categories'
import { filterFields, keepsHours, type MapFilterState } from './mapFilters'
import { neighborhoodsFor } from './places'
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

/** The places a question can name, by every name people use: the
 *  community's towns and neighbourhoods (with their other names, "South
 *  Philly"), and its hospitals, by name and by their initials ("HUP").
 *  Keyed lowercase. */
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
      for (const l of own) for (const v of [...selectValues(l[f.key]), ...selectValues(l[`${f.key}_sometimes`])]) items.add(v)
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
export function tidyReading(raw: unknown, vocab: ReaderVocabulary): Reading {
  const r = (raw ?? {}) as Partial<Reading>
  const lower = (s: string) => s.toLowerCase().trim()
  const byId = new Map(vocab.categories.map((c) => [c.id, c]))
  const categories: Reading['categories'] = []
  for (const c of Array.isArray(r.categories) ? r.categories : []) {
    const known = c && typeof c.id === 'string' ? byId.get(c.id) : undefined
    if (!known || categories.some((x) => x.id === known.id)) continue
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
    categories.push(out)
  }
  const items = (Array.isArray(r.items) ? r.items : []).flatMap((v) => (typeof v === 'string' ? vocab.items.filter((x) => lower(x) === lower(v)) : []))
  const near = typeof r.near === 'string' ? (lower(r.near) === 'me' ? 'me' : (vocab.places.find((p) => lower(p) === lower(r.near as string)) ?? null)) : null
  const within = typeof r.withinMiles === 'number' && r.withinMiles > 0 && r.withinMiles <= 100 ? r.withinMiles : null
  // "Within 3 miles" or "nearest first" with nowhere named is from here.
  const from = near ?? (within || r.sortByDistance === true ? 'me' : null)
  return {
    categories,
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
  const wanted = new Set(items.map((i) => i.toLowerCase()))
  const out = new Map<string, boolean>()
  for (const [key, value] of Object.entries(listing)) {
    if (!Array.isArray(value)) continue
    const sometimes = key.endsWith('_sometimes')
    for (const tag of value) if (typeof tag === 'string' && wanted.has(tag.toLowerCase())) out.set(tag, (out.get(tag) ?? true) && sometimes)
  }
  return [...out].map(([tag, sometimes]) => ({ tag, sometimes }))
}

/** A hospital or other place named with no distance given is within this
 *  of it: on a map, "near HUP" is the few blocks around it. A neighbourhood
 *  is its own size instead. Either way the chip says so and can be removed,
 *  so it's never a hidden rule. */
export const NEAR_PLACE_MILES = 1

export type ReadingReach = {
  from: LatLng
  /** "you", "HUP", "Center City". */
  label: string
  /** How far it reaches; null for "near me" with no distance, which only
   *  puts the nearest first. */
  miles: number | null
  /** A neighbourhood with no distance given: "in", not "within a mile of". */
  inside: boolean
  /** The distance was the question's own ("within 3 miles"), not ours. */
  asked?: boolean
}

/** Where a reading measures from, what it's called, and how far it
 *  reaches. Null when it says nowhere, or says "me" and the visitor hasn't
 *  shared where they are. */
export function readingReach(reading: Reading, places: ReadonlyMap<string, ReaderPlace>, me: LatLng | null): ReadingReach | null {
  if (!reading.near) return null
  const within = reading.withinMiles ?? null
  if (reading.near === 'me') return me ? { from: me, label: 'you', miles: within, inside: false, asked: !!within } : null
  const place = reading.place ?? placeFor(reading.near, places)
  if (!place) return null
  const { label } = place
  if (within) return { from: place.geo, label, miles: within, inside: false, asked: true }
  return place.radius ? { from: place.geo, label, miles: place.radius, inside: true } : { from: place.geo, label, miles: NEAR_PLACE_MILES, inside: false }
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

/** "Near HUP" asks for the nearest, not for a mile: when nothing that
 *  answers is within our mile, the reach grows to the nearest that does,
 *  to the next half mile, and the chip says how far that is. A distance
 *  the question gave, or a neighbourhood, stays as it is. */
export function widenReach(reach: ReadingReach, milesAway: readonly number[]): ReadingReach {
  if (reach.asked || reach.inside || reach.miles === null || milesAway.length === 0) return reach
  const nearest = Math.min(...milesAway)
  return nearest <= reach.miles ? reach : { ...reach, miles: Math.ceil(nearest * 2) / 2 }
}

/** The chip for a reach: "Within 3 mi of you", "In Center City". */
export function reachLabel(reach: ReadingReach): string | null {
  if (reach.inside) return `In ${reach.label}`
  return reach.miles === null ? null : `Within ${reach.miles} mi of ${reach.label}`
}

// ── What's sent ─────────────────────────────────────────────────────────────

export const READER_INSTRUCTIONS = `You read questions typed into the search box of a community guide to kosher food, synagogues and Jewish services, and say which of the guide's own filters the question means. You never answer the question and never add places or facts.

Reply with JSON only, in this shape:
{"categories":[{"id":"<category id>","openNow":true|false,"bool":["<yes/no filter key>"],"select":{"<pick filter key>":["<value>"]}}],"items":["<item>"],"near":"me"|"<place>"|null,"withinMiles":<number>|null,"sortByDistance":true|false}

Rules:
- Use only category ids, filter keys, values, items and places from the vocabulary. Copy values exactly. If the question asks for something the vocabulary doesn't have, leave it out.
- One entry per category the question is about. With several ("meat places, all synagogues and the hotels"), several entries, each with only its own filters.
- openNow only where the question asks what's open now, and only for that category ("synagogues regardless of open now" means no openNow for synagogues). Only categories marked openNow can have it.
- A word that is one of a category's filter values means that filter ("meat" is Food Type: Meat; "Keystone" is Kosher Cert: Keystone-K; "Orthodox" is every Orthodox denomination). "restaurant" or "restaurants" always means Type: Restaurant, also in "restaurant near me".
- "open now" with no kind of place named means every category marked openNow, each with openNow.
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
