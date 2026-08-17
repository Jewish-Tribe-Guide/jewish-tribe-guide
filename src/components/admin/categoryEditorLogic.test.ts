import { describe, expect, it } from 'vitest'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import {
  detectOptionRenames,
  fieldsWithRenamedShowIf,
  mergeFieldsWithHidden,
  normalizeField,
  parseOptions,
  photoInsertIndex,
  removedFieldKeys,
  serializeOptions,
  singularize,
  toDraft,
  validateDraft,
  type Draft,
} from './categoryEditorLogic'

// Pure logic extracted from CategoryEditor (see CategoryEditor.test.tsx for
// the end-to-end component coverage) — tested directly here now that it's
// isolated from the ~1000 lines of JSX that used to wrap it.

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

function baseDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    ...toDraft(null),
    ...overrides,
  }
}

describe('singularize', () => {
  it('drops a trailing "s" preceded by a non-"s"', () => {
    expect(singularize('Schools')).toBe('School')
    expect(singularize('Groceries')).toBe('Grocerie')
  })

  it('leaves a word ending in "ss" alone', () => {
    expect(singularize('Class')).toBe('Class')
  })

  it('leaves a word with no trailing "s" alone', () => {
    expect(singularize('Mikvah')).toBe('Mikvah')
  })

  it('trims surrounding whitespace', () => {
    expect(singularize('  Schools  ')).toBe('School')
  })
})

describe('photoInsertIndex', () => {
  it('goes right after a Website field when one exists', () => {
    const fields = [field({ key: 'a' }), field({ key: 'website', type: 'url', label: 'Website' })]
    expect(photoInsertIndex(fields)).toBe(2)
  })

  it('goes right after a plain Hours field when there is no Website', () => {
    const fields = [field({ key: 'hours', type: 'hours' })]
    expect(photoInsertIndex(fields)).toBe(1)
  })

  it('ignores an audience-scoped Hours field — only a plain one counts', () => {
    const fields = [field({ key: 'womensHours', type: 'hours', audienceKey: 'women' })]
    expect(photoInsertIndex(fields)).toBe(0)
  })

  it('goes to the front when neither exists', () => {
    expect(photoInsertIndex([field({ key: 'a' })])).toBe(0)
  })
})

describe('toDraft', () => {
  it('returns sensible defaults for a brand-new category, seeded with a Photo field', () => {
    const draft = toDraft(null)
    expect(draft.pluralLabel).toBe('')
    expect(draft.hasAddress).toBe(true)
    expect(draft.hasPhone).toBe(true)
    expect(draft.capabilities).toEqual({ add: true, edit: true, report: true, directorySearch: true, map: true })
    expect(draft.fields).toHaveLength(1)
    expect(draft.fields[0]!.type).toBe('image')
  })

  it('carries over an existing category’s fields, splitting out hidden ones', () => {
    const category = baseCategory({
      detailFields: [
        field({ key: 'kosher', label: 'Kosher', type: 'select', options: [{ value: 'yes', label: 'Yes' }] }),
        field({ key: 'note', label: 'Note', renderAs: 'hidden' }),
      ],
    })
    const draft = toDraft(category)
    // Photo gets seeded in too, since none existed on the category.
    expect(draft.fields.map((f) => f.key).sort()).toEqual(['kosher', 'photo'].sort())
    expect(draft.hiddenFields.map((f) => f.key)).toEqual(['note'])
  })

  it('re-derives Photo’s position instead of trusting a stale saved index', () => {
    const category = baseCategory({
      detailFields: [
        field({ key: 'photo', type: 'image' }),
        field({ key: 'website', type: 'url', label: 'Website' }),
      ],
    })
    const draft = toDraft(category)
    // Photo (originally first) is repositioned to right after Website.
    expect(draft.fields.map((f) => f.key)).toEqual(['website', 'photo'])
  })
})

