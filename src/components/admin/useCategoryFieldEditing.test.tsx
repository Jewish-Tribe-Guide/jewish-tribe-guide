// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { CATEGORY_TEMPLATES } from '@/lib/categoryTemplates'
import { useCategoryFieldEditing } from './useCategoryFieldEditing'

// Direct coverage for the draft-mutation logic behind CategoryEditor — split
// out (see the file's own doc comment) specifically so it could be tested in
// isolation from the ~1000 lines of JSX that used to wrap it. This hook's
// sibling extraction, categoryEditorLogic.ts, got that direct coverage and it
// caught a real regression (singularize() silently losing its body) that 14
// passing component-level tests never noticed; this file existed with none
// at all until now, exercised only indirectly via CategoryEditor.test.tsx.

function field(overrides: Partial<CategoryField> = {}): CategoryField {
  return { key: 'k', label: 'K', type: 'text', renderAs: 'row', ...overrides }
}

function baseCategory(overrides: Partial<CategoryConfig> = {}): CategoryConfig {
  return {
    id: 'grocery',
    label: 'Grocery',
    pluralLabel: 'Groceries',
    icon: '🛒',
    description: '',
    detailFields: [],
    kind: 'listing',
    ...overrides,
  }
}

describe('useCategoryFieldEditing — new-category naming', () => {
  it('derives the singular label and slugified id from the plural name, for a brand-new category', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(null))
    act(() => result.current.setName('Food Trucks'))
    expect(result.current.draft.pluralLabel).toBe('Food Trucks')
    expect(result.current.draft.label).toBe('Food Truck')
    expect(result.current.draft.id).toBe('food-trucks')
  })

  it('stops auto-following the id once the admin has directly edited it', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(null))
    act(() => result.current.setName('Food Trucks'))
    act(() => result.current.setId('custom-slug'))
    act(() => result.current.setName('Renamed Again'))
    expect(result.current.draft.id).toBe('custom-slug')
    // The plural/singular labels still follow the name — only id stopped.
    expect(result.current.draft.pluralLabel).toBe('Renamed Again')
  })

  it('never auto-follows the id for an existing category, touched or not', () => {
    const existing = baseCategory({ id: 'grocery' })
    const { result } = renderHook(() => useCategoryFieldEditing(existing))
    act(() => result.current.setName('Groceries & More'))
    expect(result.current.draft.id).toBe('grocery')
  })

  it('lowercases direct id edits but does not live-slugify them (a trailing "-" survives mid-type)', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(null))
    act(() => result.current.setId('Food-'))
    expect(result.current.draft.id).toBe('food-')
  })
})

describe('useCategoryFieldEditing — applyTemplate', () => {
  const template = CATEGORY_TEMPLATES[0]

  it('fills in blank fields but leaves anything already typed by hand alone, on first apply', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(null))
    act(() => result.current.setName('My Custom Name'))
    act(() => result.current.applyTemplate(template.id))
    // Already typed by hand before applying — left alone.
    expect(result.current.draft.pluralLabel).toBe('My Custom Name')
    // Blank before applying — filled from the template.
    expect(result.current.draft.icon).toBe(template.icon ?? '')
    expect(result.current.draft.fields.length).toBeGreaterThan(0)
  })

  it('swaps in a second template\'s values only where the draft still matches the first template\'s own values', () => {
    const other = CATEGORY_TEMPLATES.find((t) => t.id !== template.id)!
    const { result } = renderHook(() => useCategoryFieldEditing(null))
    act(() => result.current.applyTemplate(template.id))
    // Admin customizes the icon after the first apply — this must survive a second apply.
    act(() => result.current.set('icon', '🎯'))
    act(() => result.current.applyTemplate(other.id))
    expect(result.current.draft.icon).toBe('🎯')
    // Untouched fields (still exactly what the first template set) do swap to the new template's values.
    expect(result.current.draft.pluralLabel).toBe(other.pluralLabel)
  })

  it('auto-adds a Photo field when the template does not define an image field itself', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(null))
    act(() => result.current.applyTemplate(template.id))
    expect(result.current.draft.fields.some((f) => f.type === 'image')).toBe(true)
  })

  it('does nothing for an unknown template id', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(null))
    const before = result.current.draft
    act(() => result.current.applyTemplate('not-a-real-template'))
    expect(result.current.draft).toBe(before)
  })
})

