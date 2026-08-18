import {
  PHOTO_FIELD_KEY,
  TYPE_IS_FILTERABLE,
  resolveCapabilities,
  slugifyFieldKey,
  type CategoryCapabilities,
  type CategoryConfig,
  type CategoryField,
  type FieldType,
} from '@/lib/categories'

// ── Pure logic behind CategoryEditor — draft shape, template/field
// normalization, and the two destructive-change detectors (option rename,
// field removal). No React here so it can be reasoned about (and tested)
// independently of the ~1000 lines of JSX that consume it. ──

export type Draft = {
  label: string
  pluralLabel: string
  /** One emoji shown on the card (home grid, map legend, admin list). */
  icon: string
  /** An uploaded picture shown instead of `icon` — see CategoryConfig's own
   *  iconImageUrl. Blank means none (fall back to the emoji). */
  iconImageUrl: string
  description: string
  hasAddress: boolean
  hasPhone: boolean
  upvotesEnabled: boolean
  capabilities: CategoryCapabilities
  /** The editable fields (everything shown on a card). */
  fields: CategoryField[]
  /** Fields with renderAs 'hidden' (caveat notes) — not editable here, but
   *  preserved as-is and re-merged on save so editing a category never drops
   *  or exposes them. */
  hiddenFields: CategoryField[]
  /** Whether the external-link button section is turned on — kept separate
   *  from the label/url text so unchecking hides the fields without losing
   *  whatever was typed (in case the admin re-checks it). */
  externalLinkEnabled: boolean
  /** A button in the directory header linking out, e.g. "Other Mikvahs" →
   *  mikvah.org. Both blank means none. */
  externalLinkLabel: string
  externalLinkUrl: string
  /** Photo shown as the home-screen card's background instead of the flat
   *  tint. Blank means none — the text color below is only used when this
   *  is set. */
  cardImageUrl: string
  /** Text color over the card image (a hex string). */
  cardTextColor: string
}

export const CAPABILITY_LABELS: Record<keyof CategoryCapabilities, string> = {
  add: 'Add button',
  edit: 'Edit button',
  report: 'Report button',
  directorySearch: 'Search bar',
  map: 'Map button',
}

// Where a newly-added Photo field belongs: right after Website (or right
// after Hours if there's no Website; or at the very front if neither) — same
// slot it holds in the editor's own "Every listing also has" checkboxes, so
// the intake/edit form's field order actually matches what admins see there.
// A plain function (not tied to any component) since toDraft below — where a
// fresh category's Photo first gets seeded — runs outside CategoryEditor.
export function photoInsertIndex(fields: CategoryField[]): number {
  const websiteIndex = fields.findIndex((f) => f.type === 'url' && f.label.trim().toLowerCase() === 'website')
  if (websiteIndex !== -1) return websiteIndex + 1
  const hoursIndex = fields.findIndex((f) => f.type === 'hours' && !f.audienceKey)
  if (hoursIndex !== -1) return hoursIndex + 1
  return 0
}

// Derive the singular from the plural name by dropping a trailing "s" (only
// when preceded by a non-"s", so "Class"/"Mikvah" stay put). Good enough for
// the "Add a …" phrasing across realistic category names.
export function singularize(plural: string): string {
  const s = plural.trim()
  return /[^s]s$/i.test(s) ? s.slice(0, -1) : s
}

