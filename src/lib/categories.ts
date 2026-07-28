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

/** Normalizes a `type: 'select'` field's stored value to an array of chosen
 *  option values, regardless of shape — a field with `multiSelect: true` (e.g.
 *  "Type": Restaurant/Catering) can hold more than one value on one listing,
 *  stored as `string[]`. A single-value select (the default) still stores a
 *  plain string — treated as a one-element array so both shapes read
 *  identically everywhere a select field's value is used (card badges,
 *  directory filters). */
export function selectValues(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[]
  if (value === undefined || value === null || value === '') return []
  return [String(value)]
}

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
  /** For `type: 'tags'`: keep this field's tags out of the collapsed card
   *  header — they only show once the listing is expanded. Lets a category
   *  have a small, prominent tag group visible right away (e.g. broad kosher
   *  labels) plus a more niche one that's one tap away instead of crowding
   *  the header. Still fully searchable and clickable, exactly like a header
   *  tag — only where it displays differs. Defaults to shown in the header
   *  (today's behavior for every existing tags field). */
  expandedOnly?: boolean
  /** For `type: 'tags'`: restrict this field to the fixed list in `options`
   *  below — nobody filling out a listing can add a new tag on the fly, only
   *  pick from what the admin set. Typing still filters/searches that list.
   *  Defaults to the open, customizable vocabulary every tags field has had
   *  until now (anyone can add a new tag, which then joins the shared
   *  vocabulary for that `tagGroup`). Independent of `expandedOnly` — a
   *  "primary" tags field is typically fixedVocabulary + shown in the header;
   *  a "secondary" one is typically open + expandedOnly, but any combination
   *  works. */
  fixedVocabulary?: boolean
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
  /** For `type: 'select'`: whether a single listing can hold more than one
   *  chosen value (e.g. a place that's both "Restaurant" and "Catering").
   *  Defaults to single-value. Independent of the directory's filter for this
   *  field, which always lets a visitor pick multiple values regardless of
   *  this setting (see GenericDirectory's filterableSelects rendering). */
  multiSelect?: boolean
  /** For `type: 'url'`: show the link button in the collapsed card header so it's
   *  always visible without expanding (e.g. "Join group" on WhatsApp listings). */
  showInHeader?: boolean
  /** For a `type: 'url'` field NOT shown in the header: place its button next
   *  to the previous url button instead of on its own line (e.g. "Website"
   *  and "Kosher Certification" side by side). Only takes effect when set on
   *  the second (and later) button in a run — the first button in a group is
   *  wherever it already was. Defaults off (stacked), matching how every
   *  existing button field looks today. */
  inlineButton?: boolean
  /** For a badge field: when `flagField` is truthy on the listing, render this
   *  badge in amber (caution) and surface `noteField`'s free text as the
   *  explanation — on hover (desktop) and in the expanded card (mobile). Used
   *  for food establishments that carry a hechsher but aren't entirely kosher
   *  (the note says what isn't). The note is authored per listing, not generic. */
  caveat?: { flagField: string; noteField: string }
  /** Ties this field to one of the category's own filterable boolean fields
   *  (its `key`), e.g. a "Women's Hours" field tagged with the "Women's
   *  Tevillah" boolean's key. Groups audience-specific fields (a mikvah's
   *  separate men's/women's/keilim hours, phone, notes, …) into their own
   *  section in the intake form, and gates each field to listings that have
   *  checked the matching boolean (see `fieldIsVisible`). Cards always show
   *  every field the listing has, regardless of which filters are active. */
  audienceKey?: string
  /** Shown instead of `label` when this field renders inside its audienceKey
   *  section in the intake form — e.g. "Phone" instead of "Women's Phone",
   *  since the section heading (the audience field's filterLabel/label,
   *  "Women's") already says who it's for. Card display and everywhere else
   *  still use the full `label`, since a card doesn't group by section and
   *  "Phone" alone would be ambiguous next to a Men's Phone on the same
   *  listing. Ignored on fields without an audienceKey. */
  shortLabel?: string
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
  /** The "🗺️ Map" button on this category's directory (still subject to the
   *  site-wide `ui.map.enabled` switch and never shown for community-wide
   *  categories, which aren't tied to a physical location). */
  map: boolean
}

