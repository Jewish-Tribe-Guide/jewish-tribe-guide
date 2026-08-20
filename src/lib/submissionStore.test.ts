import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CategorySubmissionPayload, ResourceSubmission, SubmissionRow } from '@/types'

// Same chainable-builder mocking pattern as tagStore.test.ts: getAdminClient
// is mocked as a minimal thenable query-builder stand-in, since these tests
// are about the state machine's branching (which operation applies what,
// which errors surface, what's best-effort) rather than real Postgres
// behavior. The happy-path round trip against a real project is covered by
// submissionStore.integration.test.ts.
function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    in: vi.fn(self),
    order: vi.fn(self),
    upsert: vi.fn(self),
    insert: vi.fn(self),
    update: vi.fn(self),
    delete: vi.fn(self),
    single: vi.fn(self),
    maybeSingle: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const mockGetDefaultCommunity = vi.hoisted(() => vi.fn())
vi.mock('./communityStore', () => ({
  getDefaultCommunity: mockGetDefaultCommunity,
}))

const mockListCategories = vi.hoisted(() => vi.fn())
const mockCreateCategory = vi.hoisted(() => vi.fn())
const mockGetCategoryById = vi.hoisted(() => vi.fn())
vi.mock('./categoryStore', () => ({
  listCategories: mockListCategories,
  createCategory: mockCreateCategory,
  getCategoryById: mockGetCategoryById,
}))

const mockUpsertTags = vi.hoisted(() => vi.fn())
vi.mock('./tagStore', () => ({
  upsertTags: mockUpsertTags,
}))

const mockGeocode = vi.hoisted(() => vi.fn())
vi.mock('./geo', () => ({
  geocode: mockGeocode,
}))

const mockFetchPlaceSync = vi.hoisted(() => vi.fn())
vi.mock('./googlePlaces', async () => {
  const actual = await vi.importActual<typeof import('./googlePlaces')>('./googlePlaces')
  return { ...actual, fetchPlaceSync: mockFetchPlaceSync }
})

const {
  approveSubmission,
  getSubmissionFunnelStats,
  listPendingSubmissions,
  listSubmissionsByStatus,
  rejectSubmission,
  submitGoogleClosure,
  submitListingCreate,
  submitListingDelete,
  submitListingUpdate,
} = await import('./submissionStore')

const COMMUNITY = { slug: 'philly', name: 'Philly', id: 'philly' }

function baseSubmission(overrides: Partial<SubmissionRow>): SubmissionRow {
  return {
    id: 'sub-1',
    operation: 'create',
    target_type: 'listing',
    target_id: null,
    payload: {},
    note: null,
    status: 'pending',
    submitted_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    reviewed_at: null,
    ...overrides,
  }
}

function listingPayload(overrides: Partial<ResourceSubmission> = {}): ResourceSubmission {
  return {
    category: 'synagogue',
    name: 'Test Shul',
    anchorId: 'community',
    distance: null,
    address: '123 Main St',
    phone: '215-555-0100',
    details: {},
    geo: { lat: 39.95, lng: -75.16 },
    ...overrides,
  }
}

afterEach(() => {
  mockFrom.mockReset()
  mockGetDefaultCommunity.mockReset()
  mockListCategories.mockReset()
  mockCreateCategory.mockReset()
  mockGetCategoryById.mockReset()
  mockUpsertTags.mockReset()
  mockGeocode.mockReset()
  mockFetchPlaceSync.mockReset()
  mockGetDefaultCommunity.mockResolvedValue(COMMUNITY)
})

// ── listPendingSubmissions: category-label resolution ───────────────────────

