import type { CategoryConfig, CategoryField } from './categories'

// ── What an admin adds to each of a category's opened listings ──────────────
// General tools, made for hospitals (step 5, agreed Oct 2) and open to
// any category, set in the category editor and stored together
// (CategoryConfig.listingParts):
//
//   main          a card the admin names, of fields they tick, shown as the
//                 listing's main thing: "Who to call first", with its name,
//                 what they help with and a Call button. Without it the main
//                 thing is chosen by what the listing holds (mainThing).
//   shabbos       a "This Shabbos" card: candle lighting, the nearest
//                 minyan, and the fields ticked here (the eruv, kosher food
//                 inside). First on the page on Friday and Erev Yom Tov.
//   boxes         boxes the admin names, each of the fields they tick, in
//                 order (Oct 6, a hospital on Refuah's sections: "Who to
//                 call", "Kosher food" with its pantry and food packages,
//                 "A place to stay", "Rides"). The listing leads with them.
//                 The Shabbos card can sit among them (shabbos.after: how
//                 many boxes come before it).
//   lead          the order of the boxes the listing makes itself, before
//                 the admin's (Nov 5, board 4's handles): a link's own box
//                 ("Delivery"), what isn't kosher, and the main thing ("Main
//                 dishes", the davening times, the card above). Unset, that
//                 order.
//   order         every box's place on the listing, as the admin dragged
//                 them (the user, Nov 10: "Can't we just have boxes and
//                 fields and an admin can arrange how they want?"). One
//                 token per box, the box's id (fieldBoxes.ts) but 'box' for
//                 each of the admin's, in turn. Once set, it decides the
//                 order and `lead` and `shabbos.after` are left out. A box
//                 it doesn't name goes after the one it follows anyway.
//   contact,      fields put in Contact or About that wouldn't go there by
//   about         themselves (the user, Nov 10: "why all fields can't just
//                 go anywhere"): a long text in Contact, a phone in About.
//                 Anything not listed goes where its kind puts it.
//
// Stored as it came from the database and read through parseListingParts,
// so an unknown shape means none of them rather than an error.

export type ListingBox = { title: string; fields: string[] }

/** The boxes the listing makes itself, before the admin's. */
export const LEAD_SLOTS = ['link', 'caveat', 'main'] as const
export type LeadSlot = (typeof LEAD_SLOTS)[number]

export type ListingParts = {
  main?: { title: string; fields: string[] }
  shabbos?: { fields: string[]; after?: number }
  boxes?: ListingBox[]
  lead?: LeadSlot[]
  order?: string[]
  contact?: string[]
  about?: string[]
}

export function parseListingParts(raw: unknown): ListingParts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const r = raw as Record<string, unknown>
  const parts: ListingParts = {}
  if (r.main && typeof r.main === 'object' && !Array.isArray(r.main)) {
    const m = r.main as Record<string, unknown>
    const fields = keys(m.fields)
    if (typeof m.title === 'string' && m.title.trim() && fields.length > 0) parts.main = { title: m.title.trim(), fields }
  }
  if (r.shabbos && typeof r.shabbos === 'object' && !Array.isArray(r.shabbos)) {
    const sh = r.shabbos as Record<string, unknown>
    parts.shabbos = { fields: keys(sh.fields) }
    if (typeof sh.after === 'number' && Number.isInteger(sh.after) && sh.after >= 0) parts.shabbos.after = sh.after
  }
  const boxes = Array.isArray(r.boxes)
    ? r.boxes.flatMap((b): ListingBox[] => {
        if (!b || typeof b !== 'object' || Array.isArray(b)) return []
        const o = b as Record<string, unknown>
        const fields = keys(o.fields)
        return typeof o.title === 'string' && o.title.trim() && fields.length > 0 ? [{ title: o.title.trim(), fields }] : []
      })
    : []
  if (boxes.length > 0) parts.boxes = boxes
  const lead = leadOf(r.lead)
  if (lead) parts.lead = lead
  const order = orderOf(r.order)
  if (order) parts.order = order
  for (const box of FIXED_PLACES) {
    const fields = keys(r[box])
    if (fields.length > 0) parts[box] = fields
  }
  return parts
}

