import type { DirectoryResource, ResourceSubmission } from '@/types'
import { selectValues, type CategoryConfig } from './categories'
import { editSubmission } from './editSubmission'
import { addedItemName, itemWording } from './itemMarks'
import { itemName } from './itemNames'
import { DEFAULT_READER_MODEL } from './readQuestion'
import { changeableFields, DAYS, type FieldRead, type HoursRead } from './fieldChanges'
import type { DayKey } from './hours'
import type { SubmissionSource } from './submissionSource'

// ── Reading what someone forwards: the "+ Add" box's reader ─────────────────
// Agreed Oct 4–5: people tell the guide things the way they already do,
// a WhatsApp post, a screenshot, a flyer, a photo of a product, and the AI
// reads it into proposed changes. The person sees the result and sends it;
// an admin approves every one (the queue's opened card shows the original
// beside it).
//
// The AI reads; it never supplies a fact (feedback-ai-sourcing-rules). Every
// proposal carries the words it rests on, checked against the message, and
// can only point at listings the guide has. A store it can't place is
// asked about, never guessed. The prompt is the one tested on Oct 4 against
// 24 real posts and 2 non-updates on GPT-6 Luna (20 right, 6 partly, none
// harmful), widened from groceries and food to every category, with a
// shul's times handed to the week reader (scheduleReader's readRegular).

export type ReadImage = { b64: string; mime: string }
export type MessageSource = { text: string; images: ReadImage[] }

export type Availability = 'always' | 'sometimes' | 'seen' | 'stopped' | 'announced'
export type ReadItem = { name: string; availability: Availability; doubt: string | null }

export type CatalogListing = {
  id: string
  name: string
  category: string
  address: string
  items: string[]
  sometimes: string[]
}

export type CatalogCategory = {
  id: string
  label: string
  /** The field that lists what a place carries, when it has one. */
  itemsKey: string | null
  /** Whether that list is of dishes (Food's main dishes), read off a menu. */
  dishes?: boolean
  /** Whether its listings have davening times. */
  hasTimes: boolean
  /** What else about its listings a message can change (fieldChanges.ts). */
  fields: { key: string; label: string; says: string }[]
}

export type Catalog = { listings: CatalogListing[]; categories: CatalogCategory[]; itemNames: string[] }

export type PlaceRead = {
  name: string
  kind: string | null
  address: string | null
  phone: string | null
  website: string | null
  kosherCert: string | null
  meatDairy: string | null
  notes: string | null
}

type Quoted = { quote: string; checked: boolean }
export type AskSender = { question: string; choices: { label: string; listingId: string }[] }

export type Proposal =
  | ({ kind: 'items'; listingId: string | null; asWritten: string; chain: boolean; ask: AskSender | null; items: ReadItem[]; note: string | null } & Quoted)
  | ({
      kind: 'new_place'
      category: string | null
      place: PlaceRead
      items: ReadItem[]
      note: string | null
      /** Listings with a name like it: the place may be in the guide under
       *  another name ("Spruce St Market" is Spruce Market, 1523 Spruce). */
      maybe: string[]
    } & Quoted)
  | ({ kind: 'fields'; listingId: string | null; asWritten: string; ask: AskSender | null; changes: FieldRead[]; note: string | null } & Quoted)
  | ({ kind: 'times'; listingId: string } & Quoted)
  | ({ kind: 'ask_others'; listingId: string | null; question: string } & Quoted)
  /** A food place's menu, as a link or in the photos: its main dishes are
   *  read from it by the menu reader (menuReader.ts), not here. */
  | ({ kind: 'menu'; listingId: string | null; asWritten: string; ask: AskSender | null; url: string | null } & Quoted)
  | { kind: 'not_update'; note: string | null }

export type MessageReading = { proposals: Proposal[] }

const MAX_TEXT = 8_000
const MAX_PROPOSALS = 10
const MAX_ITEMS = 30

// ── The catalog the AI is told about ────────────────────────────────────────