export function toDraft(c: CategoryConfig | null): Draft {
  const all = (c?.detailFields ?? []).map((f) => ({ ...f }))
  const fields = all.filter((f) => f.renderAs !== 'hidden')
  // Photo starts checked — for a brand-new category AND the first time an
  // existing one is opened after this feature shipped — unlike Hours/Website,
  // which start off. Once saved (even untouched), its presence in `fields`
  // becomes the real source of truth, same as everything else here; an
  // admin who explicitly unchecks it stays unchecked from then on.
  //
  // Position is re-derived on every load (not just when first added) rather
  // than trusted from whatever was saved — Photo isn't reachable in the
  // Details list to manually reorder (see managedPhotoIndex), so unlike a
  // real field its position is never a deliberate admin choice to respect,
  // only ever this checkbox's own placement rule (photoInsertIndex). This
  // also self-heals categories saved before that rule existed.
  const existingPhotoIndex = fields.findIndex((f) => f.type === 'image')
  const photoField =
    existingPhotoIndex === -1
      ? { key: PHOTO_FIELD_KEY, label: 'Photo', type: 'image' as FieldType, renderAs: 'row' as const }
      : fields.splice(existingPhotoIndex, 1)[0]!
  fields.splice(photoInsertIndex(fields), 0, photoField)
  return {
    label: c?.label ?? '',
    pluralLabel: c?.pluralLabel ?? '',
    icon: c?.icon ?? '',
    iconImageUrl: c?.iconImageUrl ?? '',
    description: c?.description ?? '',
    hasAddress: c?.hasAddress ?? true,
    hasPhone: c?.hasPhone ?? true,
    upvotesEnabled: !!c?.upvotesEnabled,
    capabilities: resolveCapabilities(c?.capabilities),
    fields,
    hiddenFields: all.filter((f) => f.renderAs === 'hidden'),
    externalLinkEnabled: !!c?.externalLink,
    externalLinkLabel: c?.externalLink?.label ?? '',
    externalLinkUrl: c?.externalLink?.url ?? '',
    cardImageUrl: c?.cardImageUrl ?? '',
    cardTextColor: c?.cardTextColor || '#ffffff',
  }
}

// The editor asks Name / Type / Show as / Required, plus (for Choice) whether
// a listing can hold more than one value; the filter + tag rules are implied
// and applied here on save:
//   • Badge (Yes/No, Choice) → a filter. Row → display only, no filter.
//   • Hours → always the "Open now" filter.
//   • Tags → always chips + click-to-search (never a filter); their tag group is
//     derived from the name once, then frozen so a rename can't orphan tags.
// Note: the directory's *filter* for a Choice field always allows picking more
// than one value, regardless of `multiSelect` — that flag only controls how
// many values a single listing can be assigned (see CategoryField.multiSelect).
export function normalizeField(f: CategoryField): CategoryField {
  const out: CategoryField = { ...f }
  const isBadge = out.renderAs !== 'row'

  if (out.type === 'tags') {
    out.renderAs = 'badge'
    out.tagGroup = out.tagGroup || slugifyFieldKey(out.label)
    out.filterable = false
    out.multiSelect = undefined
  } else if (out.type === 'hours') {
    out.filterable = true
    out.multiSelect = undefined
  } else if (TYPE_IS_FILTERABLE(out.type)) {
    // Yes/No or Choice: the badge is the filter; a row is display-only.
    out.filterable = isBadge
    if (out.type !== 'select') out.multiSelect = undefined
  } else {
    out.filterable = false
    out.multiSelect = undefined
  }
  // "Other" only means anything for a Choice field (single- or multi-value
  // alike — see MultiSelectField/SelectOtherField) — clear it if the type
  // changed away from 'select'.
  if (out.type !== 'select') out.allowOther = undefined
  return out
}

// Re-merges a category's editable fields with its preserved hidden ones for
// saving/previewing. A caveat's flag/note pair (see CategoryField.caveat) is
// inserted right after the field it belongs to — not appended at the very
// end — so it renders next to Kosher Certification (etc.) in the actual
// intake/edit form instead of trailing behind unrelated details like Dietary
// options or Menu. Any hidden field not claimed by a caveat (shouldn't
// happen today, but keeps this total) falls back to the end.
export function mergeFieldsWithHidden(fields: CategoryField[], hiddenFields: CategoryField[]): CategoryField[] {
  const claimed = new Set<string>()
  const merged: CategoryField[] = []
  for (const f of fields) {
    merged.push(f)
    if (!f.caveat) continue
    for (const key of [f.caveat.flagField, f.caveat.noteField]) {
      const hidden = hiddenFields.find((h) => h.key === key)
      if (hidden) {
        merged.push(hidden)
        claimed.add(key)
      }
    }
  }
  for (const h of hiddenFields) {
    if (!claimed.has(h.key)) merged.push(h)
  }
  return merged
}

export function serializeOptions(options?: { value: string; label: string }[]): string {
  return (options ?? [])
    .map((o) => (o.label && o.label !== o.value ? `${o.value} | ${o.label}` : o.value))
    .join('\n')
}