/** A saved lead order: each slot once, the known ones, the missing ones
 *  after in their usual order. Null when it's the usual order anyway. */
function leadOf(raw: unknown): LeadSlot[] | null {
  if (!Array.isArray(raw)) return null
  const known = [...new Set(raw.filter((s): s is LeadSlot => (LEAD_SLOTS as readonly unknown[]).includes(s)))]
  const order = [...known, ...LEAD_SLOTS.filter((s) => !known.includes(s))]
  return order.join() === LEAD_SLOTS.join() ? null : order
}

/** A saved order: its tokens, once each but 'box', which is one per box. */
function orderOf(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const order = raw.filter((t): t is string => typeof t === 'string' && !!t && (t === 'box' || (!seen.has(t) && !!seen.add(t))))
  return order.length > 0 ? order : null
}

/** The order the admin dragged the boxes into, or null for the usual one. */
export function boxOrderOf(category: Pick<CategoryConfig, 'listingParts'>): string[] | null {
  return parseListingParts(category.listingParts).order ?? null
}

/** The boxes in the saved order. One it doesn't name (a box just made by
 *  adding a field) goes after the box it follows in the usual order. */
export function arrange<B extends { id: string }>(boxes: readonly B[], order: readonly string[]): B[] {
  const byId = new Map(boxes.map((b) => [b.id, b]))
  let n = 0
  const out: B[] = []
  for (const t of order) {
    const b = byId.get(t === 'box' ? `box:${n++}` : t)
    if (b && !out.includes(b)) out.push(b)
  }
  boxes.forEach((b, i) => {
    if (out.includes(b)) return
    const prev = boxes.slice(0, i).reverse().find((p) => out.includes(p))
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, b)
  })
  return out
}

/** The order the listing shows its own boxes in. */
export function leadOrderOf(category: Pick<CategoryConfig, 'listingParts'>): readonly LeadSlot[] {
  return parseListingParts(category.listingParts).lead ?? LEAD_SLOTS
}

/** The boxes every listing has that a field can be put in by name. */
export const FIXED_PLACES = ['contact', 'about'] as const
export type FixedPlace = (typeof FIXED_PLACES)[number]

/** Which of Contact and About the admin put a field in, when they did. */
export function fixedPlaceOf(category: Pick<CategoryConfig, 'listingParts'>): (key: string) => FixedPlace | null {
  const parts = parseListingParts(category.listingParts)
  return (key) => FIXED_PLACES.find((p) => parts[p]?.includes(key)) ?? null
}

function keys(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((f): f is string => typeof f === 'string' && !!f))] : []
}

/** Whether there's anything to store: none of them is null in the column. */
export function hasListingParts(parts: ListingParts): boolean {
  return !!parts.main || !!parts.shabbos || !!parts.boxes?.length || !!parts.lead || !!parts.order?.length || !!parts.contact?.length || !!parts.about?.length
}

/** The named main thing: its title and its fields, in the category's
 *  order, when any of them still exists. */
export function mainCardOf(category: CategoryConfig): { label: string; fields: CategoryField[] } | null {
  const main = parseListingParts(category.listingParts).main
  if (!main) return null
  const fields = category.detailFields.filter((f) => main.fields.includes(f.key) && f.renderAs !== 'hidden')
  return fields.length > 0 ? { label: main.title, fields } : null
}

/** The fields the Shabbos card shows, in the category's order. Null when
 *  the category has no Shabbos card. */
export function shabbosFieldsOf(category: CategoryConfig): CategoryField[] | null {
  const shabbos = parseListingParts(category.listingParts).shabbos
  if (!shabbos) return null
  return category.detailFields.filter((f) => shabbos.fields.includes(f.key))
}

/** The admin's boxes, each with its fields in the box's own order (a
 *  box's order is the admin's, not the category's: "Pantry" before "Food
 *  packages"), the ones that still exist. A box left with none isn't one. */