export function buildCatalog(listings: DirectoryResource[], categories: CategoryConfig[]): Catalog {
  const cats: CatalogCategory[] = categories.map((c) => ({
    id: c.id,
    label: c.label,
    itemsKey: c.detailFields.find((f) => f.type === 'tags')?.key ?? null,
    dishes: (() => {
      const f = c.detailFields.find((x) => x.type === 'tags')
      return !!f && itemWording(f).noun === 'dish'
    })(),
    hasTimes: c.detailFields.some((f) => f.type === 'minyanim'),
    fields: changeableFields(c).map((f) => ({ key: f.key, label: f.label, says: fieldSays(f.type, f.field?.options?.map((o) => o.label), f.field?.multiSelect) })),
  }))
  const byId = new Map(cats.map((c) => [c.id, c]))
  const out: CatalogListing[] = []
  for (const l of listings) {
    const cat = byId.get(l.category)
    if (!cat) continue
    out.push({
      id: l.id,
      name: l.name,
      category: l.category,
      address: (l.address ?? '').replace(/, USA$/, ''),
      items: cat.itemsKey ? selectValues(l[cat.itemsKey]) : [],
      sometimes: cat.itemsKey ? selectValues(l[`${cat.itemsKey}_sometimes`]) : [],
    })
  }
  const itemNames = [...new Set(out.flatMap((l) => [...l.items, ...l.sometimes]))].sort()
  return { listings: out, categories: cats, itemNames }
}

/** A field's kind of value, as the prompt names it. */
function fieldSays(type: string, choices?: string[], multi?: boolean): string {
  if (type === 'select') return `${multi ? 'any of' : 'one of'}: ${(choices ?? []).join(' | ')}`
  return { tel: 'phone', textarea: 'long text', url: 'link', boolean: 'yes/no', hours: 'weekly hours' }[type] ?? type
}

/** Listing ids are shortened for the AI (fewer tokens, fewer typos) and
 *  mapped back after. Eight characters of a UUID are unique in practice;
 *  any clash gets more. */
function shortIds(listings: CatalogListing[]): Map<string, string> {
  const out = new Map<string, string>()
  for (let len = 8; len <= 36; len += 4) {
    out.clear()
    for (const l of listings) out.set(l.id.slice(0, len), l.id)
    if (out.size === listings.length) return out
  }
  for (const l of listings) out.set(l.id, l.id)
  return out
}

// ── The prompt ──────────────────────────────────────────────────────────────

