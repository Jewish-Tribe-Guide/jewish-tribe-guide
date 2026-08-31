import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { ResourceSubmission } from '@/types'

// next/cache mocked (cacheTag/cacheLife need a request context this plain
// Vitest process doesn't have) — same pattern as categoryStore.test.ts.
vi.mock('next/cache', () => ({
  cacheTag: () => {},
  cacheLife: () => {},
}))

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    order: vi.fn(self),
    update: vi.fn(self),
    delete: vi.fn(self),
    maybeSingle: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const mockGetVoteCounts = vi.hoisted(() => vi.fn())
vi.mock('./voteStore', () => ({
  getVoteCounts: mockGetVoteCounts,
}))

const {
  normalizeRow,
  listApprovedResources,
  getResourceById,
  listArchivedResources,
  restoreResource,
  hardDeleteArchivedResource,
  validateSubmission,
  countCategoryFieldUsage,
  clearCategoryFieldData,
  countFieldOptionUsage,
  applyFieldOptionRenames,
} = await import('./resourceStore')

afterEach(() => {
  mockFrom.mockReset()
  mockGetVoteCounts.mockReset()
})

// ── normalizeRow ─────────────────────────────────────────────────────────────

describe('normalizeRow', () => {
  it('flattens details on top of the shared fields, defaulting distance/address/phone', () => {
    const result = normalizeRow({
      id: 'res-1',
      category: 'synagogue',
      name: 'Test Shul',
      anchor_id: 'community',
      distance: null,
      address: null,
      phone: null,
      details: { hours: 'daily', isKosher: true },
      status: 'approved',
      submitted_by: null,
      created_at: '',
      reviewed_at: null,
      community_id: 'philly',
    } as never)

    expect(result).toEqual({
      id: 'res-1',
      category: 'synagogue',
      name: 'Test Shul',
      anchorId: 'community',
      distance: 0,
      address: '',
      phone: undefined,
      hours: 'daily',
      isKosher: true,
    })
  })
})

// ── listApprovedResources ────────────────────────────────────────────────────

describe('listApprovedResources', () => {
  it('scopes by community + approved status, and rides upvote counts onto each row', async () => {
    const builder = chainable({
      data: [
        { id: 'r1', category: 'synagogue', name: 'A', anchor_id: 'c', distance: null, address: '1', phone: null, details: {} },
        { id: 'r2', category: 'synagogue', name: 'B', anchor_id: 'c', distance: null, address: '2', phone: null, details: {} },
      ],
      error: null,
    })
    mockFrom.mockReturnValue(builder)
    mockGetVoteCounts.mockResolvedValue(new Map([['r1', 5]]))

    const result = await listApprovedResources('philly')

    expect(builder.eq).toHaveBeenCalledWith('community_id', 'philly')
    expect(builder.eq).toHaveBeenCalledWith('status', 'approved')
    expect(result.find((r) => r.id === 'r1')?.upvotes).toBe(5)
    expect(result.find((r) => r.id === 'r2')?.upvotes).toBe(0)
  })

  it('further scopes by category when provided', async () => {
    const builder = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(builder)
    mockGetVoteCounts.mockResolvedValue(new Map())

    await listApprovedResources('philly', { category: 'grocery' })

    expect(builder.eq).toHaveBeenCalledWith('category', 'grocery')
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listApprovedResources('philly')).rejects.toThrow('Failed to load resources: boom')
  })
})

describe('getResourceById', () => {
  it('returns null when not found', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await getResourceById('missing')).toBeNull()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(getResourceById('res-1')).rejects.toThrow('Failed to load resource: boom')
  })
})

// ── Archived listings ────────────────────────────────────────────────────────

describe('listArchivedResources', () => {
  it('scopes to the given community and archived status, newest-removed first', async () => {
    const builder = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await listArchivedResources('philly')

    expect(builder.eq).toHaveBeenCalledWith('community_id', 'philly')
    expect(builder.eq).toHaveBeenCalledWith('status', 'archived')
    expect(builder.order).toHaveBeenCalledWith('reviewed_at', { ascending: false })
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listArchivedResources('philly')).rejects.toThrow('Failed to load archived listings: boom')
  })
})

