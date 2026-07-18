// ─────────────────────────────────────────────────────────────────────────────
// Category types.
//
// Category DEFINITIONS now live in the `category` table (data-driven), so new
// categories can be created on approval without a code change. This file only
// holds the shared types. Server code reads categories via `categoryStore.ts`;
// client code fetches them from `GET /api/categories`.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'tel' | 'textarea' | 'number' | 'boolean' | 'select' | 'tags' | 'url' | 'hours' | 'minyanim'

/** The field types offered in the editor's Type picker, most-common first. */
export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'tel', label: 'Phone' },
  { value: 'url', label: 'Link' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Choice (dropdown)' },
  { value: 'tags', label: 'Tags' },
  { value: 'hours', label: 'Hours' },
  { value: 'minyanim', label: 'Davening Times (Minyanim)' },
]

/** Each type's natural display shape on a card — a `badge` (chip beside the
 *  name) or a `row` (labeled line). Used to set a sensible default when the type
 *  changes; the editor only offers a badge/row *choice* for the types where it's
 *  a real, effective decision (see TYPE_HAS_SHAPE_CHOICE). */
export const FIELD_TYPE_SHAPE: Record<FieldType, 'badge' | 'row'> = {
  boolean: 'badge',
  select: 'badge',
  tags: 'badge',
  text: 'row',
  textarea: 'row',
  tel: 'row',
  url: 'row',
  number: 'row',
  hours: 'row',
  minyanim: 'row',
}

/** Types where badge-vs-row is a genuine, effective choice (a short categorical
 *  value that reads fine either way). Others are fixed: tags always render as
 *  chips, and text/phone/number/link/hours are always rows. */
export const TYPE_HAS_SHAPE_CHOICE = (type: FieldType): boolean =>
  type === 'boolean' || type === 'select'

/** Types the directory can actually build a filter control for (see
 *  GenericDirectory) — so the editor only offers "filter by this" where it works. */
export const TYPE_IS_FILTERABLE = (type: FieldType): boolean =>
  type === 'boolean' || type === 'select' || type === 'hours'

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

/** Per-category UI affordances, layered UNDER the site-wide `ui.*` master
 *  switches in community.config. Effective visibility = global flag AND the
 *  matching capability here (see the `ui.*` consumers). Upvotes are tracked
 *  separately via `upvotesEnabled` (its own DB column), not in this object. */
export type CategoryCapabilities = {
  /** "Add {category}" buttons on this category's directory. */
  add: boolean
  /** Per-listing "Edit" button. */
  edit: boolean
  /** Per-listing "Report" button. */
  report: boolean
  /** The search bar on this category's directory. */
  directorySearch: boolean
}

/** The ordered capability keys, for building the admin toggles. */
export const CATEGORY_CAPABILITY_KEYS: (keyof CategoryCapabilities)[] = [
  'add',
  'edit',
  'report',
  'directorySearch',
]

/** Every capability defaults ON — an unset category behaves exactly as before
 *  this feature existed (the global `ui.*` flags alone decide). */
export const CATEGORY_CAPABILITY_DEFAULTS: CategoryCapabilities = {
  add: true,
  edit: true,
  report: true,
  directorySearch: true,
}

/** Fills in defaults for any missing capability key. Use this everywhere a
 *  capability is read, so partial/absent stored objects (and the fallback
 *  categories) always resolve to a complete, valid shape. */
export function resolveCapabilities(
  raw?: Partial<CategoryCapabilities> | null,
): CategoryCapabilities {
  return { ...CATEGORY_CAPABILITY_DEFAULTS, ...(raw ?? {}) }
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
  /** Per-category UI affordances (resolved with defaults). Server code always
   *  sets this via `resolveCapabilities`; client consumers should still guard
   *  with `resolveCapabilities` in case of cached/fallback data. */
  capabilities?: CategoryCapabilities
}

export const DEFAULT_CATEGORY_ICON = '📋'

/** Turns a human field label into a safe `details` key, e.g. "Grades served" →
 *  "grades_served". Used by the admin field editor to auto-fill the key. */
export function slugifyFieldKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

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