export function messageMessages(source: MessageSource, catalog: Catalog, { about, communityName }: { about?: string; communityName: string }): unknown[] {
  const short = new Map([...shortIds(catalog.listings)].map(([s, full]) => [full, s]))
  const catLabel = new Map(catalog.categories.map((c) => [c.id, c.label]))
  const lines = catalog.listings.map((l) => {
    const parts = [short.get(l.id), l.name, catLabel.get(l.category), l.address || 'no address']
    if (l.items.length) parts.push(`has: ${l.items.join(', ')}`)
    if (l.sometimes.length) parts.push(`sometimes: ${l.sometimes.join(', ')}`)
    return parts.join(' · ')
  })
  const categories = catalog.categories
    .map((c) => `${c.id} (${c.label}${c.dishes ? ', lists its main dishes, read from its menu' : c.itemsKey ? ', lists items it carries' : ''}${c.hasTimes ? ', has davening times' : ''})`)
    .join('; ')
  const fieldLines = catalog.categories.map((c) => `${c.id}: ${c.fields.map((f) => `${f.key} "${f.label}" (${f.says})`).join('; ')}`)
  const aboutListing = about ? catalog.listings.find((l) => l.id === about) : undefined

  const system = `You read messages people forward to a community-kept guide for Jewish ${communityName}: WhatsApp posts, Instagram screenshots, flyers, product photos, shul emails. Turn each message into PROPOSED updates for a human admin to approve. Never invent facts: everything you propose must come from the message or its photos.

The guide's categories (id and name): ${categories}

The guide's listings (id · name · category · address · items it always has · items it sometimes has):
${lines.join('\n')}

What else each category's listings have that a message can change (field key "label" (kind of value)):
${fieldLines.join('\n')}

Item names already used in the guide (reuse one when it is the same thing a shopper would search for): ${catalog.itemNames.join(', ')}

Rules
- A message may hold several updates. Make one proposal per store or place.
- Match a store to a listing ONLY when the location in the message fits that listing's address (street, intersection, neighbourhood). A same-named store at a different location is a different store. Chains have several branches: if the message names a chain without a usable location and the guide has more than one branch, set listing_id null and ask the sender which, offering the branches as choices. If the message clearly means every store of the chain ("all the Aldis"), set scope "chain".
- If the guide has exactly ONE branch of a chain and the message names that chain with no location (or a location that fits it), that branch is the match: give its listing_id, and do not ask.
- A chain-wide ANNOUNCEMENT is not a sighting: a post by the brand, a fan or news account, or an ad saying a product is new or available at a chain in general ("*NEW* at Trader Joe's!"), with nobody saying they saw it in a store here. Set scope "chain", availability "announced", and do NOT ask the sender which store. Add a second proposal of kind "ask_others" asking shoppers whether they have seen it at the guide's branches of that chain.
- A store or place not in the guide: listing_id null, kind "new_place", with what the message gives (name, address or location as written, phone, website, kind) and "category": the id of the guide's category it belongs in, or null if none fits. Put every item it has in "items", exactly as for a listing, never only in "notes".
- Before calling a place new, look for it under a slightly different name at a fitting address ("Spruce St Market on 16th and Spruce" is a listing named "Spruce Market" at 1523 Spruce St). If one fits, it is that listing, not a new place.
- A store not in the guide that the message only says STOPPED carrying things (nothing it has now): propose nothing for that store. A store with nothing kosher is not worth adding.
- If a new place is "by" or related to an existing listing, never change the existing listing.
- A shul's newsletter or announcement: only its davening times matter. Everything else in it (events, classes, kiddush, sponsors, the eruv, the sukkah, donations, volunteers) is not an update and is never a new place.
- Davening times for a shul in the guide (a weekly schedule, a newsletter's times, "Mincha is 6:15 this week"): one proposal of kind "times" with that shul's listing_id. Do not list the times; another reader reads them. Times for a shul not in the guide: "new_place".
- Item availability: "always" (always, usually, almost always, regularly, has), "sometimes" (sometimes, occasionally, hard to find, varies, around the holidays), "seen" (a one-off find or sighting), "stopped" (no longer carries, used to).
- Rarity is often said indirectly or as a joke: "if you're lucky", "if the planets are aligned", "tucked behind other things", "hit or miss", "when they have it", "a surprise". All of these are "sometimes", not "seen" or "always".
- When the message says the kosher version of an item is only there some of the time ("sells challah which sometimes has a hechsher, but not always"), that item is "sometimes". The hechsher itself is still not recorded.
- Item names: short and plain, the way a shopper would search. Keep every word that says what KIND of thing it is: "ground beef" not "beef", "sliced cheese" not "cheese", "frozen falafel", "stew meat", "pretzel buns". Reuse a guide name only when it means exactly the same thing (e.g. "Hamburger Meat" for ground beef); never swap in a broader one. Drop filler words ("some", "various", "a few", "kosher"). Keep a brand only when it is the point (e.g. "Tillamook cheddar"; "Empire chicken" is "Chicken").
- Something the message says is NOT kosher, or is the exception ("everything is kosher except the gummies") is never an item. Say it in the place's "notes" ("Not kosher: some gummy and marshmallow candies").
- List EVERY item the message names for a store; never drop one (e.g. "kosher meat and chicken" is two items: "Kosher meat" and "Chicken").
- Doubt: if the sender is unsure the store carries it ("I think", "I believe", "a friend told me"), set doubt true and quote those words. Hechsher uncertainty alone is NOT doubt: grocery hechsherim are not tracked.
- Ignore prices, sales, opinions, and hechsher details of grocery items.
- Kosher symbols you may see in photos, flyers or on walls, for kosher_cert (use these names exactly):
  Keystone-K = a K inside the outline of a keystone (the Pennsylvania keystone: wide at the top, narrowing to the bottom, with notched top corners). It is Philadelphia's own certifier, so it is the most common one here.
  OU = a U inside a circle. Star-K = a K inside a five-pointed star. OK Kosher = a K inside a circle. cRc = the letters cRc inside a triangle. Kof-K = a K inside the Hebrew letter kof.
  Also used here: IKC, Cherry-K, KCL, Tartikov (name them only when the name is written).
  A plain K with no shape around it is not a certifier: say "a plain K". If you cannot tell which it is, say "unidentified symbol" and describe it; never guess a name.
- A claim about OTHER stores that is only a guess ("surprised if any other X has it") is never a change: make it kind "ask_others" with a short question to ask shoppers about that store.
- A food place's MENU (a link to its menu, a photo or screenshot of a menu, a menu PDF), or a request to add its dishes from one: one proposal of kind "menu" for that place, with "menu_url": the link given, or null when the menu is in the photos. Do not list the dishes; another reader picks them from the menu. A link to a menu is never a change to "website": a link changes the website only when the message says the place's website itself is new or has moved. The same store rules apply (which branch; ask the sender when unsure).
- Food places (restaurants, ice cream, food trucks): give kosher certification only if shown or stated; meat/dairy/parve only if stated, else say what it is inferred from.
- Any OTHER change to a listing in the guide (its hours, phone, website, address, name, hechsher or certification, meat/dairy, a yes/no, notes; a mikvah's women's hours; anything in its category's fields above): one proposal of kind "fields" for that listing, with "changes": one entry per field, using that category's field key. Pick the field whose label fits ("women's hours" is the women's hours field when the category has one). Change only what the message says; never fill in anything else. Items and davening times are never "fields". The same store rules apply (which branch; ask the sender when unsure).
  Values: text, phone, link, long text: the new value as written. "one of" / "any of": one of the listed choices exactly (a list for "any of"); a value that is none of them goes in "note" instead. yes/no: true or false. number: a number.
  Weekly hours: "days" (a list of sun, mon, tue, wed, thu, fri, sat, or "all" when no day is named), "open" and "close" as 24-hour "HH:MM" (null when not said), "closed": true when it's closed those days, and "when": "every_week" (from now on, "now", "new hours", "every Wednesday", "on Wednesdays"), "one_day" (one date: "this Wednesday", "tomorrow", "on the 12th", a holiday) or "unclear" (a day named with nothing saying which, like "closes at 3pm on Wednesday").
- Something that is not an update (a question, a greeting, chat, a suggestion about the website): one proposal of kind "not_update", with what it is in "note".
- With every listing_id give "listing_name": that listing's name exactly as in the list, so a mistyped id is caught.
- For every proposal give "quote": the exact words from the message text it rests on, copied character for character, or "photo" if it comes from a photo.${aboutListing ? `\n- The person sent this from the listing "${aboutListing.name}" (${short.get(aboutListing.id)}). A message that names no store is about that one.` : ''}

Reply with JSON only:
{"proposals":[{"kind":"items"|"fields"|"menu"|"new_place"|"times"|"ask_others"|"not_update",
 "store":{"listing_id":string|null,"listing_name":string|null,"as_written":string,"scope":"branch"|"chain","ask_sender":{"question":string,"choices":[{"label":string,"listing_id":string}]}|null},
 "items":[{"name":string,"availability":"always"|"sometimes"|"seen"|"stopped"|"announced","doubt":boolean,"doubt_words":string|null}],
 "changes":[{"field":string,"value":string|boolean|number|string[]|null,"days":string[]|"all"|null,"open":string|null,"close":string|null,"closed":boolean,"when":"every_week"|"one_day"|"unclear"|null}],
 "category":string|null,
 "place":{"name":string,"kind":string,"address":string|null,"phone":string|null,"website":string|null,"kosher_cert":string|null,"meat_dairy":string|null,"notes":string|null}|null,
 "question":string|null,
 "menu_url":string|null,
 "quote":string,
 "note":string|null}]}`

  const content: unknown[] = [{ type: 'text', text: source.text.trim() ? `Message:\n${source.text.slice(0, MAX_TEXT)}` : 'Message: (no text, only the photo(s) below)' }]
  // A PDF (a shul's flyer, a menu) goes as a file, the way the week reader
  // sends one; a photo as an image.
  for (const img of source.images) {
    if (img.mime === 'application/pdf') content.push({ type: 'file', file: { filename: 'attachment.pdf', file_data: `data:application/pdf;base64,${img.b64}` } })
    else content.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.b64}` } })
  }
  return [
    { role: 'system', content: system },
    { role: 'user', content },
  ]
}

// ── Tidying what comes back ─────────────────────────────────────────────────

/** Folded for comparing a quote with the message: WhatsApp's invisible
 *  joiners, curly quotes, runs of space, and a full stop the model adds. */
export function foldQuote(s: string): string {
  return s
    .replace(/[⁠​‍﻿]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '')
    .toLowerCase()
}

/** A name as compared: case, "&" and punctuation aside. */
const nameKey = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const str = (v: unknown, max = 300): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const AVAILABILITY = new Set<Availability>(['always', 'sometimes', 'seen', 'stopped', 'announced'])

export function tidyMessageReading(raw: unknown, catalog: Catalog, source: MessageSource): MessageReading {
  const ids = shortIds(catalog.listings)
  const byId = (v: unknown): string | null => {
    const s = str(v, 40)
    if (!s) return null
    return ids.get(s) ?? (catalog.listings.some((l) => l.id === s) ? s : null)
  }
  // The id checked against the name the AI says it means. A slipped id
  // ("food and friends" filed against Gelbstein's Bakery, Oct 5 live run)
  // is still a real listing, so nothing else would catch it. On a mismatch
  // the name decides: one listing by that name is it; several (a chain's
  // branches) or none, and it's unmatched, to be asked.
  const listingOf = (store: Record<string, unknown>): string | null => {
    const id = byId(store.listing_id)
    const named = str(store.listing_name, 200)
    if (!id || !named) return id
    if (nameKey(catalog.listings.find((l) => l.id === id)!.name) === nameKey(named)) return id
    const same = catalog.listings.filter((l) => nameKey(l.name) === nameKey(named))
    return same.length === 1 ? same[0].id : null
  }
  const categoryIds = new Set(catalog.categories.map((c) => c.id))
  const timesCategories = new Set(catalog.categories.filter((c) => c.hasTimes).map((c) => c.id))
  const text = foldQuote(source.text)
  const quoted = (v: unknown): Quoted => {
    const q = str(v, 2000) ?? 'photo'
    return { quote: q, checked: q !== 'photo' && text.length > 0 && text.includes(foldQuote(q)) }
  }
  const itemsOf = (v: unknown): ReadItem[] => {
    if (!Array.isArray(v)) return []
    const seen = new Set<string>()
    const out: ReadItem[] = []
    for (const r of v) {
      if (!r || typeof r !== 'object') continue
      const o = r as Record<string, unknown>
      const name = str(o.name, 60)
      const availability = o.availability as Availability
      if (!name || !AVAILABILITY.has(availability)) continue
      const tidy = addedItemName(name)
      if (seen.has(tidy.toLowerCase())) continue
      seen.add(tidy.toLowerCase())
      out.push({ name: tidy, availability, doubt: o.doubt === true ? str(o.doubt_words, 200) ?? 'not sure' : null })
      if (out.length >= MAX_ITEMS) break
    }
    return out
  }

  const raws = Array.isArray((raw as { proposals?: unknown } | null)?.proposals) ? ((raw as { proposals: unknown[] }).proposals) : []
  const proposals: Proposal[] = []
  for (const r of raws) {
    if (proposals.length >= MAX_PROPOSALS) break
    if (!r || typeof r !== 'object') continue
    const p = r as Record<string, unknown>
    const store = (p.store && typeof p.store === 'object' ? p.store : {}) as Record<string, unknown>
    const note = str(p.note, 500)

    if (p.kind === 'not_update') {
      proposals.push({ kind: 'not_update', note })
      continue
    }
    if (p.kind === 'times') {
      const listingId = listingOf(store)
      const listing = listingId ? catalog.listings.find((l) => l.id === listingId) : undefined
      // Times for something that isn't a shul in the guide: nothing to read
      // them into.
      if (!listing || !timesCategories.has(listing.category)) continue
      proposals.push({ kind: 'times', listingId: listing.id, ...quoted(p.quote) })
      continue
    }
    if (p.kind === 'ask_others') {
      const question = str(p.question, 300)
      if (!question) continue
      proposals.push({ kind: 'ask_others', listingId: listingOf(store), question, ...quoted(p.quote) })
      continue
    }
    if (p.kind === 'new_place') {
      const place = (p.place && typeof p.place === 'object' ? p.place : {}) as Record<string, unknown>
      const name = str(place.name, 120) ?? str(store.as_written, 120)
      if (!name) continue
      const named = str(p.category, 60)
      const category = named && categoryIds.has(named) ? named : null
      proposals.push({
        kind: 'new_place',
        category,
        place: {
          name,
          kind: str(place.kind, 80),
          address: str(place.address, 200),
          phone: str(place.phone, 40),
          website: str(place.website, 300),
          kosherCert: str(place.kosher_cert, 80),
          meatDairy: str(place.meat_dairy, 120),
          notes: str(place.notes, 600),
        },
        items: itemsOf(p.items),
        note,
        maybe: likelySame(name, catalog.listings, category),
        ...quoted(p.quote),
      })
      continue
    }
    const askRaw = store.ask_sender && typeof store.ask_sender === 'object' ? (store.ask_sender as Record<string, unknown>) : null
    const choices = Array.isArray(askRaw?.choices)
      ? (askRaw!.choices as unknown[]).flatMap((c) => {
          const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
          const id = listingOf({ listing_id: o.listing_id, listing_name: o.listing_name })
          const listing = id ? catalog.listings.find((l) => l.id === id) : undefined
          return listing ? [{ label: str(o.label, 120) ?? listing.address, listingId: listing.id }] : []
        })
      : []
    const askOf = (listingId: string | null): AskSender | null => (!listingId && choices.length > 1 ? { question: str(askRaw?.question, 200) ?? 'Which one?', choices } : null)
    if (p.kind === 'menu') {
      const listingId = listingOf(store)
      const ask = askOf(listingId)
      // Only a place whose category keeps a list of dishes has one to fill.
      const category = catalog.listings.find((l) => l.id === (listingId ?? ask?.choices[0]?.listingId))?.category
      if (!catalog.categories.find((c) => c.id === category)?.dishes) continue
      const link = str(p.menu_url, 500)
      const url = link && /^https?:\/\//i.test(link) ? link : link && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(link) ? `https://${link}` : null
      proposals.push({ kind: 'menu', listingId, asWritten: str(store.as_written, 120) ?? '', ask, url, ...quoted(p.quote) })
      continue
    }
    if (p.kind === 'fields') {
      const listingId = listingOf(store)
      const ask = askOf(listingId)
      // The fields of the place it's about, or of the branches it asks between.
      const category = catalog.listings.find((l) => l.id === (listingId ?? ask?.choices[0]?.listingId))?.category
      const keys = new Set(catalog.categories.find((c) => c.id === category)?.fields.map((f) => f.key) ?? [])
      const changes = fieldsOf(p.changes).filter((c) => keys.has(c.key))
      if (changes.length === 0) continue
      proposals.push({ kind: 'fields', listingId, asWritten: str(store.as_written, 120) ?? '', ask, changes, note, ...quoted(p.quote) })
      continue
    }
    if (p.kind === 'items') {
      const items = itemsOf(p.items)
      if (items.length === 0) continue
      const listingId = listingOf(store)
      const chain = store.scope === 'chain'
      proposals.push({
        kind: 'items',
        listingId,
        asWritten: str(store.as_written, 120) ?? '',
        chain,
        ask: askOf(listingId),
        items,
        note,
        ...quoted(p.quote),
      })
    }
  }
  return { proposals: proposals.length ? proposals : [{ kind: 'not_update', note: null }] }
}

