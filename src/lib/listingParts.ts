import type { CategoryConfig, CategoryField } from './categories'

// ── What an admin adds to each of a category's opened listings ──────────────
// Three general tools, made for hospitals (step 5, agreed Oct 2) and open to
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
//   setLocation   "Set as location" among the listing's buttons, for a place
//                 people stay at and measure from: a hospital, a hotel.
//
// Stored as it came from the database and read through parseListingParts,
// so an unknown shape means none of them rather than an error.

export type ListingParts = {
  main?: { title: string; fields: string[] }
  shabbos?: { fields: string[] }
  setLocation?: boolean
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
    parts.shabbos = { fields: keys((r.shabbos as Record<string, unknown>).fields) }
  }
  if (r.setLocation === true) parts.setLocation = true
  return parts
}

function keys(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((f): f is string => typeof f === 'string' && !!f))] : []
}

/** Whether there's anything to store: none of them is null in the column. */
export function hasListingParts(parts: ListingParts): boolean {
  return !!parts.main || !!parts.shabbos || !!parts.setLocation
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

/** The fields a card can show: what a person writes or picks. */
export function cardFieldChoices(fields: readonly CategoryField[]): CategoryField[] {
  return fields.filter((f) => ['text', 'textarea', 'select', 'boolean', 'tel', 'url'].includes(f.type) && !f.audienceKey && f.renderAs !== 'hidden')
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
    const r = JSON.parse(key) as Record<string, { title?: unknown; fields?: unknown } | boolean | undefined>
    const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [])
    const main = r.main as { title?: unknown; fields?: unknown } | undefined
    const shabbos = r.shabbos as { fields?: unknown } | undefined
    return {
      ...(main ? { main: { title: typeof main.title === 'string' ? main.title : '', fields: keys(main.fields) } } : {}),
      ...(shabbos ? { shabbos: { fields: keys(shabbos.fields) } } : {}),
      ...(r.setLocation === true ? { setLocation: true } : {}),
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