// toDraft (see categoryEditorLogic.ts) auto-seeds a Photo field into `fields`
// at whatever slot photoInsertIndex picks — index 0 for a category with no
// Hours/Website field, ahead of every hand-authored field below. These tests
// look the target field up by key rather than assuming a raw index, so they
// don't silently start asserting on the Photo field instead.
describe('useCategoryFieldEditing — field list CRUD', () => {
  it('adds a blank text field', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(null))
    const before = result.current.draft.fields.length
    act(() => result.current.addField())
    expect(result.current.draft.fields.length).toBe(before + 1)
    expect(result.current.draft.fields.at(-1)).toMatchObject({ key: '', label: '', type: 'text' })
  })

  it('updates one field by index without touching the others', () => {
    const initial = baseCategory({ detailFields: [field({ key: 'a', label: 'A' }), field({ key: 'b', label: 'B' })] })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    const idxA = result.current.draft.fields.findIndex((f) => f.key === 'a')
    act(() => result.current.updateField(idxA, { label: 'Renamed A' }))
    expect(result.current.draft.fields.find((f) => f.key === 'a')?.label).toBe('Renamed A')
    expect(result.current.draft.fields.find((f) => f.key === 'b')?.label).toBe('B')
  })

  it('removes a field by index', () => {
    const initial = baseCategory({ detailFields: [field({ key: 'a' }), field({ key: 'b' })] })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    const idxA = result.current.draft.fields.findIndex((f) => f.key === 'a')
    act(() => result.current.removeField(idxA))
    expect(result.current.draft.fields.map((f) => f.key)).not.toContain('a')
    expect(result.current.draft.fields.map((f) => f.key)).toContain('b')
  })

  it('swaps two adjacent fields on moveField, and is a no-op past either end', () => {
    // An explicit image field up front keeps toDraft from re-seeding its own
    // Photo elsewhere in the list, so a/b/c's positions are exactly as given.
    const initial = baseCategory({
      detailFields: [field({ key: 'photo', type: 'image' }), field({ key: 'a' }), field({ key: 'b' }), field({ key: 'c' })],
    })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    const idxA = result.current.draft.fields.findIndex((f) => f.key === 'a')
    act(() => result.current.moveField(idxA, 1))
    expect(result.current.draft.fields.map((f) => f.key)).toEqual(['photo', 'b', 'a', 'c'])
    act(() => result.current.moveField(0, -1)) // already at the front
    expect(result.current.draft.fields.map((f) => f.key)).toEqual(['photo', 'b', 'a', 'c'])
  })
})

describe('useCategoryFieldEditing — managed Hours/Website/Photo checkboxes', () => {
  it('inserts Hours at the very front of the field list when checked on', () => {
    const initial = baseCategory({ detailFields: [field({ key: 'existing' })] })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    act(() => result.current.toggleHoursField(true))
    expect(result.current.draft.fields[0].type).toBe('hours')
    expect(result.current.managedHoursIndex).toBe(0)
  })

  it('inserts Website right after Hours, not at the very front, when both are on', () => {
    const initial = baseCategory({ detailFields: [] })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    act(() => result.current.toggleHoursField(true))
    act(() => result.current.toggleWebsiteField(true))
    expect(result.current.draft.fields[0].type).toBe('hours')
    expect(result.current.draft.fields[1].type).toBe('url')
  })

  it('inserting Website with no Hours field lands it at the front instead', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(baseCategory()))
    act(() => result.current.toggleWebsiteField(true))
    expect(result.current.draft.fields[0].type).toBe('url')
  })

  it('unchecking removes only the checkbox-owned field, leaving a hand-added duplicate visible', () => {
    // Two plain Hours fields: the checkbox's own (added first) plus one the
    // admin added by hand separately. Unchecking must remove only the first.
    const initial = baseCategory({
      detailFields: [field({ key: 'hours', type: 'hours' }), field({ key: 'hours2', type: 'hours', label: 'Hours 2' })],
    })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    act(() => result.current.toggleHoursField(false))
    const keys = result.current.draft.fields.map((f) => f.key)
    expect(keys).not.toContain('hours')
    expect(keys).toContain('hours2')
  })

  it('checking a box that already has a matching field is a no-op, not a duplicate', () => {
    const initial = baseCategory({ detailFields: [field({ key: 'hours', type: 'hours' })] })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    act(() => result.current.toggleHoursField(true))
    expect(result.current.draft.fields.filter((f) => f.type === 'hours')).toHaveLength(1)
  })

  it('unchecking with no matching field present is a no-op', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(baseCategory()))
    const before = result.current.draft
    act(() => result.current.toggleHoursField(false))
    expect(result.current.draft).toBe(before)
  })

  it('toggles the Photo field on/off at the template-defined slot', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(baseCategory()))
    act(() => result.current.togglePhotoField(true))
    expect(result.current.draft.fields.some((f) => f.type === 'image')).toBe(true)
    act(() => result.current.togglePhotoField(false))
    expect(result.current.draft.fields.some((f) => f.type === 'image')).toBe(false)
  })

  it('identifies an audience-scoped Hours field as NOT the plain managed one', () => {
    const initial = baseCategory({ detailFields: [field({ key: 'wh', type: 'hours', audienceKey: 'women' })] })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    expect(result.current.managedHoursIndex).toBe(-1)
    expect(result.current.isPlainHoursField(initial.detailFields[0])).toBe(false)
  })

  it('only recognizes a url field labeled exactly "Website" (case/whitespace-insensitive) as the managed one', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(baseCategory()))
    expect(result.current.isWebsiteField(field({ type: 'url', label: '  WEBSITE  ' }))).toBe(true)
    expect(result.current.isWebsiteField(field({ type: 'url', label: 'Menu Link' }))).toBe(false)
  })
})