const WHEN = new Set(['every_week', 'one_day', 'unclear'])
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/
const hhmm = (v: unknown): string | null => (typeof v === 'string' && HHMM.test(v.trim()) ? v.trim().padStart(5, '0') : null)

/** The changes a "fields" proposal reads, each in a checked shape: a value
 *  as given (checked against the field when it's filed, fieldChanges.ts),
 *  or for hours, which days, the times, and whether it's from now on. */
function fieldsOf(v: unknown): FieldRead[] {
  if (!Array.isArray(v)) return []
  const out: FieldRead[] = []
  for (const r of v.slice(0, 12)) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const key = str(o.field, 80)
    if (!key) continue
    // Both kept: which applies is the field's type (fieldChanges.ts), not
    // which keys the model happened to fill.
    const read: FieldRead = { key }
    if (o.days != null) {
      const days = o.days === 'all' ? 'all' : Array.isArray(o.days) ? o.days.filter((d): d is DayKey => DAYS.includes(d as DayKey)) : []
      const hours: HoursRead = {
        days,
        open: hhmm(o.open),
        close: hhmm(o.close),
        closed: o.closed === true,
        when: WHEN.has(o.when as string) ? (o.when as HoursRead['when']) : 'unclear',
      }
      if ((days === 'all' || days.length > 0) && (hours.closed || hours.open || hours.close)) read.hours = hours
    }
    if (o.value !== null && o.value !== undefined) read.value = typeof o.value === 'string' ? o.value.slice(0, 1000) : o.value
    if (read.hours || 'value' in read) out.push(read)
  }
  return out
}