export function parseOptions(text: string): { value: string; label: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, ...rest] = line.split('|')
      const v = value.trim()
      const label = rest.join('|').trim()
      return { value: v, label: label || v }
    })
}

export function validateDraft(draft: Draft): string[] {
  const errs: string[] = []
  if (!draft.pluralLabel.trim()) errs.push('Category name is required.')
  // Seed the key set with the preserved hidden fields so a new visible field
  // can't collide with a caveat note / minyanim key.
  const keys = new Set<string>(draft.hiddenFields.map((f) => f.key))
  draft.fields.forEach((f, i) => {
    const n = i + 1
    if (!f.label.trim()) errs.push(`Detail ${n}: needs a name.`)
    else if (keys.has(f.key)) errs.push(`Detail ${n}: another detail is already named “${f.label}”.`)
    else keys.add(f.key)
    if (f.type === 'select' && !(f.options && f.options.length > 0))
      errs.push(`Detail ${n} (“${f.label || 'unnamed'}”): a Choice needs at least one option.`)
    if (f.type === 'tags' && f.fixedVocabulary && !(f.options && f.options.length > 0))
      errs.push(`Detail ${n} (“${f.label || 'unnamed'}”): a fixed-list Tags field needs at least one tag.`)
  })
  return errs
}

// Detail field keys that existed on the saved category but aren't in the
// draft anymore — i.e. the admin removed them (not just renamed one, which
// keeps the same key). Hidden fields are never offered for removal here, so
// they're excluded from "before" on purpose.
export function removedFieldKeys(draft: Draft, initial: CategoryConfig | null): string[] {
  if (!initial) return []
  const keptKeys = new Set(draft.fields.map((f) => f.key))
  return initial.detailFields.filter((f) => f.renderAs !== 'hidden' && !keptKeys.has(f.key)).map((f) => f.key)
}

// Detects a select/tags field whose options list lost exactly one value and
// gained exactly one — the unambiguous case of "the admin edited an
// option's text in place" (the options textarea otherwise treats that as
// removing the old value and adding an unrelated new one, orphaning any
// listing that had it selected). Anything less clear-cut (multiple options
// changed at once, a value removed with nothing added) isn't guessed at —
// it's left for the admin to notice via field-usage the normal way.
export function detectOptionRenames(
  draft: Draft,
  initial: CategoryConfig | null,
): { fieldKey: string; fieldLabel: string; oldValue: string; newValue: string }[] {
  if (!initial) return []
  const renames: { fieldKey: string; fieldLabel: string; oldValue: string; newValue: string }[] = []
  for (const draftField of draft.fields) {
    if (draftField.type !== 'select' && draftField.type !== 'tags') continue
    const initialField = initial.detailFields.find((f) => f.key === draftField.key && f.type === draftField.type)
    if (!initialField) continue
    const initialOptions = initialField.options ?? []
    const draftOptions = draftField.options ?? []
    const removed = initialOptions.filter((o) => !draftOptions.some((d) => d.value === o.value))
    const added = draftOptions.filter((o) => !initialOptions.some((i) => i.value === o.value))
    if (removed.length === 1 && added.length === 1) {
      renames.push({
        fieldKey: draftField.key,
        fieldLabel: draftField.label || draftField.key,
        oldValue: removed[0].value,
        newValue: added[0].value,
      })
    }
  }
  return renames
}

// Keeps a showIf condition pointed at the right value when the option it
// was gated on gets renamed — without this, "Delivery WhatsApp Group" would
// stay gated on a value nothing can select anymore the moment `foodType`'s
// "Out of Town Deliveries" became "Scheduled Deliveries" (or any other
// field's rename). Applied automatically; doesn't need admin confirmation
// since it's just keeping the config internally consistent.
export function fieldsWithRenamedShowIf(
  fields: CategoryField[],
  renames: { fieldKey: string; oldValue: string; newValue: string }[],
): CategoryField[] {
  if (renames.length === 0) return fields
  return fields.map((f) => {
    if (!f.showIf) return f
    const match = renames.find((r) => r.fieldKey === f.showIf!.field && f.showIf!.equals === r.oldValue)
    if (!match) return f
    return { ...f, showIf: { ...f.showIf, equals: match.newValue } }
  })
}