describe('useCategoryFieldEditing — audience group form', () => {
  it('does nothing when no group form is open', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(baseCategory()))
    const before = result.current.draft
    act(() => result.current.addAudienceGroup())
    expect(result.current.draft).toBe(before)
  })

  it('adds one field per checked service, tagged with the audience key, and closes the form', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(baseCategory()))
    act(() =>
      result.current.setGroupForm({ audienceKey: 'women', prefix: "Women's", phone: true, email: false, hours: true, notes: false }),
    )
    act(() => result.current.addAudienceGroup())
    const added = result.current.draft.fields.filter((f) => f.audienceKey === 'women')
    expect(added).toHaveLength(2)
    expect(added.map((f) => f.type).sort()).toEqual(['hours', 'tel'])
    expect(result.current.groupForm).toBeNull()
  })

  it('does nothing when no audience key or prefix is set', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(baseCategory()))
    act(() => result.current.setGroupForm({ audienceKey: '', prefix: '', phone: true, email: false, hours: false, notes: false }))
    const before = result.current.draft
    act(() => result.current.addAudienceGroup())
    expect(result.current.draft).toBe(before)
  })

  it('does nothing when the prefix is set but no service checkbox is checked', () => {
    const { result } = renderHook(() => useCategoryFieldEditing(baseCategory()))
    act(() =>
      result.current.setGroupForm({ audienceKey: 'women', prefix: "Women's", phone: false, email: false, hours: false, notes: false }),
    )
    const before = result.current.draft
    act(() => result.current.addAudienceGroup())
    expect(result.current.draft).toBe(before)
    // The form stays open — nothing to close since nothing was added.
    expect(result.current.groupForm).not.toBeNull()
  })

  it('numbers a colliding generated key instead of overwriting the existing field', () => {
    // slugifyFieldKey("Women's Phone") -> 'women_s_phone' — pre-seed exactly
    // that key so the real generated one collides.
    const initial = baseCategory({ detailFields: [field({ key: 'women_s_phone', type: 'tel', label: 'Old field' })] })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    act(() =>
      result.current.setGroupForm({ audienceKey: 'women', prefix: "Women's", phone: true, email: false, hours: false, notes: false }),
    )
    act(() => result.current.addAudienceGroup())
    const fields = result.current.draft.fields.filter((f) => f.key.startsWith('women_s_phone'))
    expect(fields).toHaveLength(2)
    // Genuinely two distinct keys, not two fields sharing the same one — a
    // duplicate key would make `find`/`.filter` below both silently return
    // whichever field happens to come first, hiding the collision instead of
    // catching it.
    expect(new Set(fields.map((f) => f.key)).size).toBe(2)
    // The pre-existing field survives untouched, under its original key...
    expect(fields.find((f) => f.key === 'women_s_phone')?.label).toBe('Old field')
    // ...and the new one got a DIFFERENT, numbered key instead of overwriting it.
    const newField = fields.find((f) => f.key !== 'women_s_phone')
    expect(newField?.key).toBe('women_s_phone2')
    expect(newField?.label).toBe("Women's Phone")
  })
})

describe('useCategoryFieldEditing — field caveat toggle', () => {
  it('adds a hidden flag+note pair and links the field to it, on enable', () => {
    const initial = baseCategory({ detailFields: [field({ key: 'kosher', label: 'Kosher Certification' })] })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    act(() => result.current.toggleFieldCaveat(0, true))
    const caveat = result.current.draft.fields[0].caveat
    expect(caveat).toBeDefined()
    expect(result.current.draft.hiddenFields.map((f) => f.key)).toEqual([caveat!.flagField, caveat!.noteField])
  })

  it('removes the pair from hiddenFields and clears the link, on disable', () => {
    const initial = baseCategory({ detailFields: [field({ key: 'kosher', label: 'Kosher Certification' })] })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    act(() => result.current.toggleFieldCaveat(0, true))
    act(() => result.current.toggleFieldCaveat(0, false))
    expect(result.current.draft.fields[0].caveat).toBeUndefined()
    expect(result.current.draft.hiddenFields).toHaveLength(0)
  })

  it('enabling twice does not add a second pair', () => {
    const initial = baseCategory({ detailFields: [field({ key: 'kosher', label: 'Kosher Certification' })] })
    const { result } = renderHook(() => useCategoryFieldEditing(initial))
    act(() => result.current.toggleFieldCaveat(0, true))
    act(() => result.current.toggleFieldCaveat(0, true))
    expect(result.current.draft.hiddenFields).toHaveLength(2)
  })
})