// A store's own name, without the words every store has. "Spruce St Market"
// and "Spruce Market" are both "spruce"; "Rittenhouse Market" isn't.
const COMMON = new Set(
  'the and market markets store stores shop grocery groceries supermarket farmers foods food kosher cafe restaurant bakery deli pizza catering eats grill kitchen city center south north east west street square avenue road philadelphia philly'.split(' '),
)
function nameWords(name: string): Set<string> {
  return new Set((name.toLowerCase().normalize('NFKD').match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !COMMON.has(w)))
}

/** Up to three listings whose names share a store's own word with this one:
 *  a new place may be one the guide has under another name. A hint for the
 *  person and the admin, never a match. A word in more than four listings'
 *  names says nothing about which one it is ("ice": six Rita's), and a
 *  hint stays in the place's own category when it has one. */
export function likelySame(name: string, listings: CatalogListing[], category: string | null = null): string[] {
  const counts = new Map<string, number>()
  for (const l of listings) for (const w of nameWords(l.name)) counts.set(w, (counts.get(w) ?? 0) + 1)
  const mine = [...nameWords(name)].filter((w) => (counts.get(w) ?? 0) <= 4)
  if (mine.length === 0) return []
  return listings
    .filter((l) => (!category || l.category === category) && [...nameWords(l.name)].some((w) => mine.includes(w)))
    .slice(0, 3)
    .map((l) => l.id)
}