describe('restoreResource', () => {
  it('scopes the restore to the given community and currently-archived rows, setting status back to approved', async () => {
    const builder = chainable({ data: { id: 'res-1', status: 'approved' }, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await restoreResource('res-1', 'philly')

    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }))
    expect(builder.eq).toHaveBeenCalledWith('id', 'res-1')
    expect(builder.eq).toHaveBeenCalledWith('community_id', 'philly')
    expect(builder.eq).toHaveBeenCalledWith('status', 'archived')
    expect(result?.status).toBe('approved')
  })

  it('returns null when the row is not currently archived (or missing)', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await restoreResource('res-1', 'philly')).toBeNull()
  })

  // Regression: restoreResource used to be scoped only by id/status, so a
  // valid admin token for one community could restore an archived listing
  // that actually belongs to a DIFFERENT community, by id alone.
  it('does not restore a listing that belongs to a different community', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    const result = await restoreResource('ues-listing', 'philly')
    expect(result).toBeNull()
  })
})

describe('hardDeleteArchivedResource', () => {
  it('returns true when a row was actually deleted', async () => {
    mockFrom.mockReturnValue(chainable({ data: { id: 'res-1' }, error: null }))
    expect(await hardDeleteArchivedResource('res-1', 'philly')).toBe(true)
  })

  it('returns false when no archived row matched (nothing deleted)', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await hardDeleteArchivedResource('res-1', 'philly')).toBe(false)
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(hardDeleteArchivedResource('res-1', 'philly')).rejects.toThrow(
      'Failed to permanently delete listing: boom',
    )
  })
})

// ── validateSubmission ───────────────────────────────────────────────────────

function submission(overrides: Partial<ResourceSubmission> = {}): ResourceSubmission {
  return {
    category: 'synagogue',
    name: 'Test Shul',
    anchorId: 'community',
    distance: null,
    address: '123 Main St',
    phone: '215-555-0100',
    details: {},
    ...overrides,
  }
}

describe('validateSubmission', () => {
  it('accepts a fully valid submission with no errors', () => {
    expect(validateSubmission(submission(), makeCategory())).toEqual([])
  })

  it('flags a null category', () => {
    expect(validateSubmission(submission(), null)).toContain('Please choose a valid category.')
  })

  it('requires a non-blank name', () => {
    expect(validateSubmission(submission({ name: '   ' }), makeCategory())).toContain('Name is required.')
  })

  it('requires an address only when the category has one', () => {
    expect(validateSubmission(submission({ address: '' }), makeCategory({ hasAddress: true }))).toContain(
      'Address is required.',
    )
    expect(
      validateSubmission(submission({ address: '' }), makeCategory({ hasAddress: false })),
    ).not.toContain('Address is required.')
  })

  it('validates phone format only when the category has a phone field and one was entered', () => {
    expect(validateSubmission(submission({ phone: '123' }), makeCategory({ hasPhone: true }))).toContain(
      'Please enter a valid phone number.',
    )
    // Blank phone is fine (optional).
    expect(validateSubmission(submission({ phone: '' }), makeCategory({ hasPhone: true }))).toEqual([])
    // Bad format ignored entirely when the category has no phone field.
    expect(
      validateSubmission(submission({ phone: '123' }), makeCategory({ hasPhone: false })),
    ).not.toContain('Please enter a valid phone number.')
  })

  it('requires a required detail field only when its showIf condition is met', () => {
    const category = makeCategory({
      detailFields: [
        {
          key: 'kosherAgency',
          label: 'Kosher Agency',
          type: 'text',
          required: true,
          showIf: { field: 'isKosher', equals: true },
        },
      ],
    })
    // showIf not satisfied — required field is skipped entirely.
    expect(validateSubmission(submission({ details: { isKosher: false } }), category)).toEqual([])
    // showIf satisfied, field missing — flagged.
    expect(validateSubmission(submission({ details: { isKosher: true } }), category)).toContain(
      'Kosher Agency is required.',
    )
    // showIf satisfied, field present — passes.
    expect(
      validateSubmission(submission({ details: { isKosher: true, kosherAgency: 'OU' } }), category),
    ).toEqual([])
  })

  it('rejects a non-http(s) URL in a url/image field, e.g. javascript: or data:', () => {
    const category = makeCategory({
      detailFields: [{ key: 'website', label: 'Website', type: 'url' }],
    })
    expect(
      validateSubmission(submission({ details: { website: 'javascript:alert(1)' } }), category),
    ).toContain('Website must be a valid http(s) link.')
    expect(validateSubmission(submission({ details: { website: 'https://example.com' } }), category)).toEqual(
      [],
    )
    // Blank is fine (not required unless flagged separately).
    expect(validateSubmission(submission({ details: { website: '' } }), category)).toEqual([])
  })

  it('flags oversized name/address/phone/details fields', () => {
    expect(validateSubmission(submission({ name: 'x'.repeat(300) }), makeCategory())).toContain(
      'Name is too long.',
    )
    expect(validateSubmission(submission({ address: 'x'.repeat(400) }), makeCategory())).toContain(
      'Address is too long.',
    )
    expect(validateSubmission(submission({ phone: 'x'.repeat(60) }), makeCategory())).toContain(
      'Phone number is too long.',
    )
    expect(
      validateSubmission(submission({ details: { notes: 'x'.repeat(5000) } }), makeCategory()),
    ).toContain('One of the fields is too long.')
  })

  it('accumulates multiple independent errors at once', () => {
    const errs = validateSubmission(submission({ name: '', address: '' }), null)
    expect(errs).toEqual(
      expect.arrayContaining([
        'Please choose a valid category.',
        'Name is required.',
        'Address is required.',
      ]),
    )
  })
})