describe('listPendingSubmissions', () => {
  it('throws with the Supabase error message when the submission query fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listPendingSubmissions()).rejects.toThrow('Failed to load submissions: boom')
  })

  it('uses the submitted category label for a category-create submission', async () => {
    const sub = baseSubmission({
      target_type: 'category',
      target_id: null,
      payload: { label: 'Brand New Category' } as unknown as Record<string, unknown>,
    })
    mockFrom.mockImplementation((table: string) =>
      table === 'submission' ? chainable({ data: [sub], error: null }) : chainable({ data: [], error: null }),
    )
    mockListCategories.mockResolvedValue([])

    const [result] = await listPendingSubmissions()

    expect(result.categoryLabel).toBe('Brand New Category')
    expect(result.current).toBeNull()
    // No target_id, so the resource table is never queried for "current".
    expect(mockFrom).not.toHaveBeenCalledWith('resource')
  })

  it("resolves a listing submission's category label from the known categories, by the submitted payload's slug", async () => {
    const sub = baseSubmission({
      target_type: 'listing',
      operation: 'create',
      target_id: null,
      payload: { category: 'synagogue' },
    })
    mockFrom.mockReturnValue(chainable({ data: [sub], error: null }))
    mockListCategories.mockResolvedValue([{ id: 'synagogue', label: 'Synagogues' }])

    const [result] = await listPendingSubmissions()

    expect(result.categoryLabel).toBe('Synagogues')
  })

  it('falls back to the raw category slug when it matches no known category', async () => {
    const sub = baseSubmission({
      target_type: 'listing',
      operation: 'create',
      target_id: null,
      payload: { category: 'deleted-category-slug' },
    })
    mockFrom.mockReturnValue(chainable({ data: [sub], error: null }))
    mockListCategories.mockResolvedValue([])

    const [result] = await listPendingSubmissions()

    expect(result.categoryLabel).toBe('deleted-category-slug')
  })

  it("for an update/delete submission with no category in its own payload, falls back to the current row's category", async () => {
    const sub = baseSubmission({
      target_type: 'listing',
      operation: 'delete',
      target_id: 'res-1',
      payload: {},
    })
    const currentResource = { id: 'res-1', category: 'grocery' }
    mockFrom.mockImplementation((table: string) =>
      table === 'submission'
        ? chainable({ data: [sub], error: null })
        : chainable({ data: [currentResource], error: null }),
    )
    mockListCategories.mockResolvedValue([{ id: 'grocery', label: 'Grocery Stores' }])

    const [result] = await listPendingSubmissions()

    expect(result.categoryLabel).toBe('Grocery Stores')
    expect(result.current).toEqual(currentResource)
  })

  it('leaves categoryLabel undefined when neither the payload nor the current row has a category', async () => {
    const sub = baseSubmission({
      target_type: 'listing',
      operation: 'delete',
      target_id: 'res-1',
      payload: {},
    })
    mockFrom.mockImplementation((table: string) =>
      table === 'submission'
        ? chainable({ data: [sub], error: null })
        : chainable({ data: [{ id: 'res-1' }], error: null }),
    )
    mockListCategories.mockResolvedValue([])

    const [result] = await listPendingSubmissions()

    expect(result.categoryLabel).toBeUndefined()
  })

  it('deduplicates target_ids before querying current rows, and skips the resource query entirely when none exist', async () => {
    const subs = [
      baseSubmission({ id: 'a', target_id: null, payload: {} }),
      baseSubmission({ id: 'b', target_id: null, payload: {} }),
    ]
    mockFrom.mockImplementation((table: string) => {
      if (table === 'resource') throw new Error('should not query resource with no target_ids')
      return chainable({ data: subs, error: null })
    })
    mockListCategories.mockResolvedValue([])

    const results = await listPendingSubmissions()

    expect(results).toHaveLength(2)
    expect(results.every((r) => r.current === null)).toBe(true)
  })

  it('throws with the Supabase error message when the current-rows query fails', async () => {
    const sub = baseSubmission({ target_id: 'res-1', payload: {} })
    mockFrom.mockImplementation((table: string) =>
      table === 'submission'
        ? chainable({ data: [sub], error: null })
        : chainable({ data: null, error: { message: 'timeout' } }),
    )
    mockListCategories.mockResolvedValue([])

    await expect(listPendingSubmissions()).rejects.toThrow('Failed to load current rows: timeout')
  })
})

// ── listSubmissionsByStatus: the admin history view (approved/rejected) ────