// ── What a reading proposes, as the guide's own suggestions ─────────────────

export type ItemsChange = {
  submission: ResourceSubmission
  /** What changes, a line each: "+ Chicken, sometimes", "− Wine". */
  lines: string[]
  /** What's read but not changed, and why: "Cheese sticks: they weren't sure". */
  held: string[]
}

const lower = (s: string) => s.toLowerCase()

/** A store's items after what the message says, as the edit suggestion the
 *  "+ Add an item" row already files: the listing as it stands, with its
 *  lists changed. Null when nothing changes. */
export function itemsChange(category: CategoryConfig, listing: DirectoryResource, items: ReadItem[]): ItemsChange | null {
  const key = category.detailFields.find((f) => f.type === 'tags')?.key
  if (!key) return null
  const sKey = `${key}_sometimes`
  let always = selectValues(listing[key])
  let sometimes = selectValues(listing[sKey])
  const has = (list: string[], name: string) => list.some((v) => lower(itemName(v)) === lower(name))
  const without = (list: string[], name: string) => list.filter((v) => lower(itemName(v)) !== lower(name))
  const lines: string[] = []
  const held: string[] = []

  for (const it of items) {
    if (it.doubt) {
      held.push(`${it.name}: they weren’t sure (“${it.doubt}”)`)
      continue
    }
    if (it.availability === 'announced') {
      held.push(`${it.name}: announced for the chain, not seen here`)
      continue
    }
    if (it.availability === 'stopped') {
      if (has(always, it.name) || has(sometimes, it.name)) {
        always = without(always, it.name)
        sometimes = without(sometimes, it.name)
        lines.push(`− ${it.name}`)
      } else held.push(`${it.name}: not listed here anyway`)
      continue
    }
    if (it.availability === 'sometimes') {
      if (has(sometimes, it.name)) {
        held.push(`${it.name}: already listed as sometimes`)
        continue
      }
      const moved = has(always, it.name)
      always = without(always, it.name)
      sometimes = [...sometimes, it.name]
      lines.push(moved ? `${it.name}: now sometimes` : `+ ${it.name}, sometimes`)
      continue
    }
    // always or seen
    if (has(always, it.name)) {
      held.push(`${it.name}: already listed`)
      continue
    }
    const wasSometimes = has(sometimes, it.name)
    // A sighting of something listed as sometimes doesn't make it always.
    if (wasSometimes && it.availability === 'seen') {
      held.push(`${it.name}: already listed as sometimes`)
      continue
    }
    sometimes = without(sometimes, it.name)
    always = [...always, it.name]
    lines.push(wasSometimes ? `${it.name}: now always` : `+ ${it.name}`)
  }
  if (lines.length === 0) return held.length ? { submission: editSubmission(category, listing, {}), lines, held } : null
  return { submission: editSubmission(category, listing, { [key]: always, [sKey]: sometimes }), lines, held }
}

