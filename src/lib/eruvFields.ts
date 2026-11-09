import type { CategoryConfig, CategoryField, FieldType } from './categories'
import type { Eruv } from './eruv'
import { hasListingParts, parseListingParts, type ListingParts } from './listingParts'

// ── An eruv's fields and boxes (Nov 9) ──────────────────────────────────────
// The user, Nov 9: "keep what we have but just have it on that category page
// that way someone can change it if they want. And an admin starting a new
// community can add or change things as they apply." So the Eruv page has
// Fields like every category page (CategoryEditor), and an opened eruv
// (EruvListing) shows its boxes from them, after its name and status, which
// are always first.
//
// Four fields are the eruv table's own columns, and ready-made: the same
// name everywhere, taken off and put back but never renamed. A page that has
// never had its fields saved has these four, in the boxes an eruv always
// had, so nothing changes until an admin changes it. A field an admin makes
// keeps its value in the eruv's `details` (migration 094), by its key, as a
// listing keeps its own.

export const ERUV_FIELDS: readonly CategoryField[] = [
  { key: 'covers', label: 'Where it goes', type: 'textarea' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'hotline', label: 'Hotline', type: 'tel' },
  { key: 'alertsUrl', label: 'Email alerts', type: 'url' },
]

/** Where it goes in a box of its own, by that name, as it always was. */
export const ERUV_PARTS: ListingParts = { boxes: [{ title: 'Where it goes', fields: ['covers'] }] }

const BUILT_IN = new Set(ERUV_FIELDS.map((f) => f.key))

/** One of the eruv table's own columns, not a field an admin made. */
export function isEruvColumn(key: string): boolean {
  return BUILT_IN.has(key)
}

/** The kinds a field on the Eruv page can be: what an opened eruv shows in
 *  a box and its editors take as one input. */
export const ERUV_FIELD_TYPES: readonly FieldType[] = ['text', 'textarea', 'tel', 'url', 'number', 'boolean', 'select']

/** The Eruv page as it shows: its own fields and boxes, or, never saved,
 *  the four it always had. It has no address or phone of its own: an eruv
 *  isn't a place on the map, and its hotline is a field. */
export function withEruvFields(c: CategoryConfig): CategoryConfig {
  if (c.kind !== 'eruv') return c
  const saved = (c.detailFields ?? []).length > 0 || hasListingParts(parseListingParts(c.listingParts))
  return {
    ...c,
    hasAddress: false,
    hasPhone: false,
    ...(!saved && { detailFields: ERUV_FIELDS.map((f) => ({ ...f })), listingParts: ERUV_PARTS }),
  }
}

/** What an eruv holds for each field, by key: its own columns, then what
 *  it keeps for the fields made on its page. */
export function eruvValues(e: Pick<Eruv, 'covers' | 'website' | 'hotline' | 'alertsUrl' | 'details'>): Record<string, unknown> {
  return { ...(e.details ?? {}), covers: e.covers, website: e.website, hotline: e.hotline, alertsUrl: e.alertsUrl }
}

/** The fields made on the page: the ones whose values are kept in
 *  `details`. Only the kinds an eruv takes: a field of any other (a photo)
 *  isn't one an eruv has. */
export function ownEruvFields(fields: readonly CategoryField[]): CategoryField[] {
  return fields.filter((f) => !isEruvColumn(f.key) && f.renderAs !== 'hidden' && ERUV_FIELD_TYPES.includes(f.type))
}

const KEY = /^[a-z][a-z0-9_]{0,59}$/i

/** What an eruv keeps for its page's own fields, as sent: a field key to
 *  short text, a yes, or a few choices. Anything else is left out; an empty
 *  value isn't kept. Null when it isn't an object at all. */
export function readEruvDetails(raw: unknown): Record<string, string | boolean | string[]> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, string | boolean | string[]> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    if (!KEY.test(k) || isEruvColumn(k)) continue
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 600)
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = String(v)
    else if (v === true) out[k] = true
    else if (Array.isArray(v)) {
      const picks = v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 120)).slice(0, 20)
      if (picks.length > 0) out[k] = picks
    }
  }
  return out
}

/** The own fields of a community's Eruv page, from its pages: none when it
 *  has no Eruv page. */
export function eruvPageOwnFields(pages: readonly CategoryConfig[]): CategoryField[] {
  const page = pages.find((c) => c.kind === 'eruv')
  return page ? ownEruvFields(withEruvFields(page).detailFields) : []
}
