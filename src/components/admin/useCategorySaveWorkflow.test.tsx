// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { fetchJson } from '@/lib/fetchJson'
import { toDraft, type Draft } from './categoryEditorLogic'
import { useCategorySaveWorkflow } from './useCategorySaveWorkflow'

// Direct coverage for the save workflow behind CategoryEditor — validation,
// the three confirmation gates (id-rename, option-rename, field-cleanup) and
// the actual create/update request. Extracted specifically to be testable in
// isolation (see the file's own doc comment) but never got that direct
// coverage until now — only exercised indirectly through
// CategoryEditor.test.tsx's full-component renders, the same gap that let a
// real regression slip through its sibling extraction, categoryEditorLogic.ts
// (see that file's own test for the story).

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn() }))

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
  return { ...toDraft(baseCategory()), ...overrides }
}

beforeEach(() => {
  vi.mocked(fetchJson).mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useCategorySaveWorkflow — validation', () => {
  it('blocks the save and never calls fetchJson when the draft is invalid', async () => {
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft: baseDraft({ pluralLabel: '' }), initial: null, isNew: true, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save())
    expect(result.current.errors).toEqual(['Category name is required.'])
    expect(fetchJson).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('clears stale errors from a previous failed attempt once the draft becomes valid', async () => {
    const { result, rerender } = renderHook(
      (props: { draft: Draft }) =>
        useCategorySaveWorkflow({ draft: props.draft, initial: null, isNew: true, token: 't', community: 'philly', onSaved: vi.fn() }),
      { initialProps: { draft: baseDraft({ pluralLabel: '' }) } },
    )
    await act(async () => result.current.save())
    expect(result.current.errors.length).toBeGreaterThan(0)

    rerender({ draft: baseDraft({ pluralLabel: 'Pharmacies' }) })
    await act(async () => result.current.save())
    expect(result.current.errors).toEqual([])
  })
})

describe('useCategorySaveWorkflow — creating a new category', () => {
  it('skips every confirmation gate and POSTs directly', async () => {
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft: baseDraft({ pluralLabel: 'Pharmacies' }), initial: null, isNew: true, token: 'tok', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save())

    expect(fetchJson).toHaveBeenCalledTimes(1)
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories?community=philly',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
      'Save failed.',
    )
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(result.current.saving).toBe(false)
  })

  it('surfaces a save failure as an error and does not call onSaved', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Name already in use.'))
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft: baseDraft({ pluralLabel: 'Pharmacies' }), initial: null, isNew: true, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save())
    expect(result.current.errors).toEqual(['Name already in use.'])
    expect(onSaved).not.toHaveBeenCalled()
    expect(result.current.saving).toBe(false)
  })
})

describe('useCategorySaveWorkflow — editing, id unchanged', () => {
  it('goes straight to PATCH with no id-usage check', async () => {
    const initial = baseCategory()
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft: baseDraft(), initial, isNew: false, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save())

    expect(fetchJson).toHaveBeenCalledTimes(1)
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories/grocery?community=philly',
      expect.objectContaining({ method: 'PATCH' }),
      'Save failed.',
    )
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})

describe('useCategorySaveWorkflow — id-rename gate', () => {
  it('checks id usage instead of saving, when the id changed', async () => {
    const initial = baseCategory({ id: 'grocery' })
    vi.mocked(fetchJson).mockResolvedValueOnce({ count: 4 })
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft: baseDraft({ id: 'groceries-new' }), initial, isNew: false, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save())

    expect(fetchJson).toHaveBeenCalledTimes(1)
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories/grocery/id-usage?community=philly',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer t' }) }),
      'Could not check existing listings.',
    )
    expect(result.current.pendingIdRename).toEqual({ oldId: 'grocery', newId: 'groceries-new', count: 4 })
    expect(onSaved).not.toHaveBeenCalled()
    expect(result.current.saving).toBe(false)
  })

  it('proceeds to save (with newId in the payload) once the rename is already confirmed', async () => {
    const initial = baseCategory({ id: 'grocery' })
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ count: 4 }) // id-usage check
      .mockResolvedValueOnce({ ok: true }) // the actual save
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft: baseDraft({ id: 'groceries-new' }), initial, isNew: false, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save()) // sets pendingIdRename
    await act(async () => result.current.save()) // confirmed — proceeds

    expect(fetchJson).toHaveBeenCalledTimes(2)
    const saveCall = vi.mocked(fetchJson).mock.calls[1]!
    const body = JSON.parse((saveCall[1] as RequestInit).body as string)
    expect(body.newId).toBe('groceries-new')
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(result.current.pendingIdRename).toBeNull()
  })

  it('cancelIdRename clears the gate without saving', async () => {
    const initial = baseCategory({ id: 'grocery' })
    vi.mocked(fetchJson).mockResolvedValueOnce({ count: 1 })
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft: baseDraft({ id: 'new-id' }), initial, isNew: false, token: 't', community: 'philly', onSaved: vi.fn() }),
    )
    await act(async () => result.current.save())
    expect(result.current.pendingIdRename).not.toBeNull()
    act(() => result.current.cancelIdRename())
    expect(result.current.pendingIdRename).toBeNull()
  })
})

