import { useState } from 'react'
import {
  PHOTO_FIELD_KEY,
  slugifyFieldKey,
  type CategoryCapabilities,
  type CategoryConfig,
  type CategoryField,
  type FieldType,
} from '@/lib/categories'
import { CATEGORY_TEMPLATES, type CategoryTemplate } from '@/lib/categoryTemplates'
import { photoInsertIndex, singularize, toDraft, type Draft } from './categoryEditorLogic'

// ── The draft state behind CategoryEditor and every mutation of it: naming,
// capabilities, template application, and the field-schema editing (add /
// remove / reorder / toggle / audience groups). Kept separate from the save
// workflow (useCategorySaveWorkflow) and the confirmation gates, which only
// ever read this draft, never own it. ──

export function useCategoryFieldEditing(initial: CategoryConfig | null) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  // The most recently applied template, if any — stays visible/pickable
  // afterward (see CategoryEditor's render) so switching to a different one is
  // just another click. Tracked so a *second* apply can tell "still the first
  // template's name/icon, safe to swap in the new one" apart from "the admin
  // already customized this," which should be left alone.
  const [lastAppliedTemplate, setLastAppliedTemplate] = useState<CategoryTemplate | null>(null)
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
  // "Add a …" phrasing is derived by dropping a trailing "s".
  function setName(name: string) {
    setDraft((d) => ({ ...d, pluralLabel: name, label: singularize(name) }))
  }

  function setCap(key: keyof CategoryCapabilities, value: boolean) {
    setDraft((d) => ({ ...d, capabilities: { ...d.capabilities, [key]: value } }))
  }

  // Pre-fills the draft's fields/capabilities from a starter template — only
  // offered on a brand-new category (see CategoryEditor's render); a category
  // with real listings already has data under specific field keys, so
  // templates don't retrofit onto those. Stays pickable after applying one, so
  // trying a different template is just another click — re-applying always
  // replaces fields/capabilities, but name/icon/description/card image are
  // only swapped in if they still match the *previous* template's own values
  // (i.e. the admin hasn't customized them); anything typed by hand, before or
  // after, is left alone.
  function applyTemplate(templateId: string) {
    const template = CATEGORY_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    setDraft((d) => ({
      ...d,
      pluralLabel: lastAppliedTemplate
        ? (d.pluralLabel === lastAppliedTemplate.pluralLabel ? template.pluralLabel : d.pluralLabel)
        : (d.pluralLabel || template.pluralLabel),
      label: lastAppliedTemplate
        ? (d.label === singularize(lastAppliedTemplate.pluralLabel) ? singularize(template.pluralLabel) : d.label)
        : (d.label || singularize(template.pluralLabel)),
      icon: lastAppliedTemplate
        ? (d.icon === (lastAppliedTemplate.icon ?? '') ? (template.icon ?? '') : d.icon)
        : (d.icon || template.icon || ''),
      description: lastAppliedTemplate
        ? (d.description === (lastAppliedTemplate.categoryDescription ?? '') ? (template.categoryDescription ?? '') : d.description)
        : (d.description || template.categoryDescription || ''),
      cardImageUrl: lastAppliedTemplate
        ? (d.cardImageUrl === (lastAppliedTemplate.cardImageUrl ?? '') ? (template.cardImageUrl ?? '') : d.cardImageUrl)
        : (d.cardImageUrl || template.cardImageUrl || ''),
      cardTextColor: lastAppliedTemplate
        ? (d.cardTextColor === (lastAppliedTemplate.cardTextColor ?? '#ffffff') ? (template.cardTextColor ?? '#ffffff') : d.cardTextColor)
        : (template.cardTextColor || d.cardTextColor),
      hasAddress: template.hasAddress ?? d.hasAddress,
      hasPhone: template.hasPhone ?? d.hasPhone,
      upvotesEnabled: template.upvotesEnabled ?? d.upvotesEnabled,
      capabilities: { ...d.capabilities, ...template.capabilities },
      // A template's own field list replaces the draft's wholesale (same as
      // Hours/Website silently going along for the ride) — re-seed Photo the
      // same way toDraft does, so applying a template doesn't quietly turn
      // this checkbox off.
      fields: (() => {
        const f = template.fields.map((field) => ({ ...field }))
        if (!f.some((field) => field.type === 'image')) {
          f.splice(photoInsertIndex(f), 0, { key: PHOTO_FIELD_KEY, label: 'Photo', type: 'image', renderAs: 'row' })
        }
        return f
      })(),
    }))
    setLastAppliedTemplate(template)
  }

  function updateField(i: number, patch: Partial<CategoryField>) {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    }))
  }

  function addField() {
    setDraft((d) => ({
      ...d,
      fields: [...d.fields, { key: '', label: '', type: 'text' as FieldType, renderAs: 'row' }],
    }))
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

  function moveField(i: number, dir: -1 | 1) {
    setDraft((d) => {
      const j = i + dir
      if (j < 0 || j >= d.fields.length) return d
      const next = [...d.fields]
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...d, fields: next }
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
    lastAppliedTemplate,
    groupForm,
    setGroupForm,
    set,
    setName,
    setCap,
    applyTemplate,
    updateField,
    addField,
    removeField,
    addAudienceGroup,
    isPlainHoursField,
    isWebsiteField,
    isPhotoField,
    toggleHoursField,
    toggleWebsiteField,
    togglePhotoField,
    toggleFieldCaveat,
    moveField,
    managedHoursIndex,
    managedWebsiteIndex,
    managedPhotoIndex,
  }
}