describe('listSubmissionsByStatus', () => {
  it('filters by the given status and orders pending by created_at', async () => {
    const builder = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(builder)
    mockListCategories.mockResolvedValue([])

    await listSubmissionsByStatus('pending')

    expect(builder.eq).toHaveBeenCalledWith('status', 'pending')
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('orders approved/rejected by reviewed_at, most recently decided first', async () => {
    const builder = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(builder)
    mockListCategories.mockResolvedValue([])

    await listSubmissionsByStatus('rejected')

    expect(builder.eq).toHaveBeenCalledWith('status', 'rejected')
    expect(builder.order).toHaveBeenCalledWith('reviewed_at', { ascending: false })
  })

  it('enriches results the same way as listPendingSubmissions (category label, current row)', async () => {
    const sub = baseSubmission({ status: 'approved', target_id: 'res-1', payload: { category: 'synagogue' } })
    mockFrom.mockImplementation((table: string) =>
      table === 'submission'
        ? chainable({ data: [sub], error: null })
        : chainable({ data: [{ id: 'res-1', category: 'synagogue' }], error: null }),
    )
    mockListCategories.mockResolvedValue([{ id: 'synagogue', label: 'Synagogues' }])

    const [result] = await listSubmissionsByStatus('approved')

    expect(result.categoryLabel).toBe('Synagogues')
    expect(result.current).toEqual({ id: 'res-1', category: 'synagogue' })
  })
})

// ── approveSubmission: dispatch + error surfacing ───────────────────────────

describe('approveSubmission', () => {
  it('throws when the submission does not exist', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'not found' } }))
    await expect(approveSubmission('missing')).rejects.toThrow('Submission not found: not found')
  })

  it('rejects an unsupported target_type (e.g. tag) rather than silently applying nothing', async () => {
    const sub = baseSubmission({ target_type: 'tag' })
    mockFrom.mockReturnValue(chainable({ data: sub, error: null }))
    await expect(approveSubmission('sub-1')).rejects.toThrow(
      'Unsupported submission target_type: tag',
    )
  })

  it('applies a create listing submission, then marks it approved', async () => {
    const sub = baseSubmission({ operation: 'create', payload: listingPayload() as unknown as Record<string, unknown> })

    const submissionBuilder = chainable({ data: sub, error: null })
    const resourceInsertBuilder = chainable({ error: null })
    const approveBuilder = chainable({ data: { ...sub, status: 'approved' }, error: null })

    let submissionSelectCalls = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'submission') {
        submissionSelectCalls += 1
        return submissionSelectCalls === 1 ? submissionBuilder : approveBuilder
      }
      if (table === 'resource') return resourceInsertBuilder
      throw new Error(`unexpected table ${table}`)
    })
    mockGetCategoryById.mockResolvedValue(null) // skip tag-vocab growth path

    const result = await approveSubmission('sub-1')

    expect(resourceInsertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Shul', status: 'approved' }),
    )
    expect(approveBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
    )
    expect(result.status).toBe('approved')
  })

  it('applies an update listing submission by updating the existing row, keyed by target_id', async () => {
    const sub = baseSubmission({
      operation: 'update',
      target_id: 'res-1',
      payload: listingPayload({ name: 'Renamed Shul' }) as unknown as Record<string, unknown>,
    })
    const submissionBuilder = chainable({ data: sub, error: null })
    const resourceUpdateBuilder = chainable({ error: null })
    const approveBuilder = chainable({ data: { ...sub, status: 'approved' }, error: null })

    let submissionCalls = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'submission') {
        submissionCalls += 1
        return submissionCalls === 1 ? submissionBuilder : approveBuilder
      }
      return resourceUpdateBuilder
    })
    mockGetCategoryById.mockResolvedValue(null)

    await approveSubmission('sub-1')

    expect(resourceUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Renamed Shul' }),
    )
    expect(resourceUpdateBuilder.eq).toHaveBeenCalledWith('id', 'res-1')
  })

  it('throws when an update submission is missing target_id', async () => {
    const sub = baseSubmission({ operation: 'update', target_id: null, payload: listingPayload() as unknown as Record<string, unknown> })
    mockFrom.mockReturnValue(chainable({ data: sub, error: null }))
    await expect(approveSubmission('sub-1')).rejects.toThrow('Update submission missing target_id.')
  })

  it('throws when a delete submission is missing target_id', async () => {
    const sub = baseSubmission({ operation: 'delete', target_id: null })
    mockFrom.mockReturnValue(chainable({ data: sub, error: null }))
    await expect(approveSubmission('sub-1')).rejects.toThrow('Delete submission missing target_id.')
  })

  it('archives (soft-deletes) rather than hard-deleting the resource row', async () => {
    const sub = baseSubmission({ operation: 'delete', target_id: 'res-1' })
    const submissionBuilder = chainable({ data: sub, error: null })
    const resourceUpdateBuilder = chainable({ error: null })
    const approveBuilder = chainable({ data: { ...sub, status: 'approved' }, error: null })

    let submissionCalls = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'submission') {
        submissionCalls += 1
        return submissionCalls === 1 ? submissionBuilder : approveBuilder
      }
      if (table === 'resource') return resourceUpdateBuilder
      throw new Error(`unexpected table ${table}`)
    })

    await approveSubmission('sub-1')

    expect(resourceUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived' }),
    )
    expect(resourceUpdateBuilder.delete).not.toHaveBeenCalled()
    expect(resourceUpdateBuilder.eq).toHaveBeenCalledWith('id', 'res-1')
  })

  it('surfaces the underlying error when applying the listing change fails', async () => {
    const sub = baseSubmission({ operation: 'delete', target_id: 'res-1' })
    const submissionBuilder = chainable({ data: sub, error: null })
    const resourceUpdateBuilder = chainable({ error: { message: 'db down' } })

    mockFrom.mockImplementation((table: string) => (table === 'submission' ? submissionBuilder : resourceUpdateBuilder))

    await expect(approveSubmission('sub-1')).rejects.toThrow('Failed to archive listing: db down')
  })

  it('does not fail approval when tag-vocabulary growth throws (best-effort)', async () => {
    const sub = baseSubmission({
      operation: 'create',
      payload: listingPayload({ details: { kosher: ['OU'] } }) as unknown as Record<string, unknown>,
    })
    const submissionBuilder = chainable({ data: sub, error: null })
    const resourceInsertBuilder = chainable({ error: null })
    const approveBuilder = chainable({ data: { ...sub, status: 'approved' }, error: null })

    let submissionCalls = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'submission') {
        submissionCalls += 1
        return submissionCalls === 1 ? submissionBuilder : approveBuilder
      }
      return resourceInsertBuilder
    })
    mockGetCategoryById.mockRejectedValue(new Error('category lookup exploded'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await approveSubmission('sub-1')

    expect(result.status).toBe('approved')
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('grows the tag vocabulary only for tags-type fields with a tagGroup, using their submitted labels', async () => {
    const sub = baseSubmission({
      operation: 'create',
      payload: listingPayload({
        details: { kosher: ['OU', 'Star-K'], notes: 'plain text field' },
      }) as unknown as Record<string, unknown>,
    })
    const submissionBuilder = chainable({ data: sub, error: null })
    const resourceInsertBuilder = chainable({ error: null })
    const approveBuilder = chainable({ data: { ...sub, status: 'approved' }, error: null })

    let submissionCalls = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'submission') {
        submissionCalls += 1
        return submissionCalls === 1 ? submissionBuilder : approveBuilder
      }
      return resourceInsertBuilder
    })
    mockGetCategoryById.mockResolvedValue({
      detailFields: [
        { key: 'kosher', type: 'tags', tagGroup: 'kosher_product' },
        { key: 'notes', type: 'text' },
      ],
    })

    await approveSubmission('sub-1')

    expect(mockUpsertTags).toHaveBeenCalledTimes(1)
    expect(mockUpsertTags).toHaveBeenCalledWith('philly', ['OU', 'Star-K'], 'kosher_product')
  })

  describe('applyCategory', () => {
    it('rejects a non-create category operation', async () => {
      const sub = baseSubmission({ target_type: 'category', operation: 'update' })
      mockFrom.mockReturnValue(chainable({ data: sub, error: null }))
      await expect(approveSubmission('sub-1')).rejects.toThrow('Unsupported category operation: update')
    })

    it('creates the category, then geocodes and inserts its first listing when no geo was captured client-side', async () => {
      const payload: CategorySubmissionPayload = {
        label: 'New Category',
        firstListing: {
          name: 'First Place',
          anchorId: '',
          distance: null,
          address: '456 Oak Ave',
          phone: '',
        },
      }
      const sub = baseSubmission({ target_type: 'category', payload: payload as unknown as Record<string, unknown> })
      const submissionBuilder = chainable({ data: sub, error: null })
      const resourceInsertBuilder = chainable({ error: null })
      const approveBuilder = chainable({ data: { ...sub, status: 'approved' }, error: null })

      let submissionCalls = 0
      mockFrom.mockImplementation((table: string) => {
        if (table === 'submission') {
          submissionCalls += 1
          return submissionCalls === 1 ? submissionBuilder : approveBuilder
        }
        return resourceInsertBuilder
      })
      mockCreateCategory.mockResolvedValue({ id: 'new-cat' })
      mockGeocode.mockResolvedValue({ lat: 40, lng: -75 })

      await approveSubmission('sub-1')

      expect(mockGeocode).toHaveBeenCalledWith('456 Oak Ave')
      expect(resourceInsertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'new-cat',
          name: 'First Place',
          anchor_id: 'community', // falls back to 'community' when anchorId is falsy
          details: { geo: { lat: 40, lng: -75 } },
        }),
      )
    })

    it('uses client-captured geo for the first listing without calling geocode', async () => {
      const payload: CategorySubmissionPayload = {
        label: 'New Category',
        firstListing: {
          name: 'First Place',
          anchorId: 'hospital-a',
          distance: null,
          address: '456 Oak Ave',
          phone: '',
          geo: { lat: 1, lng: 2 },
        },
      }
      const sub = baseSubmission({ target_type: 'category', payload: payload as unknown as Record<string, unknown> })
      const submissionBuilder = chainable({ data: sub, error: null })
      const resourceInsertBuilder = chainable({ error: null })
      const approveBuilder = chainable({ data: { ...sub, status: 'approved' }, error: null })

      let submissionCalls = 0
      mockFrom.mockImplementation((table: string) => {
        if (table === 'submission') {
          submissionCalls += 1
          return submissionCalls === 1 ? submissionBuilder : approveBuilder
        }
        return resourceInsertBuilder
      })
      mockCreateCategory.mockResolvedValue({ id: 'new-cat' })

      await approveSubmission('sub-1')

      expect(mockGeocode).not.toHaveBeenCalled()
      expect(resourceInsertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ details: { geo: { lat: 1, lng: 2 } }, anchor_id: 'hospital-a' }),
      )
    })
  })
})