/** A new place as the guide's own new-listing suggestion: its name, address
 *  and phone, a website in the category's link field, a hechsher only when
 *  it's one of the category's own choices, and what it carries. The rest
 *  of what was read goes in the note, for the admin. */
export function newPlaceSubmission(category: CategoryConfig, place: PlaceRead, items: ReadItem[]): { submission: ResourceSubmission; note: string } {
  const details: Record<string, unknown> = {}
  const website = category.detailFields.find((f) => f.type === 'url' && /web|site|link/i.test(`${f.key} ${f.label}`))
  if (website && place.website) details[website.key] = /^https?:\/\//i.test(place.website) ? place.website : `https://${place.website}`
  if (place.kosherCert) {
    for (const f of category.detailFields) {
      if (f.type !== 'select' || !f.options?.length) continue
      const match = f.options.find((o) => lower(o.value) === lower(place.kosherCert!) || lower(o.label) === lower(place.kosherCert!))
      if (match) {
        details[f.key] = f.multiSelect ? [match.value] : match.value
        break
      }
    }
  }
  const tags = category.detailFields.find((f) => f.type === 'tags')?.key
  if (tags) {
    const usable = items.filter((i) => !i.doubt && i.availability !== 'stopped' && i.availability !== 'announced')
    details[tags] = usable.filter((i) => i.availability !== 'sometimes').map((i) => i.name)
    details[`${tags}_sometimes`] = usable.filter((i) => i.availability === 'sometimes').map((i) => i.name)
  }
  const note = [
    place.kind && `Kind of place: ${place.kind}`,
    place.kosherCert && !Object.values(details).flat().includes(place.kosherCert) && `Kosher symbol: ${place.kosherCert}`,
    place.meatDairy && `Meat or dairy: ${place.meatDairy}`,
    place.notes,
  ]
    .filter(Boolean)
    .join('\n')
  return {
    submission: {
      category: category.id,
      name: place.name,
      anchorId: category.hasAddress === false ? 'community' : 'all',
      distance: null,
      address: category.hasAddress === false ? '' : (place.address ?? ''),
      phone: category.hasPhone === false ? '' : (place.phone ?? ''),
      details,
      geo: null,
    },
    note,
  }
}

