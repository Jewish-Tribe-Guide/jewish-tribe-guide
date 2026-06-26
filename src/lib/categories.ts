// ─────────────────────────────────────────────────────────────────────────────
// Category types.
//
// Category DEFINITIONS now live in the `category` table (data-driven), so new
// categories can be created on approval without a code change. This file only
// holds the shared types. Server code reads categories via `categoryStore.ts`;
// client code fetches them from `GET /api/categories`.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'tel' | 'textarea' | 'number' | 'boolean' | 'select' | 'tags' | 'url' | 'hours' | 'minyanim'

export type CategoryField = {
  /** Key inside the listing's `details` JSONB object. */
  key: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  help?: string
  /** Options for `type: 'select'`. */
  options?: { value: string; label: string }[]
  /** For `type: 'tags'`: which tag vocabulary group to draw from / add to. The
   *  field's value is an array of tag labels stored on the listing's `details`. */
  tagGroup?: string
  /** Only show this field (in the form and on cards) when another detail field
   *  has the given value, e.g. show "Kosher items" only when isKosher is true. */
  showIf?: { field: string; equals: string | number | boolean }
  /** For `type: 'url'`: the button text shown on the card (e.g. "Join group"). */
  linkLabel?: string
  /** For a row field: render just the value, without the "Label:" prefix. */
  hideLabel?: boolean
  // ── Presentation hints (used by the generic card renderer) ──
  /** How to show this field on a card. Defaults: boolean→badge, others→row. */
  renderAs?: 'badge' | 'row' | 'hidden'
  /** Show a filter control for this field in the category list. */
  filterable?: boolean
  /** Label for the filter toggle/chip (e.g. "Kosher"). Defaults to `label`. */
  filterLabel?: string
  /** For filterable select fields: render chips instead of a single-select dropdown,
   *  allowing multiple values to be selected simultaneously. */
  multiSelect?: boolean
  /** For `type: 'url'`: show the link button in the collapsed card header so it's
   *  always visible without expanding (e.g. "Join group" on WhatsApp listings). */
  showInHeader?: boolean
  /** For a badge field: when `flagField` is truthy on the listing, render this
   *  badge in amber (caution) and surface `noteField`'s free text as the
   *  explanation — on hover (desktop) and in the expanded card (mobile). Used
   *  for food establishments that carry a hechsher but aren't entirely kosher
   *  (the note says what isn't). The note is authored per listing, not generic. */
  caveat?: { flagField: string; noteField: string }
}

export type CategoryConfig = {
  /** Slug stored in `resource.category`, e.g. 'grocery'. */
  id: string
  label: string
  pluralLabel: string
  icon: string
  description: string
  /** Category-specific fields, stored in each listing's `details`. */
  detailFields: CategoryField[]
  sortOrder?: number
  /** Community-wide (not tied to a hospital): the listing form hides
   *  hospital/address/distance/phone, and the list shows every entry regardless
   *  of the selected hospital. */
  community?: boolean
  /** Whether listings in this category can be upvoted. */
  upvotesEnabled?: boolean
}

export const DEFAULT_CATEGORY_ICON = '📋'

// Category ids that are community-wide rather than hospital-scoped (e.g. WhatsApp
// groups). Kept in code since these are rare and owner-defined.
export const COMMUNITY_CATEGORY_IDS = new Set<string>(['whatsapp'])

// Category ids whose listings must NOT auto-sync from Google Places. Two kinds:
//   • community categories (not real map places, e.g. whatsapp), and
//   • categories whose value is hand-curated community info Google doesn't have
//     (synagogue davening times, mikvah schedules, bikur cholim rooms).
// The place-id backfill skips these, so no placeId is ever assigned and the
// sync can never overwrite their curated fields. Ids that don't exist are
// harmless. (Mirrors COMMUNITY_CATEGORY_IDS for 'whatsapp'.)
export const SYNC_EXCLUDED_CATEGORY_IDS = new Set<string>([
  'whatsapp',
  'synagogue',
  'mikvah',
  'bikur-cholim',
])

/** Whether listings in this category are eligible for Google Places auto-sync
 *  (commercial places with real hours: grocery, restaurant, hotel, dentist, …). */
export function isCategorySyncEligible(categoryId: string): boolean {
  return !SYNC_EXCLUDED_CATEGORY_IDS.has(categoryId)
}

// Evaluates a field's `showIf` against the current detail values.
export function fieldIsVisible(field: CategoryField, details: Record<string, unknown>): boolean {
  if (!field.showIf) return true
  return details[field.showIf.field] === field.showIf.equals
}