// ── approveSubmission: Google-sync field ownership (resolveGoogleFields) ────

function shulCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'synagogue',
    label: 'Synagogue',
    pluralLabel: 'Synagogues',
    icon: '🕍',
    description: '',
    detailFields: [
      { key: 'hours', label: 'Hours', type: 'hours' as const },
      { key: 'website', label: 'Website', type: 'url' as const },
    ],
    kind: 'listing' as const,
    hasAddress: true,
    hasPhone: true,
    ...overrides,
  }
}

function placeSync(overrides: Record<string, unknown> = {}) {
  return {
    name: null,
    hours: null,
    phone: null,
    address: null,
    website: null,
    businessStatus: 'OPERATIONAL' as const,
    description: null,
    ...overrides,
  }
}

// chainable() types its builder as Record<string, unknown>, so a mocked
// method's own .mock.calls needs a cast to read back what it was called
// with — same shape vi.fn() already is, just not declared that way here.
function lastCallArg(fn: unknown): { details: Record<string, unknown> } {
  const calls = (fn as ReturnType<typeof vi.fn>).mock.calls
  return calls[calls.length - 1][0]
}

describe('approveSubmission: Google-sync field ownership', () => {
  function mockCreateFlow(sub: SubmissionRow) {
    const submissionBuilder = chainable({ data: sub, error: null })
    const resourceInsertBuilder = chainable({ error: null })
    const approveBuilder = chainable({ data: { ...sub, status: 'approved' }, error: null })
    let submissionCalls = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'submission') {
        submissionCalls += 1
        return submissionCalls === 1 ? submissionBuilder : approveBuilder
      }
      return resourceInsertBuilder
    })
    return resourceInsertBuilder
  }

  it('owns a field whose submitted value matches its autofill snapshot — no Google call needed', async () => {
    const sub = baseSubmission({
      operation: 'create',
      payload: listingPayload({
        name: 'Test Shul',
        phone: '', // isolates the assertion to the name field alone
        details: { placeId: 'place-1', googleAutofill: { name: 'Test Shul' } },
      }) as unknown as Record<string, unknown>,
    })
    const resourceInsertBuilder = mockCreateFlow(sub)
    mockGetCategoryById.mockResolvedValue(shulCategory())

    await approveSubmission('sub-1')

    const written = lastCallArg(resourceInsertBuilder.insert)
    expect(written.details.googleFields).toContain('name')
    expect(written.details.googleAutofill).toBeUndefined()
    expect(mockFetchPlaceSync).not.toHaveBeenCalled()
  })

  it('does not own a field whose submitted value differs from its autofill snapshot', async () => {
    const sub = baseSubmission({
      operation: 'create',
      payload: listingPayload({
        name: 'Test Shul',
        phone: '', // isolates the assertion to the name field alone
        details: { placeId: 'place-1', googleAutofill: { name: 'A Different Name' } },
      }) as unknown as Record<string, unknown>,
    })
    const resourceInsertBuilder = mockCreateFlow(sub)
    mockGetCategoryById.mockResolvedValue(shulCategory())

    await approveSubmission('sub-1')

    const written = lastCallArg(resourceInsertBuilder.insert)
    expect(written.details.googleFields).not.toContain('name')
    expect(mockFetchPlaceSync).not.toHaveBeenCalled()
  })

  it('falls back to a live Google check for a field that was never autofilled', async () => {
    const sub = baseSubmission({
      operation: 'create',
      payload: listingPayload({
        phone: '215-555-0100',
        details: { placeId: 'place-1' }, // no googleAutofill at all
      }) as unknown as Record<string, unknown>,
    })
    const resourceInsertBuilder = mockCreateFlow(sub)
    mockGetCategoryById.mockResolvedValue(shulCategory())
    mockFetchPlaceSync.mockResolvedValue(placeSync({ phone: '215-555-0100' }))

    await approveSubmission('sub-1')

    expect(mockFetchPlaceSync).toHaveBeenCalledWith('place-1')
    const written = lastCallArg(resourceInsertBuilder.insert)
    expect(written.details.googleFields).toContain('phone')
  })

  it('does not own a field when the live Google check disagrees', async () => {
    const sub = baseSubmission({
      operation: 'create',
      payload: listingPayload({
        phone: '215-555-0100',
        details: { placeId: 'place-1' },
      }) as unknown as Record<string, unknown>,
    })
    const resourceInsertBuilder = mockCreateFlow(sub)
    mockGetCategoryById.mockResolvedValue(shulCategory())
    mockFetchPlaceSync.mockResolvedValue(placeSync({ phone: '215-555-9999' }))

    await approveSubmission('sub-1')

    const written = lastCallArg(resourceInsertBuilder.insert)
    expect(written.details.googleFields).not.toContain('phone')
  })

  it('does not own a field when Google can’t be reached to verify it', async () => {
    const sub = baseSubmission({
      operation: 'create',
      payload: listingPayload({
        phone: '215-555-0100',
        details: { placeId: 'place-1' },
      }) as unknown as Record<string, unknown>,
    })
    const resourceInsertBuilder = mockCreateFlow(sub)
    mockGetCategoryById.mockResolvedValue(shulCategory())
    mockFetchPlaceSync.mockResolvedValue(null) // Google request failed

    await approveSubmission('sub-1')

    const written = lastCallArg(resourceInsertBuilder.insert)
    expect(written.details.googleFields).not.toContain('phone')
  })

  it('always treats an empty field as fillable, with no check of any kind', async () => {
    const sub = baseSubmission({
      operation: 'create',
      payload: listingPayload({
        name: '',
        phone: '',
        details: { placeId: 'place-1' },
      }) as unknown as Record<string, unknown>,
    })
    const resourceInsertBuilder = mockCreateFlow(sub)
    mockGetCategoryById.mockResolvedValue(shulCategory())

    await approveSubmission('sub-1')

    const written = lastCallArg(resourceInsertBuilder.insert)
    expect(written.details.googleFields).toContain('phone')
    expect(mockFetchPlaceSync).not.toHaveBeenCalled()
  })

  it('never resolves googleFields for a sync-ineligible category', async () => {
    const sub = baseSubmission({
      operation: 'create',
      payload: listingPayload({
        category: 'whatsapp',
        details: { placeId: 'place-1', googleAutofill: { phone: '215-555-0100' } },
      }) as unknown as Record<string, unknown>,
    })
    const resourceInsertBuilder = mockCreateFlow(sub)

    await approveSubmission('sub-1')

    const written = lastCallArg(resourceInsertBuilder.insert)
    expect(written.details.googleFields).toBeUndefined()
    expect(mockFetchPlaceSync).not.toHaveBeenCalled()
  })

  it('edit: an unchanged field keeps its prior ownership, with no check at all', async () => {
    const sub = baseSubmission({
      operation: 'update',
      target_id: 'res-1',
      payload: listingPayload({
        phone: '215-555-0100', // same as existing below
        details: { placeId: 'place-1' },
      }) as unknown as Record<string, unknown>,
    })
    const submissionBuilder = chainable({ data: sub, error: null })
    const existingRow = { id: 'res-1', name: 'Test Shul', phone: '215-555-0100', details: { placeId: 'place-1', googleFields: ['phone'] } }
    const readBuilder = chainable({ data: existingRow, error: null })
    const updateBuilder = chainable({ error: null })
    const approveBuilder = chainable({ data: { ...sub, status: 'approved' }, error: null })
    let resourceCalls = 0
    let submissionCalls = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'submission') {
        submissionCalls += 1
        return submissionCalls === 1 ? submissionBuilder : approveBuilder
      }
      // First resource call is the existing-row read, second is the write.
      resourceCalls += 1
      return resourceCalls === 1 ? readBuilder : updateBuilder
    })
    mockGetCategoryById.mockResolvedValue(shulCategory())

    await approveSubmission('sub-1')

    expect(mockFetchPlaceSync).not.toHaveBeenCalled()
    const written = lastCallArg(updateBuilder.update)
    expect(written.details.googleFields).toContain('phone')
  })

  it('edit: a changed field is re-checked even without a fresh autofill snapshot', async () => {
    const sub = baseSubmission({
      operation: 'update',
      target_id: 'res-1',
      payload: listingPayload({
        phone: '215-555-9999', // changed from existing below
        details: { placeId: 'place-1' },
      }) as unknown as Record<string, unknown>,
    })
    const submissionBuilder = chainable({ data: sub, error: null })
    const existingRow = { id: 'res-1', name: 'Test Shul', phone: '215-555-0100', details: { placeId: 'place-1', googleFields: ['phone'] } }
    const readBuilder = chainable({ data: existingRow, error: null })
    const updateBuilder = chainable({ error: null })
    const approveBuilder = chainable({ data: { ...sub, status: 'approved' }, error: null })
    let resourceCalls = 0
    let submissionCalls = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'submission') {
        submissionCalls += 1
        return submissionCalls === 1 ? submissionBuilder : approveBuilder
      }
      resourceCalls += 1
      return resourceCalls === 1 ? readBuilder : updateBuilder
    })
    mockGetCategoryById.mockResolvedValue(shulCategory())
    mockFetchPlaceSync.mockResolvedValue(placeSync({ phone: '215-555-1111' })) // matches neither old nor new

    await approveSubmission('sub-1')

    expect(mockFetchPlaceSync).toHaveBeenCalledWith('place-1')
    const written = lastCallArg(updateBuilder.update)
    expect(written.details.googleFields).not.toContain('phone')
  })
})