describe('normalizeField', () => {
  it('forces a Tags field to badge, derives its tagGroup, and turns off filterable', () => {
    const out = normalizeField(field({ type: 'tags', label: 'Kosher Symbols', renderAs: 'row' }))
    expect(out.renderAs).toBe('badge')
    expect(out.tagGroup).toBe('kosher_symbols')
    expect(out.filterable).toBe(false)
  })

  it('preserves an already-set tagGroup instead of overwriting it', () => {
    const out = normalizeField(field({ type: 'tags', label: 'Kosher Symbols', tagGroup: 'legacy_group' }))
    expect(out.tagGroup).toBe('legacy_group')
  })

  it('makes an Hours field always filterable', () => {
    expect(normalizeField(field({ type: 'hours', renderAs: 'row' })).filterable).toBe(true)
  })

  it('makes a badge-shown Choice field filterable, and a row-shown one not', () => {
    expect(normalizeField(field({ type: 'select', renderAs: 'badge' })).filterable).toBe(true)
    expect(normalizeField(field({ type: 'select', renderAs: 'row' })).filterable).toBe(false)
  })

  it('is never filterable for a plain type like text', () => {
    expect(normalizeField(field({ type: 'text', renderAs: 'badge' })).filterable).toBe(false)
  })

  it('clears allowOther once the type is no longer select', () => {
    const out = normalizeField(field({ type: 'text', allowOther: true }))
    expect(out.allowOther).toBeUndefined()
  })
})