// ── Field-removal cleanup ────────────────────────────────────────────────────

describe('countCategoryFieldUsage', () => {
  it('counts listings with real data in address/phone/each requested field', async () => {
    const builder = chainable({
      data: [
        { address: '123 Main St', phone: '', details: { kosher: ['OU'] } },
        { address: '', phone: '215-555-0100', details: {} },
        { address: null, phone: null, details: { kosher: [] } }, // empty array doesn't count
      ],
      error: null,
    })
    mockFrom.mockReturnValue(builder)

    const result = await countCategoryFieldUsage('philly', 'synagogue', {
      address: true,
      phone: true,
      fieldKeys: ['kosher'],
    })

    expect(result).toEqual({ address: 1, phone: 1, fields: { kosher: 1 } })
    // Regression: this used to filter on `category` alone — since
    // resource.category has no per-community uniqueness of its own, that
    // counted (and, in clearCategoryFieldData, actually cleared) a
    // same-named category's listings from EVERY community, not just this one.
    expect(builder.eq).toHaveBeenCalledWith('community_id', 'philly')
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(countCategoryFieldUsage('philly', 'synagogue', {})).rejects.toThrow(
      'Failed to check existing listings: boom',
    )
  })
})

describe('clearCategoryFieldData', () => {
  it('clears address plus its derived geo/placeId details together, leaving unrelated details alone', async () => {
    const rows = [
      {
        id: 'r1',
        address: '123 Main St',
        phone: '215-555-0100',
        details: { geo: { lat: 1, lng: 2 }, placeId: 'p1', notes: 'keep me' },
      },
    ]
    const selectBuilder = chainable({ data: rows, error: null })
    const updateBuilder = chainable({ error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? selectBuilder : updateBuilder
    })

    const result = await clearCategoryFieldData('philly', 'synagogue', { address: true })

    expect(result).toEqual({ updated: 1 })
    expect(updateBuilder.update).toHaveBeenCalledWith({
      address: null,
      details: { notes: 'keep me' },
    })
  })

  it('skips a row that has nothing to clear (no wasted write)', async () => {
    const rows = [{ id: 'r1', address: '', phone: '', details: {} }]
    const selectBuilder = chainable({ data: rows, error: null })
    const updateBuilder = chainable({ error: null })
    mockFrom.mockImplementation(() => (mockFrom.mock.calls.length === 1 ? selectBuilder : updateBuilder))

    const result = await clearCategoryFieldData('philly', 'synagogue', { address: true, phone: true })

    expect(result).toEqual({ updated: 0 })
    expect(updateBuilder.update).not.toHaveBeenCalled()
  })

  it('strips both a field key and its "_sometimes" companion key', async () => {
    const rows = [{ id: 'r1', address: '', phone: '', details: { hours: '9-5', hours_sometimes: true } }]
    const selectBuilder = chainable({ data: rows, error: null })
    const updateBuilder = chainable({ error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? selectBuilder : updateBuilder
    })

    await clearCategoryFieldData('philly', 'synagogue', { fieldKeys: ['hours'] })

    expect(updateBuilder.update).toHaveBeenCalledWith({ details: {} })
  })

  it('throws with the Supabase error message when the read fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(clearCategoryFieldData('philly', 'synagogue', { address: true })).rejects.toThrow(
      'Failed to load existing listings: boom',
    )
  })

  it('throws with the Supabase error message when a write fails', async () => {
    const rows = [{ id: 'r1', address: '123 Main St', phone: '', details: {} }]
    const selectBuilder = chainable({ data: rows, error: null })
    const updateBuilder = chainable({ error: { message: 'write failed' } })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? selectBuilder : updateBuilder
    })

    await expect(clearCategoryFieldData('philly', 'synagogue', { address: true })).rejects.toThrow(
      'Failed to clear data for a listing: write failed',
    )
  })
})