// ── rejectSubmission ─────────────────────────────────────────────────────────

describe('rejectSubmission', () => {
  it('marks the submission rejected without touching any live table', async () => {
    const sub = baseSubmission({ status: 'rejected' })
    const builder = chainable({ data: sub, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await rejectSubmission('sub-1')

    expect(mockFrom).toHaveBeenCalledWith('submission')
    expect(mockFrom).not.toHaveBeenCalledWith('resource')
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }))
    expect(result.status).toBe('rejected')
  })

  it('surfaces the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(rejectSubmission('sub-1')).rejects.toThrow('Failed to reject submission: boom')
  })
})

// ── submitGoogleClosure: idempotency guard ──────────────────────────────────

describe('submitGoogleClosure', () => {
  it('returns null (no-op) when a pending delete already exists for this listing', async () => {
    mockFrom.mockReturnValue(chainable({ data: { id: 'existing-sub' }, error: null }))

    const result = await submitGoogleClosure('res-1')

    expect(result).toBeNull()
  })

  it('creates a delete submission attributed to the automated job when none is pending', async () => {
    const existingCheckBuilder = chainable({ data: null, error: null })
    const resourceLookupBuilder = chainable({ data: { name: 'Old Shul', category: 'synagogue' }, error: null })
    const insertBuilder = chainable({
      data: baseSubmission({ operation: 'delete', target_id: 'res-1' }),
      error: null,
    })

    let submissionCalls = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'resource') return resourceLookupBuilder
      submissionCalls += 1
      return submissionCalls === 1 ? existingCheckBuilder : insertBuilder
    })

    const result = await submitGoogleClosure('res-1')

    expect(result).not.toBeNull()
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'delete',
        target_id: 'res-1',
        payload: { name: 'Old Shul', category: 'synagogue' },
        submitted_by: { name: 'Google Places (automated)' },
      }),
    )
  })

  it('still inserts a submission (with empty payload) when the resource lookup fails', async () => {
    const existingCheckBuilder = chainable({ data: null, error: null })
    const resourceLookupBuilder = chainable({ data: null, error: { message: 'not found' } })
    const insertBuilder = chainable({
      data: baseSubmission({ operation: 'delete', target_id: 'res-1' }),
      error: null,
    })

    let submissionCalls = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'resource') return resourceLookupBuilder
      submissionCalls += 1
      return submissionCalls === 1 ? existingCheckBuilder : insertBuilder
    })

    await submitGoogleClosure('res-1')

    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ payload: {} }))
  })
})