describe('mergeFieldsWithHidden', () => {
  it('re-inserts a caveat’s flag/note pair right after the field that owns it', () => {
    const kosher = field({ key: 'kosher', caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' } })
    const other = field({ key: 'other' })
    const flag = field({ key: 'kosherPartial', renderAs: 'hidden' })
    const note = field({ key: 'kosherNote', renderAs: 'hidden' })

    const merged = mergeFieldsWithHidden([kosher, other], [flag, note])
    expect(merged.map((f) => f.key)).toEqual(['kosher', 'kosherPartial', 'kosherNote', 'other'])
  })

  it('appends an unclaimed hidden field at the end', () => {
    const merged = mergeFieldsWithHidden([field({ key: 'a' })], [field({ key: 'orphan', renderAs: 'hidden' })])
    expect(merged.map((f) => f.key)).toEqual(['a', 'orphan'])
  })
})

describe('serializeOptions / parseOptions', () => {
  it('round-trips a plain value with no distinct label', () => {
    const text = serializeOptions([{ value: 'Kosher', label: 'Kosher' }])
    expect(text).toBe('Kosher')
    expect(parseOptions(text)).toEqual([{ value: 'Kosher', label: 'Kosher' }])
  })

  it('round-trips a value with a distinct label using "value | label"', () => {
    const text = serializeOptions([{ value: 'gf', label: 'Gluten-Free' }])
    expect(text).toBe('gf | Gluten-Free')
    expect(parseOptions(text)).toEqual([{ value: 'gf', label: 'Gluten-Free' }])
  })

  it('drops blank lines and trims whitespace when parsing', () => {
    expect(parseOptions('Kosher\n\n  Dairy  \n')).toEqual([
      { value: 'Kosher', label: 'Kosher' },
      { value: 'Dairy', label: 'Dairy' },
    ])
  })
})

describe('validateDraft', () => {
  it('requires a category name', () => {
    expect(validateDraft(baseDraft({ pluralLabel: '' }))).toContain('Category name is required.')
  })

  it('requires every detail to have a name', () => {
    const errs = validateDraft(baseDraft({ pluralLabel: 'Groceries', fields: [field({ key: '', label: '' })] }))
    expect(errs).toContain('Detail 1: needs a name.')
  })

  it('rejects a second visible field reusing an already-claimed key', () => {
    const errs = validateDraft(
      baseDraft({
        pluralLabel: 'Groceries',
        fields: [field({ key: 'dup', label: 'First' }), field({ key: 'dup', label: 'Second' })],
      }),
    )
    expect(errs.some((e) => e.includes('another detail is already named'))).toBe(true)
  })

  it('rejects a visible field whose key collides with a preserved hidden field', () => {
    const errs = validateDraft(
      baseDraft({
        pluralLabel: 'Groceries',
        fields: [field({ key: 'note', label: 'Note' })],
        hiddenFields: [field({ key: 'note', label: 'Hidden Note', renderAs: 'hidden' })],
      }),
    )
    expect(errs.some((e) => e.includes('another detail is already named'))).toBe(true)
  })

  it('rejects a Choice field with no options', () => {
    const errs = validateDraft(baseDraft({ pluralLabel: 'Groceries', fields: [field({ type: 'select', options: [] })] }))
    expect(errs.some((e) => e.includes('a Choice needs at least one option'))).toBe(true)
  })

  it('rejects a fixed-vocabulary Tags field with no options', () => {
    const errs = validateDraft(
      baseDraft({ pluralLabel: 'Groceries', fields: [field({ type: 'tags', fixedVocabulary: true, options: [] })] }),
    )
    expect(errs.some((e) => e.includes('a fixed-list Tags field needs at least one tag'))).toBe(true)
  })

  it('passes for a valid draft', () => {
    expect(validateDraft(baseDraft({ pluralLabel: 'Groceries', fields: [] }))).toEqual([])
  })
})

describe('removedFieldKeys', () => {
  it('is empty for a brand-new category', () => {
    expect(removedFieldKeys(baseDraft(), null)).toEqual([])
  })

  it('lists a visible field present on the saved category but missing from the draft', () => {
    const initial = baseCategory({ detailFields: [field({ key: 'a' }), field({ key: 'b' })] })
    const draft = baseDraft({ fields: [field({ key: 'a' })] })
    expect(removedFieldKeys(draft, initial)).toEqual(['b'])
  })

  it('never counts a hidden field as removed', () => {
    const initial = baseCategory({ detailFields: [field({ key: 'note', renderAs: 'hidden' })] })
    expect(removedFieldKeys(baseDraft({ fields: [] }), initial)).toEqual([])
  })
})

describe('detectOptionRenames', () => {
  const initial = baseCategory({
    detailFields: [field({ key: 'type', label: 'Type', type: 'select', options: [{ value: 'Kosher', label: 'Kosher' }] })],
  })

  it('detects exactly one option swapped for exactly one other as a rename', () => {
    const draft = baseDraft({
      fields: [field({ key: 'type', label: 'Type', type: 'select', options: [{ value: 'Glatt Kosher', label: 'Glatt Kosher' }] })],
    })
    expect(detectOptionRenames(draft, initial)).toEqual([
      { fieldKey: 'type', fieldLabel: 'Type', oldValue: 'Kosher', newValue: 'Glatt Kosher' },
    ])
  })

  it('does not guess when an option is removed with nothing added', () => {
    const draft = baseDraft({ fields: [field({ key: 'type', label: 'Type', type: 'select', options: [] })] })
    expect(detectOptionRenames(draft, initial)).toEqual([])
  })

  it('does not guess when more than one option changed at once', () => {
    const twoOptionInitial = baseCategory({
      detailFields: [
        field({
          key: 'type',
          label: 'Type',
          type: 'select',
          options: [{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }],
        }),
      ],
    })
    const draft = baseDraft({
      fields: [
        field({
          key: 'type',
          label: 'Type',
          type: 'select',
          options: [{ value: 'c', label: 'c' }, { value: 'd', label: 'd' }],
        }),
      ],
    })
    expect(detectOptionRenames(draft, twoOptionInitial)).toEqual([])
  })

  it('returns nothing for a brand-new category', () => {
    const draft = baseDraft({ fields: [field({ key: 'type', type: 'select', options: [{ value: 'x', label: 'x' }] })] })
    expect(detectOptionRenames(draft, null)).toEqual([])
  })
})

describe('fieldsWithRenamedShowIf', () => {
  it('repoints a showIf condition at the renamed option’s new value', () => {
    const fields = [field({ key: 'delivery', showIf: { field: 'type', equals: 'Out of Town' } })]
    const renamed = fieldsWithRenamedShowIf(fields, [{ fieldKey: 'type', oldValue: 'Out of Town', newValue: 'Scheduled' }])
    expect(renamed[0]!.showIf).toEqual({ field: 'type', equals: 'Scheduled' })
  })

  it('leaves a showIf pointed at an unrelated field alone', () => {
    const fields = [field({ key: 'delivery', showIf: { field: 'other', equals: 'X' } })]
    const renamed = fieldsWithRenamedShowIf(fields, [{ fieldKey: 'type', oldValue: 'X', newValue: 'Y' }])
    expect(renamed[0]!.showIf).toEqual({ field: 'other', equals: 'X' })
  })

  it('is a no-op with no renames', () => {
    const fields = [field({ key: 'delivery' })]
    expect(fieldsWithRenamedShowIf(fields, [])).toBe(fields)
  })
})