describe('countFieldOptionUsage', () => {
  it('counts a single-value match and a multiSelect-array match, ignoring non-matches', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          { details: { kosher: 'OU' } },
          { details: { kosher: ['Star-K', 'OU'] } },
          { details: { kosher: 'Star-K' } },
        ],
        error: null,
      }),
    )

    const result = await countFieldOptionUsage('philly', 'synagogue', [
      { fieldKey: 'kosher', oldValue: 'OU', newValue: 'Orthodox Union' },
    ])

    expect(result).toEqual([{ fieldKey: 'kosher', oldValue: 'OU', newValue: 'Orthodox Union', count: 2 }])
  })

  it('returns zero counts (not an error) when there are no matching rows', async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null }))
    const result = await countFieldOptionUsage('philly', 'synagogue', [
      { fieldKey: 'kosher', oldValue: 'OU', newValue: 'Orthodox Union' },
    ])
    expect(result[0].count).toBe(0)
  })
})

describe('applyFieldOptionRenames', () => {
  it('returns immediately with zero updates when given no renames (skips the query entirely)', async () => {
    const result = await applyFieldOptionRenames('philly', 'synagogue', [])
    expect(result).toEqual({ updated: 0 })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('renames a plain string value in place', async () => {
    const rows = [{ id: 'r1', details: { kosher: 'OU' } }]
    const selectBuilder = chainable({ data: rows, error: null })
    const updateBuilder = chainable({ error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? selectBuilder : updateBuilder
    })

    const result = await applyFieldOptionRenames('philly', 'synagogue', [
      { fieldKey: 'kosher', oldValue: 'OU', newValue: 'Orthodox Union' },
    ])

    expect(result).toEqual({ updated: 1 })
    expect(updateBuilder.update).toHaveBeenCalledWith({ details: { kosher: 'Orthodox Union' } })
  })

  it('renames within a multiSelect array and dedupes if the new value is already present', async () => {
    const rows = [{ id: 'r1', details: { kosher: ['OU', 'Orthodox Union'] } }]
    const selectBuilder = chainable({ data: rows, error: null })
    const updateBuilder = chainable({ error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? selectBuilder : updateBuilder
    })

    await applyFieldOptionRenames('philly', 'synagogue', [
      { fieldKey: 'kosher', oldValue: 'OU', newValue: 'Orthodox Union' },
    ])

    expect(updateBuilder.update).toHaveBeenCalledWith({ details: { kosher: ['Orthodox Union'] } })
  })

  it('skips a row whose value does not match any rename (no wasted write)', async () => {
    const rows = [{ id: 'r1', details: { kosher: 'Star-K' } }]
    const selectBuilder = chainable({ data: rows, error: null })
    const updateBuilder = chainable({ error: null })
    mockFrom.mockImplementation(() => (mockFrom.mock.calls.length === 1 ? selectBuilder : updateBuilder))

    const result = await applyFieldOptionRenames('philly', 'synagogue', [
      { fieldKey: 'kosher', oldValue: 'OU', newValue: 'Orthodox Union' },
    ])

    expect(result).toEqual({ updated: 0 })
    expect(updateBuilder.update).not.toHaveBeenCalled()
  })

  it('throws with the Supabase error message when a write fails', async () => {
    const rows = [{ id: 'r1', details: { kosher: 'OU' } }]
    const selectBuilder = chainable({ data: rows, error: null })
    const updateBuilder = chainable({ error: { message: 'write failed' } })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? selectBuilder : updateBuilder
    })

    await expect(
      applyFieldOptionRenames('philly', 'synagogue', [{ fieldKey: 'kosher', oldValue: 'OU', newValue: 'Orthodox Union' }]),
    ).rejects.toThrow("Failed to migrate a listing's data: write failed")
  })
})
