import { useState } from 'react'
import {
  PHOTO_FIELD_KEY,
  slugifyFieldKey,
  type CategoryCapabilities,
  type CategoryConfig,
  type CategoryField,
  type FieldType,
} from '@/lib/categories'
import { addToBox, madeField, renameKey } from '@/lib/fieldBoxes'
import { fieldRules } from '@/lib/fieldAbout'
import { partnerOf, partnerRule } from '@/lib/fieldPartners'
import { KOSHER_CAVEAT, kosherQuestions } from '@/lib/kosherQuestions'
import { listingPartsFromKey, listingPartsKey } from '@/lib/listingParts'
import { slugify } from '@/lib/routes'
import { photoInsertIndex, singularize, toDraft, type Draft } from './categoryEditorLogic'

// ── The draft state behind CategoryEditor and every mutation of it: naming,
// capabilities, and the field-schema editing (add /
// remove / reorder / toggle / audience groups). Kept separate from the save
// workflow (useCategorySaveWorkflow) and the confirmation gates, which only
// ever read this draft, never own it. ──

/** `seed` is the ready-made page a new one starts from (board 2). */
export function useCategoryFieldEditing(initial: CategoryConfig | null, seed: CategoryConfig | null = null) {
  const isNew = initial === null
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial ?? seed))
  // Whether the admin has directly edited the id field on a NEW category —
  // once true, typing a name no longer overwrites whatever they chose. Only
  // matters for isNew: an existing category's id already exists and never
  // auto-follows the name, touched or not.
  const [idTouched, setIdTouched] = useState(false)
  // The "+ Add audience group" mini-form's own draft state — separate from
  // `draft` since it's discarded on cancel and only ever produces a batch of
  // new fields, never edits an existing one.
  const [groupForm, setGroupForm] = useState<{
    audienceKey: string
    prefix: string
    phone: boolean
    email: boolean
    hours: boolean
    notes: boolean
  } | null>(null)

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  // One "Name" field holds the plural (card title); the singular used in
  // "Add a …" phrasing is derived by dropping a trailing "s". id follows
  // along too, but only for a brand-new category the admin hasn't already
  // hand-edited the slug on — matches the "food" → "/food" example that
  // motivated this (see CategoryEditor's id field doc) without fighting a
  // slug someone already customized.
  function setName(name: string) {
    setDraft((d) => ({
      ...d,
      pluralLabel: name,
      label: singularize(name),
      id: isNew && !idTouched ? slugify(name) : d.id,
    }))
  }

  // Direct edits to the id field itself — always allowed (on a new category
  // this also stops setName from overwriting it further; on an existing one
  // it's the actual rename, cascaded on save — see renameCategoryId).
  // Lowercased but NOT run through slugify() live: that collapses/strips
  // hyphens on every keystroke, which eats a trailing "-" the instant it's
  // typed (mid-way through typing "food-trucks", the "-" vanishes before the
  // next letter lands). validateDraft (slugRejectionReason) catches anything
  // left over at save time instead.
  function setId(value: string) {
    setIdTouched(true)
    setDraft((d) => ({ ...d, id: value.toLowerCase() }))
  }

  function setCap(key: keyof CategoryCapabilities, value: boolean) {
    setDraft((d) => ({ ...d, capabilities: { ...d.capabilities, [key]: value } }))
  }

  // A field's key follows its name until it's named (CategoryFieldEditor),
  // and the boxes it's in follow the key. One not named yet is in its box
  // by its place, `#<i>`.
  function updateField(i: number, patch: Partial<CategoryField>) {
    setDraft((d) => {
      const from = d.fields[i]?.key || `#${i}`
      const moved = patch.key !== undefined && (patch.key || `#${i}`) !== from
      return {
        ...d,
        fields: d.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
        ...(moved && { listingParts: listingPartsKey(renameKey(listingPartsFromKey(d.listingParts), from, patch.key || `#${i}`)) }),
      }
    })
  }

  // A field added from one of the admin's boxes goes in it (board 17).
  const inBox = (d: Draft, box: string | null | undefined, key: string) =>
    box ? listingPartsKey(addToBox(listingPartsFromKey(d.listingParts), box, key)) : d.listingParts

  // A ready-made field (board 11's Add): copied as it is on its page, under
  // its own key unless this page already uses it, with its caveat's flag and
  // note, and the field that comes with it when that's on. Returns where it
  // landed.
  function addReadyField(field: CategoryField, companions: CategoryField[] = [], box?: string | null, partner?: CategoryField | null): number {
    const used = [...draft.fields, ...draft.hiddenFields]
    const key = nextFieldKey(used, [], field.key || slugifyFieldKey(field.label))
    used.push({ key } as CategoryField)
    const renamed = new Map<string, string>()
    // A hechsher's questions come with it when they're on, and not when a
    // page turned them off before adding it.
    const asks = !field.caveat ? [] : companions.length ? companions : kosherQuestions(field.caveat.flagField, field.caveat.noteField)
    const extra = asks.map((c) => {
      const k = nextFieldKey(used, [], c.key)
      used.push({ key: k } as CategoryField)
      renamed.set(c.key, k)
      return { ...c, key: k }
    })
    const added: CategoryField = {
      ...field,
      key,
      ...(field.caveat && { caveat: { ...field.caveat, flagField: renamed.get(field.caveat.flagField) ?? field.caveat.flagField, noteField: renamed.get(field.caveat.noteField) ?? field.caveat.noteField } }),
    }
    const hidden = extra.map((c) => (c.showIf && renamed.has(c.showIf.field) ? { ...c, showIf: { ...c.showIf, field: renamed.get(c.showIf.field)! } } : c))
    const withIt = partner ? [placedPartner(partner, added, used)] : []
    setDraft((d) => ({ ...d, fields: [...d.fields, added, ...withIt], hiddenFields: [...d.hiddenFields, ...hidden], listingParts: inBox(d, box, key) }))
    return draft.fields.length
  }

  // The field that comes with `parent`, under a key nothing on the page
  // uses, pointing at the parent by its key here.
  function placedPartner(partner: CategoryField, parent: CategoryField, used: Pick<CategoryField, 'key'>[]): CategoryField {
    const key = nextFieldKey(used as CategoryField[], [], partner.key)
    return { ...partner, key, ...(partner.leadBox && { leadBox: { ...partner.leadBox, text: parent.key } }) }
  }

  // The field that comes with field i (fieldPartners.ts), on or off: off
  // takes it off the page; on puts it right after field i.
  function togglePartner(i: number, on: boolean) {
    setDraft((d) => {
      const field = d.fields[i]
      const rule = field && partnerRule(field)
      if (!rule) return d
      const has = partnerOf(d.fields, field)
      if (!on) return has ? { ...d, fields: d.fields.filter((f) => f !== has) } : d
      if (has) return d
      const placed = placedPartner(rule.make(field), field, [...d.fields, ...d.hiddenFields])
      return { ...d, fields: [...d.fields.slice(0, i + 1), placed, ...d.fields.slice(i + 1)] }
    })
  }

  // Board 12's Make your own: a field of the picked kind, named as typed. One
  // with no name yet takes its key from the name typed on its screen.
  function addOwnField(type: FieldType, label = '', box?: string | null): number {
    const key = label.trim() ? nextFieldKey(draft.fields, draft.hiddenFields, slugifyFieldKey(label)) : ''
    setDraft((d) => ({ ...d, fields: [...d.fields, madeField(type, label, key)], listingParts: inBox(d, box, key || `#${d.fields.length}`) }))
    return draft.fields.length
  }

  function removeField(i: number) {
    setDraft((d) => ({ ...d, fields: d.fields.filter((_, idx) => idx !== i) }))
  }

  // Adds a standard Phone/Email/Hours/Notes set in one action, each tagged
  // with the chosen audienceKey — the quick way to set up a mikvah-style
  // "click the checkbox, see that audience's fields" group without adding
  // four fields one at a time. See the audience-group panel in CategoryEditor.
  function addAudienceGroup() {
    if (!groupForm) return
    const { audienceKey, prefix, phone, email, hours, notes } = groupForm
    const p = prefix.trim()
    if (!audienceKey || !p) return

    const usedKeys = new Set([...draft.fields, ...draft.hiddenFields].map((f) => f.key))
    function nextKey(label: string): string {
      const base = slugifyFieldKey(label)
      let key = base
      for (let n = 2; usedKeys.has(key); n++) key = `${base}${n}`
      usedKeys.add(key)
      return key
    }

    // Full label (e.g. "Women's Phone") for the card, which doesn't group by
    // section; shortLabel (e.g. "Phone") for the intake form's collapsible
    // section, where the heading already says who it's for.
    const newFields: CategoryField[] = []
    if (hours) newFields.push({ key: nextKey(`${p} Hours`), label: `${p} Hours`, shortLabel: 'Hours', type: 'hours', renderAs: 'row', filterable: true, audienceKey })
    if (phone) newFields.push({ key: nextKey(`${p} Phone`), label: `${p} Phone`, shortLabel: 'Phone', type: 'tel', renderAs: 'row', filterable: false, audienceKey })
    if (email) newFields.push({ key: nextKey(`${p} Email`), label: `${p} Email`, shortLabel: 'Email', type: 'text', renderAs: 'row', filterable: false, audienceKey })
    if (notes) newFields.push({ key: nextKey(`${p} Notes`), label: `${p} Notes`, shortLabel: 'Notes', type: 'textarea', renderAs: 'row', filterable: false, audienceKey })
    if (newFields.length === 0) return

    setDraft((d) => ({ ...d, fields: [...d.fields, ...newFields] }))
    setGroupForm(null)
  }

  // "Every listing also has" toggles for Hours/Website (see CategoryEditor's
  // JSX) work like hasAddress/hasPhone from the admin's point of view — check
  // the box and it's just on, no separate detail to configure — but under the
  // hood there's no separate hasHours/hasWebsite flag or reserved column;
  // toggling just adds/removes one plain (non-audience) field of the right
  // type, the same as a manually-added Hours or Website field, so every other
  // part of the app (card rendering, the intake form's Google-autofill lookup
  // by type/label) needs no special-casing. The one thing that DOES need
  // special-casing is the Details list: the one field each checkbox actually
  // owns (managedHoursIndex/managedWebsiteIndex below) is filtered out of it
  // so checking the box doesn't spawn a visible, editable detail row —
  // matching how hasAddress/hasPhone don't either.
  function isPlainHoursField(f: CategoryField): boolean {
    return f.type === 'hours' && !f.audienceKey
  }
  function isWebsiteField(f: CategoryField): boolean {
    return f.type === 'url' && f.label.trim().toLowerCase() === 'website'
  }
  // Same managed-field pattern as Hours/Website, but for a per-LISTING photo
  // (see PHOTO_FIELD_KEY) — the checkbox's own upload happens on the public
  // add/edit form, one photo per listing, shown instead of this category's
  // shared icon (see CategoryIcon's callers) wherever that listing's own
  // avatar/pin renders. `type === 'image'` alone is enough to identify it:
  // unlike Hours/Website, 'image' isn't offered in the manual "+ Add detail"
  // type picker, so only this checkbox ever creates one.
  function isPhotoField(f: CategoryField): boolean {
    return f.type === 'image'
  }
  function nextFieldKey(fields: CategoryField[], hidden: CategoryField[], base: string): string {
    const used = new Set([...fields, ...hidden].map((f) => f.key))
    let key = base
    for (let n = 2; used.has(key); n++) key = `${base}${n}`
    return key
  }

  // Inserted at the very front of the details list (not appended) — the
  // intake form renders details right after the fixed Phone field, in this
  // array's order, so index 0 is what actually lands "right after phone" the
  // way address/phone themselves always sit first.
  function toggleHoursField(on: boolean) {
    setDraft((d) => {
      if (on) {
        if (d.fields.some(isPlainHoursField)) return d
        const key = nextFieldKey(d.fields, d.hiddenFields, 'hours')
        const field: CategoryField = { key, label: 'Hours', type: 'hours' as FieldType, renderAs: 'row', filterable: true, coreSection: true }
        return { ...d, fields: [field, ...d.fields] }
      }
      // Only the first match — if a second plain Hours field somehow exists
      // (e.g. one added by hand alongside this checkbox), unchecking the box
      // shouldn't silently delete both; the surplus one stays put, visible
      // and removable in the Details list below (see the render loop's own
      // first-match-only guard).
      const idx = d.fields.findIndex(isPlainHoursField)
      if (idx === -1) return d
      return { ...d, fields: d.fields.filter((_, i) => i !== idx) }
    })
  }

  // Same front-of-list placement as Hours, but slotted after it (if the
  // category has one) so the two stay in the same order as their checkboxes
  // above: Hours, then Website, both right after Phone.
  function toggleWebsiteField(on: boolean) {
    setDraft((d) => {
      if (on) {
        if (d.fields.some(isWebsiteField)) return d
        const key = nextFieldKey(d.fields, d.hiddenFields, 'website')
        const field: CategoryField = { key, label: 'Website', type: 'url' as FieldType, renderAs: 'row', coreSection: true }
        const hoursIndex = d.fields.findIndex(isPlainHoursField)
        const fields = [...d.fields]
        fields.splice(hoursIndex === -1 ? 0 : hoursIndex + 1, 0, field)
        return { ...d, fields }
      }
      // Only the first match — see toggleHoursField's own comment. A second
      // url field labeled "Website" (added by hand, separately from this
      // checkbox) isn't this checkbox's to delete; it stays visible and
      // removable in the Details list instead of vanishing along with the
      // one the checkbox actually owns.
      const idx = d.fields.findIndex(isWebsiteField)
      if (idx === -1) return d
      return { ...d, fields: d.fields.filter((_, i) => i !== idx) }
    })
  }

  // Same slot as toDraft/applyTemplate seed it into (see photoInsertIndex) —
  // right after Website, so the intake form shows Photo exactly where this
  // editor's own checkboxes do, not wherever it happens to land at the end.
  function togglePhotoField(on: boolean) {
    setDraft((d) => {
      if (on) {
        if (d.fields.some(isPhotoField)) return d
        const field: CategoryField = { key: PHOTO_FIELD_KEY, label: 'Photo', type: 'image' as FieldType, renderAs: 'row' }
        const fields = [...d.fields]
        fields.splice(photoInsertIndex(fields), 0, field)
        return { ...d, fields }
      }
      const idx = d.fields.findIndex(isPhotoField)
      if (idx === -1) return d
      return { ...d, fields: d.fields.filter((_, i) => i !== idx) }
    })
  }

  // Turns a Choice field's "flag exceptions" caveat on/off (see
  // CategoryField.caveat — used today by the restaurant category's Kosher
  // Certification field for "not everything here is kosher"). The pair of
  // fields it needs (a hidden Yes/No flag + a hidden note explaining what's
  // excepted) live in draft.hiddenFields, same as any other hidden field, so
  // they're preserved-but-not-editable exactly like a caveat added by hand
  // via a database edit — this just gives an admin a discoverable, safe way
  // to add or remove that pairing instead of it only being possible outside
  // the app.
  function toggleFieldCaveat(i: number, on: boolean) {
    setDraft((d) => {
      const field = d.fields[i]
      if (!field) return d
      if (!on) {
        if (!field.caveat) return d
        const { flagField, noteField } = field.caveat
        return {
          ...d,
          fields: d.fields.map((f, idx) => (idx === i ? { ...f, caveat: undefined } : f)),
          hiddenFields: d.hiddenFields.filter((f) => f.key !== flagField && f.key !== noteField),
        }
      }
      if (field.caveat) return d
      // A hechsher's are its own two questions, as Food asks them.
      if (fieldRules(field).asksEverythingKosher) {
        const flagField = nextFieldKey(d.fields, d.hiddenFields, KOSHER_CAVEAT.flagField)
        const noteField = nextFieldKey(d.fields, [...d.hiddenFields, { key: flagField } as CategoryField], KOSHER_CAVEAT.noteField)
        return {
          ...d,
          fields: d.fields.map((f, idx) => (idx === i ? { ...f, caveat: { flagField, noteField } } : f)),
          hiddenFields: [...d.hiddenFields, ...kosherQuestions(flagField, noteField)],
        }
      }
      const flagField = nextFieldKey(d.fields, d.hiddenFields, `${field.key}Partial`)
      const noteField = nextFieldKey(d.fields, [...d.hiddenFields, { key: flagField } as CategoryField], `${field.key}Note`)
      const flag: CategoryField = {
        key: flagField,
        label: `Not everything here is ${field.label.toLowerCase()}`,
        type: 'boolean',
        renderAs: 'hidden',
        help: `Check this if the listing has a "${field.label}" value but there are exceptions to call out.`,
      }
      const note: CategoryField = {
        key: noteField,
        label: 'What is the exception?',
        type: 'textarea',
        renderAs: 'hidden',
        showIf: { field: flagField, equals: true },
        placeholder: 'Explain what the exception is so visitors know what to verify.',
      }
      return {
        ...d,
        fields: d.fields.map((f, idx) => (idx === i ? { ...f, caveat: { flagField, noteField } } : f)),
        hiddenFields: [...d.hiddenFields, flag, note],
      }
    })
  }

  // Only the FIRST field matching each shape is "owned" by its checkbox
  // above (hidden from the Details list, and all toggleHoursField/
  // toggleWebsiteField ever touch) — if a second one exists, whether from an
  // old manual add or any other reason, it stays fully visible and editable
  // in the Details list below instead of silently vanishing or being
  // deleted alongside the one the checkbox actually manages.
  const managedHoursIndex = draft.fields.findIndex(isPlainHoursField)
  const managedWebsiteIndex = draft.fields.findIndex(isWebsiteField)
  const managedPhotoIndex = draft.fields.findIndex(isPhotoField)

  return {
    draft,
    setDraft,
    groupForm,
    setGroupForm,
    set,
    setName,
    setId,
    setCap,
    updateField,
    addReadyField,
    addOwnField,
    removeField,
    addAudienceGroup,
    isPlainHoursField,
    isWebsiteField,
    isPhotoField,
    toggleHoursField,
    toggleWebsiteField,
    togglePhotoField,
    toggleFieldCaveat,
    togglePartner,
    managedHoursIndex,
    managedWebsiteIndex,
    managedPhotoIndex,
  }
}