// ── submitListingCreate / submitListingUpdate / submitListingDelete: payload shaping

describe('submitListingCreate', () => {
  it('inserts a pending create submission carrying the raw payload', async () => {
    const builder = chainable({ data: baseSubmission({}), error: null })
    mockFrom.mockReturnValue(builder)

    await submitListingCreate(listingPayload({ submittedBy: { name: 'Jane' } }))

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'create',
        target_type: 'listing',
        target_id: null,
        status: 'pending',
        submitted_by: { name: 'Jane' },
      }),
    )
  })
})

describe('submitListingUpdate', () => {
  it('inserts a pending update submission scoped to the target listing, with the reviewer note', async () => {
    const builder = chainable({ data: baseSubmission({ operation: 'update', target_id: 'res-1' }), error: null })
    mockFrom.mockReturnValue(builder)

    await submitListingUpdate('res-1', listingPayload(), 'fixing the phone number', { email: 'a@b.com' })

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'update',
        target_type: 'listing',
        target_id: 'res-1',
        note: 'fixing the phone number',
        submitted_by: { email: 'a@b.com' },
      }),
    )
  })
})

describe('submitListingDelete', () => {
  it('captures the target listing name + category into the payload for the notification email', async () => {
    const resourceBuilder = chainable({ data: { name: 'Some Shul', category: 'synagogue' }, error: null })
    const insertBuilder = chainable({ data: baseSubmission({}), error: null })
    mockFrom.mockImplementation((table: string) => (table === 'resource' ? resourceBuilder : insertBuilder))

    await submitListingDelete('res-1', 'closed', { name: 'Reporter' })

    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'delete',
        target_id: 'res-1',
        payload: { name: 'Some Shul', category: 'synagogue' },
        note: 'closed',
      }),
    )
  })

  it('falls back to an empty payload when the target listing cannot be found', async () => {
    const resourceBuilder = chainable({ data: null, error: { message: 'not found' } })
    const insertBuilder = chainable({ data: baseSubmission({}), error: null })
    mockFrom.mockImplementation((table: string) => (table === 'resource' ? resourceBuilder : insertBuilder))

    await submitListingDelete('res-1', null, null)

    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ payload: {} }))
  })
})