export function boxesOf(category: CategoryConfig): { title: string; fields: CategoryField[] }[] {
  const byKey = new Map(category.detailFields.filter((f) => f.renderAs !== 'hidden').map((f) => [f.key, f]))
  return (parseListingParts(category.listingParts).boxes ?? []).flatMap((b) => {
    const fields = b.fields.map((k) => byKey.get(k)).filter((f): f is CategoryField => !!f)
    return fields.length > 0 ? [{ title: b.title, fields }] : []
  })
}

/** The same, each with its id in the admin's list ('box:<n>', its place
 *  among all of them, empty ones included), for the saved order. */
export function boxesWithIds(category: CategoryConfig): { id: string; title: string; fields: CategoryField[] }[] {
  const byKey = new Map(category.detailFields.filter((f) => f.renderAs !== 'hidden').map((f) => [f.key, f]))
  return (parseListingParts(category.listingParts).boxes ?? []).flatMap((b, n) => {
    const fields = b.fields.map((k) => byKey.get(k)).filter((f): f is CategoryField => !!f)
    return fields.length > 0 ? [{ id: `box:${n}`, title: b.title, fields }] : []
  })
}

/** Where the Shabbos card goes among the boxes: after this many of them.
 *  Null for after the places within a walk, as it always went. */
export function shabbosAfter(category: CategoryConfig): number | null {
  return parseListingParts(category.listingParts).shabbos?.after ?? null
}

/** The fields a card can show: what a person writes or picks, and the
 *  ones that are a box of their own elsewhere, the davening times and a
 *  list of items (the user, Nov 10: any field in any box). */
export function cardFieldChoices(fields: readonly CategoryField[]): CategoryField[] {
  return fields.filter(
    (f) =>
      ['text', 'textarea', 'select', 'boolean', 'tel', 'url', 'contacts', 'number', 'hours', 'tags', 'minyanim'].includes(f.type) &&
      !f.audienceKey &&
      f.renderAs !== 'hidden',
  )
}

// ── In the category editor's draft ──────────────────────────────────────────
// Kept as one string, so the save sends it only when it changed.

export function listingPartsKey(parts: ListingParts): string {
  return hasListingParts(parts) ? JSON.stringify(parts) : ''
}

/** The draft's settings, kept as the admin left them: a card with no title
 *  or fields yet stays ticked while they fill it in. What's saved is read
 *  strictly (parseListingParts), so a card left unfinished isn't. */
export function listingPartsFromKey(key: string): ListingParts {
  if (!key) return {}
  try {
    const r = JSON.parse(key) as Record<string, unknown>
    const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [])
    const title = (v: unknown) => (typeof v === 'string' ? v : '')
    const main = r.main as { title?: unknown; fields?: unknown } | undefined
    const shabbos = r.shabbos as { fields?: unknown; after?: unknown } | undefined
    const boxes = Array.isArray(r.boxes) ? (r.boxes as { title?: unknown; fields?: unknown }[]) : []
    return {
      ...(main ? { main: { title: title(main.title), fields: keys(main.fields) } } : {}),
      ...(shabbos ? { shabbos: { fields: keys(shabbos.fields), ...(typeof shabbos.after === 'number' ? { after: shabbos.after } : {}) } } : {}),
      // Kept while the admin fills one in: a box with no title or fields yet
      // stays in the draft.
      ...(boxes.length > 0 ? { boxes: boxes.map((b) => ({ title: title(b?.title), fields: keys(b?.fields) })) } : {}),
      ...(leadOf(r.lead) ? { lead: leadOf(r.lead)! } : {}),
      ...(orderOf(r.order) ? { order: orderOf(r.order)! } : {}),
      ...Object.fromEntries(FIXED_PLACES.flatMap((p) => (keys(r[p]).length > 0 ? [[p, keys(r[p])]] : []))),
    }
  } catch {
    return {}
  }
}

/** What the save sends: the draft read strictly. */
export function listingPartsToSave(key: string): ListingParts | null {
  const parts = parseListingParts(listingPartsFromKey(key))
  return hasListingParts(parts) ? parts : null
}