/** The ordered capability keys, for building the admin toggles. */
export const CATEGORY_CAPABILITY_KEYS: (keyof CategoryCapabilities)[] = [
  'add',
  'edit',
  'report',
  'directorySearch',
  'map',
]

/** Every capability defaults ON — an unset category behaves exactly as before
 *  this feature existed (the global `ui.*` flags alone decide). */
export const CATEGORY_CAPABILITY_DEFAULTS: CategoryCapabilities = {
  add: true,
  edit: true,
  report: true,
  directorySearch: true,
  map: true,
}

/** Fills in defaults for any missing capability key. Use this everywhere a
 *  capability is read, so partial/absent stored objects (and the fallback
 *  categories) always resolve to a complete, valid shape. */
export function resolveCapabilities(
  raw?: Partial<CategoryCapabilities> | null,
): CategoryCapabilities {
  return { ...CATEGORY_CAPABILITY_DEFAULTS, ...(raw ?? {}) }
}

/** Almost every category row is a real listing directory ('listing'). The other
 *  kinds are singleton pseudo-categories — an admin can add/remove at most one
 *  of each, and they render as a fixed, code-driven screen (the sitewide map,
 *  the Zmanim card, the Eruv Information card, the Jewish Medical Resources
 *  card) instead of a generic directory. A category's `kind` is immutable once
 *  created, like its `id`. */
export type CategoryKind = 'listing' | 'map' | 'zmanim' | 'eruv' | 'medical'

export type CategoryConfig = {
  /** Slug stored in `resource.category`, e.g. 'grocery'. */
  id: string
  label: string
  pluralLabel: string
  icon: string
  description: string
  /** Category-specific fields, stored in each listing's `details`. */
  detailFields: CategoryField[]
  /** Defaults to 'listing' for every real directory category. */
  kind: CategoryKind
  sortOrder?: number
  /** Whether listings in this category have an address (default true when
   *  unset). Off for things like WhatsApp groups that aren't a physical place
   *  — the listing form hides the address field, distance/sorting-by-location
   *  is skipped, and the "Map" capability has no effect (nothing to plot). */
  hasAddress?: boolean
  /** Whether listings in this category have a phone number (default true when
   *  unset) — the listing form hides the phone field when off. */
  hasPhone?: boolean
  /** Whether listings in this category can be upvoted. */
  upvotesEnabled?: boolean
  /** Per-category UI affordances (resolved with defaults). Server code always
   *  sets this via `resolveCapabilities`; client consumers should still guard
   *  with `resolveCapabilities` in case of cached/fallback data. */
  capabilities?: CategoryCapabilities
  /** An external link shown as its own button in the directory header, next to
   *  Map/Add — e.g. "Other Mikvahs" pointing at a broader directory the site
   *  doesn't curate itself. Not tied to any listing. */
  externalLink?: { label: string; url: string } | null
  /** A photo shown as the home-screen card's background instead of the flat
   *  tint — a pasted image URL, not an upload. Null/unset falls back to the
   *  tint + icon look. */
  cardImageUrl?: string | null
  /** Text color over `cardImageUrl` (a hex string) — kept separate from the
   *  image so the title/icon stay legible regardless of the photo. Ignored
   *  when there's no image. */
  cardTextColor?: string | null
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

// Category ids whose listings must NOT auto-sync from Google Places. Two kinds:
//   • community-wide categories (not real map places, e.g. whatsapp — see the
//     `community` column/CategoryConfig field), and
//   • categories whose value is hand-curated community info Google doesn't have
//     (synagogue davening times, mikvah schedules, bikur cholim rooms).
// The place-id backfill skips these, so no placeId is ever assigned and the
// sync can never overwrite their curated fields. Ids that don't exist are
// harmless.
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
  // An audience-scoped field (see CategoryField.audienceKey) is a hard gate,
  // same as showIf: it isn't shown — or submittable — on a listing that
  // hasn't checked the matching boolean, full stop. No way to peek at it
  // manually; the form only ever offers what applies to this listing.
  if (field.audienceKey && !details[field.audienceKey]) return false
  if (!field.showIf) return true
  return details[field.showIf.field] === field.showIf.equals
}