describe('getSubmissionFunnelStats', () => {
  it('counts each status and computes the approval rate against decided submissions only', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          { status: 'pending', created_at: '2026-01-01T00:00:00Z', reviewed_at: null },
          { status: 'pending', created_at: '2026-01-01T00:00:00Z', reviewed_at: null },
          { status: 'approved', created_at: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-01T02:00:00Z' },
          { status: 'approved', created_at: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-01T04:00:00Z' },
          { status: 'rejected', created_at: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-01T01:00:00Z' },
        ],
        error: null,
      }),
    )

    const stats = await getSubmissionFunnelStats()

    expect(stats.pending).toBe(2)
    expect(stats.approved).toBe(2)
    expect(stats.rejected).toBe(1)
    expect(stats.approvalRate).toBeCloseTo(2 / 3)
  })

  it('computes avg/median approval time in hours from approved rows only', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          // 2 hours, 4 hours, 6 hours → avg 4, median 4
          { status: 'approved', created_at: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-01T02:00:00Z' },
          { status: 'approved', created_at: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-01T04:00:00Z' },
          { status: 'approved', created_at: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-01T06:00:00Z' },
          // Rejected rows never count toward "time to approval".
          { status: 'rejected', created_at: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-01T12:00:00Z' },
        ],
        error: null,
      }),
    )

    const stats = await getSubmissionFunnelStats()

    expect(stats.avgHoursToApproval).toBeCloseTo(4)
    expect(stats.medianHoursToApproval).toBeCloseTo(4)
  })

  it('returns null (not 0 or NaN) for rate/timing when there is no data yet', async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null }))

    const stats = await getSubmissionFunnelStats()

    expect(stats).toEqual({
      pending: 0,
      approved: 0,
      rejected: 0,
      approvalRate: null,
      avgHoursToApproval: null,
      medianHoursToApproval: null,
    })
  })

  it('excludes an approved row with a reviewed_at earlier than created_at (bad data) from timing stats', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          // Clock-skew/bad-data row: reviewed before created.
          { status: 'approved', created_at: '2026-01-01T05:00:00Z', reviewed_at: '2026-01-01T00:00:00Z' },
          { status: 'approved', created_at: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-01T02:00:00Z' },
        ],
        error: null,
      }),
    )

    const stats = await getSubmissionFunnelStats()

    // Only the second (valid) row counts — average of just [2], not skewed negative.
    expect(stats.avgHoursToApproval).toBeCloseTo(2)
  })

  it('excludes an approved row missing reviewed_at from timing stats without throwing', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ status: 'approved', created_at: '2026-01-01T00:00:00Z', reviewed_at: null }],
        error: null,
      }),
    )

    const stats = await getSubmissionFunnelStats()

    expect(stats.avgHoursToApproval).toBeNull()
    expect(stats.medianHoursToApproval).toBeNull()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(getSubmissionFunnelStats()).rejects.toThrow('Failed to load submission stats: boom')
  })
})