/** Where a suggestion read from a message came from, for the queue's opened
 *  card (submissionSource.ts). */
export function messageSource(text: string, photoUrls: string[]): SubmissionSource {
  return {
    readBy: 'ai',
    from: text.trim() ? 'a message' : 'a photo',
    ...(text.trim() ? { original: text.trim().slice(0, MAX_TEXT) } : {}),
    ...(photoUrls[0] ? { photoUrl: photoUrls[0] } : {}),
  }
}

// ── The call ────────────────────────────────────────────────────────────────

export type MessageReadResult = MessageReading & { model: string; ms: number; usage: { input: number; cachedInput: number; output: number } }

export async function readMessage(
  source: MessageSource,
  catalog: Catalog,
  opts: { apiKey: string; communityName: string; about?: string; model?: string; fetchImpl?: typeof fetch },
): Promise<MessageReadResult> {
  const { apiKey, model = DEFAULT_READER_MODEL, fetchImpl = fetch } = opts
  const started = Date.now()
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: messageMessages(source, catalog, opts), response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(50_000),
  })
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
  }
  if (!res.ok) throw new Error(`Message reader: ${res.status} ${body.error?.message ?? ''}`.trim())
  let raw: unknown = null
  try {
    raw = JSON.parse(body.choices?.[0]?.message?.content ?? 'null')
  } catch {
    raw = null
  }
  return {
    ...tidyMessageReading(raw, catalog, source),
    model,
    ms: Date.now() - started,
    usage: {
      input: body.usage?.prompt_tokens ?? 0,
      cachedInput: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      output: body.usage?.completion_tokens ?? 0,
    },
  }
}

// ── What comes back from the browser on Send ────────────────────────────────
// The person sends back what they saw, maybe with an item taken off or a
// branch picked. It's checked again here: the same shapes and limits as a
// reading, nothing more. The change itself is worked out again on the
// server from the listing as it is now (itemsChange, newPlaceSubmission).

export function sentItems(v: unknown): ReadItem[] {
  if (!Array.isArray(v)) return []
  const out: ReadItem[] = []
  for (const r of v.slice(0, MAX_ITEMS)) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const name = str(o.name, 60)
    if (!name || !AVAILABILITY.has(o.availability as Availability)) continue
    out.push({ name: addedItemName(name), availability: o.availability as Availability, doubt: str(o.doubt, 200) })
  }
  return out
}

export function sentPlace(v: unknown): PlaceRead | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const name = str(o.name, 120)
  if (!name) return null
  return {
    name,
    kind: str(o.kind, 80),
    address: str(o.address, 200),
    phone: str(o.phone, 40),
    website: str(o.website, 300),
    kosherCert: str(o.kosherCert, 80),
    meatDairy: str(o.meatDairy, 120),
    notes: str(o.notes, 600),
  }
}