describe('useCategorySaveWorkflow — option-rename gate', () => {
  it('checks option usage instead of saving, when a select option looks renamed', async () => {
    const initial = baseCategory({
      detailFields: [field({ key: 'type', label: 'Type', type: 'select', options: [{ value: 'old', label: 'Old' }] })],
    })
    const draft = baseDraft({
      fields: [field({ key: 'type', label: 'Type', type: 'select', options: [{ value: 'new', label: 'New' }] })],
    })
    vi.mocked(fetchJson).mockResolvedValueOnce({ usage: [{ fieldKey: 'type', oldValue: 'old', newValue: 'new', count: 7 }] })
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft, initial, isNew: false, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save())

    expect(fetchJson).toHaveBeenCalledTimes(1)
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories/grocery/option-usage?community=philly',
      expect.objectContaining({ method: 'POST' }),
      'Could not check existing listings.',
    )
    expect(result.current.pendingRename?.renames).toEqual([
      { fieldKey: 'type', fieldLabel: 'Type', oldValue: 'old', newValue: 'new', count: 7 },
    ])
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('skipRename bypasses the gate entirely, treating it as an unrelated add+remove', async () => {
    const initial = baseCategory({
      detailFields: [field({ key: 'type', type: 'select', options: [{ value: 'old', label: 'Old' }] })],
    })
    const draft = baseDraft({
      fields: [field({ key: 'type', type: 'select', options: [{ value: 'new', label: 'New' }] })],
    })
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft, initial, isNew: false, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save({ skipRename: true }))

    // Straight through to the save PATCH — no option-usage check at all.
    expect(fetchJson).toHaveBeenCalledTimes(1)
    expect(fetchJson).toHaveBeenCalledWith('/api/admin/categories/grocery?community=philly', expect.objectContaining({ method: 'PATCH' }), 'Save failed.')
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})

describe('useCategorySaveWorkflow — field-cleanup gate', () => {
  it('checks field usage instead of saving, when a field was removed', async () => {
    const initial = baseCategory({ detailFields: [field({ key: 'removed' })] })
    const draft = baseDraft({ fields: [] })
    vi.mocked(fetchJson).mockResolvedValueOnce({ usage: { address: 0, phone: 0, fields: { removed: 5 } } })
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft, initial, isNew: false, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save())

    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories/grocery/field-usage?community=philly',
      expect.objectContaining({ method: 'POST' }),
      'Could not check existing listings.',
    )
    expect(result.current.pendingCleanup).toMatchObject({ address: 0, phone: 0, fields: { removed: 5 }, removedKeys: ['removed'] })
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('does not block the save when the removed field has zero real usage', async () => {
    const initial = baseCategory({ detailFields: [field({ key: 'removed' })] })
    const draft = baseDraft({ fields: [] })
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ usage: { address: 0, phone: 0, fields: { removed: 0 } } })
      .mockResolvedValueOnce({ ok: true })
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft, initial, isNew: false, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save())

    expect(fetchJson).toHaveBeenCalledTimes(2) // the check, then straight through to the save
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(result.current.pendingCleanup).toBeNull()
  })

  it('sends clearFields in the payload once the cleanup is confirmed', async () => {
    const initial = baseCategory({ detailFields: [field({ key: 'removed' })], hasAddress: true })
    const draft = baseDraft({ fields: [], hasAddress: false })
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ usage: { address: 2, phone: 0, fields: { removed: 5 } } })
      .mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft, initial, isNew: false, token: 't', community: 'philly', onSaved: vi.fn() }),
    )
    await act(async () => result.current.save()) // sets pendingCleanup
    await act(async () => result.current.save()) // confirmed

    const saveCall = vi.mocked(fetchJson).mock.calls[1]!
    const body = JSON.parse((saveCall[1] as RequestInit).body as string)
    expect(body.clearFields).toEqual({ address: true, phone: false, keys: ['removed'] })
  })

  it('cancelCleanup clears the gate without saving', async () => {
    const initial = baseCategory({ detailFields: [field({ key: 'removed' })] })
    const draft = baseDraft({ fields: [] })
    vi.mocked(fetchJson).mockResolvedValueOnce({ usage: { address: 0, phone: 0, fields: { removed: 3 } } })
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft, initial, isNew: false, token: 't', community: 'philly', onSaved: vi.fn() }),
    )
    await act(async () => result.current.save())
    expect(result.current.pendingCleanup).not.toBeNull()
    act(() => result.current.cancelCleanup())
    expect(result.current.pendingCleanup).toBeNull()
  })
})

describe('useCategorySaveWorkflow — errors during a gate check', () => {
  it('surfaces the check failing as an error rather than silently proceeding to save', async () => {
    const initial = baseCategory({ detailFields: [field({ key: 'removed' })] })
    const draft = baseDraft({ fields: [] })
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('network down'))
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft, initial, isNew: false, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save())
    expect(result.current.errors).toEqual(['network down'])
    expect(onSaved).not.toHaveBeenCalled()
    expect(result.current.pendingCleanup).toBeNull()
  })
})

describe('useCategorySaveWorkflow — save payload', () => {
  it('re-merges hidden fields and normalizes visible ones into the final payload', async () => {
    const hidden = field({ key: 'hiddenNote', renderAs: 'hidden' })
    const draft = baseDraft({
      fields: [field({ key: 'tag1', type: 'tags', label: 'Amenities' })],
      hiddenFields: [hidden],
    })
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCategorySaveWorkflow({ draft, initial: null, isNew: true, token: 't', community: 'philly', onSaved }),
    )
    await act(async () => result.current.save())

    const call = vi.mocked(fetchJson).mock.calls[0]!
    const body = JSON.parse((call[1] as RequestInit).body as string)
    // normalizeField turned the tags field into a badge with a derived tagGroup.
    expect(body.fields.find((f: CategoryField) => f.key === 'tag1')).toMatchObject({ renderAs: 'badge', tagGroup: 'amenities' })
    // The hidden field survived the round-trip.
    expect(body.fields.find((f: CategoryField) => f.key === 'hiddenNote')).toBeDefined()
  })
})
