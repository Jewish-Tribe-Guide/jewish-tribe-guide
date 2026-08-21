import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    maybeSingle: vi.fn(self),
    update: vi.fn(self),
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

const mockListCategoriesUncached = vi.hoisted(() => vi.fn())
const mockGetCategoryById = vi.hoisted(() => vi.fn())
vi.mock('./categoryStore', () => ({
  listCategoriesUncached: mockListCategoriesUncached,
  getCategoryById: mockGetCategoryById,
}))

const mockFetchPlaceSync = vi.hoisted(() => vi.fn())
vi.mock('./googlePlaces', async () => {
  const actual = await vi.importActual<typeof import('./googlePlaces')>('./googlePlaces')
  return { ...actual, fetchPlaceSync: mockFetchPlaceSync }
})

const { getSyncCoverage, checkListingAgainstGoogle, resumeSyncField } = await import('./syncCoverage')

const restaurantCategory = {
  id: 'restaurant',
  label: 'Restaurant',
  pluralLabel: 'Restaurants',
  icon: '🍽️',
  description: '',
  detailFields: [{ key: 'website', label: 'Website', type: 'url' as const }],
  kind: 'listing' as const,
  hasAddress: true,
  hasPhone: true,
}

const whatsappCategory = {
  ...restaurantCategory,
  id: 'whatsapp',
  label: 'WhatsApp Group',
  pluralLabel: 'WhatsApp Groups',
  detailFields: [],
  // No hardcoded id list any more — eligibility is purely hasAddress (see
  // isCategorySyncEligible). Real WhatsApp/Networking categories have no
  // address, which is what actually excludes them.
  hasAddress: false,
}

beforeEach(() => {
  mockGetDefaultCommunity.mockResolvedValue({ slug: 'philly' })
})

afterEach(() => {
  mockFrom.mockReset()
  mockGetDefaultCommunity.mockReset()
  mockListCategoriesUncached.mockReset()
  mockGetCategoryById.mockReset()
  mockFetchPlaceSync.mockReset()
})

describe('getSyncCoverage', () => {
  it('buckets a listing with no place id as never synced', async () => {
    mockListCategoriesUncached.mockResolvedValue([restaurantCategory])
    mockFrom.mockReturnValue(
      chainable({
        data: [{ id: 'r1', name: 'Kosher Bite', category: 'restaurant', phone: '215-555-0000', address: '1 Main St', details: {}, community_id: 'philly' }],
        error: null,
      }),
    )

    const coverage = await getSyncCoverage()
    expect(coverage.neverSynced).toEqual([
      {
        id: 'r1',
        name: 'Kosher Bite',
        category: 'restaurant',
        categoryLabel: 'Restaurants',
        fields: [
          { field: 'name', label: 'Name', ourValue: 'Kosher Bite' },
          { field: 'hours', label: 'Hours', ourValue: '—' },
          { field: 'phone', label: 'Phone', ourValue: '215-555-0000' },
          { field: 'website', label: 'Website', ourValue: '—' },
        ],
      },
    ])
    expect(coverage.protectedFields).toEqual([])
    expect(coverage.failing).toEqual([])
  })

  it('excludes address-less categories entirely, regardless of id', async () => {
    mockListCategoriesUncached.mockResolvedValue([whatsappCategory])
    mockFrom.mockReturnValue(
      chainable({
        data: [{ id: 'r1', name: 'Some Group', category: 'whatsapp', phone: null, address: null, details: {}, community_id: 'philly' }],
        error: null,
      }),
    )

    const coverage = await getSyncCoverage()
    expect(coverage.neverSynced).toEqual([])
  })

  it('excludes any address-less category, not just ones on some hardcoded id list — the actual Networking bug', async () => {
    const networkingCategory = { ...restaurantCategory, id: 'young-professional', pluralLabel: 'Networking', hasAddress: false }
    mockListCategoriesUncached.mockResolvedValue([networkingCategory])
    mockFrom.mockReturnValue(
      chainable({
        data: [{ id: 'r1', name: 'Some Meetup', category: 'young-professional', phone: null, address: null, details: {}, community_id: 'philly' }],
        error: null,
      }),
    )

    const coverage = await getSyncCoverage()
    expect(coverage.neverSynced).toEqual([])
  })

  it('reports a hand-edited phone as a protected field, with its current value', async () => {
    mockListCategoriesUncached.mockResolvedValue([restaurantCategory])
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            id: 'r1',
            name: 'Kosher Bite',
            category: 'restaurant',
            phone: '215-555-1234',
            address: '1 Main St',
            // googleFields recorded, phone not in it → hand-edited, protected.
            details: { placeId: 'abc123', googleFields: ['name', 'hours'] },
            community_id: 'philly',
          },
        ],
        error: null,
      }),
    )

    const coverage = await getSyncCoverage()
    expect(coverage.protectedFields).toEqual([
      {
        id: 'r1',
        name: 'Kosher Bite',
        category: 'restaurant',
        categoryLabel: 'Restaurants',
        // Website is also unsynced here — restaurantCategory has a Website
        // field, and it's absent from googleFields, so it's just as much
        // "not owned by Google" as phone, even though its value is blank.
        fields: [
          { field: 'phone', label: 'Phone', ourValue: '215-555-1234' },
          { field: 'website', label: 'Website', ourValue: '—' },
        ],
      },
    ])
  })

  it('does not report address as a protected field even though it is always fill-once', async () => {
    mockListCategoriesUncached.mockResolvedValue([restaurantCategory])
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            id: 'r1',
            name: 'Kosher Bite',
            category: 'restaurant',
            phone: null,
            address: '1 Main St',
            details: { placeId: 'abc123', googleFields: ['name', 'hours', 'phone', 'website'] },
            community_id: 'philly',
          },
        ],
        error: null,
      }),
    )

    const coverage = await getSyncCoverage()
    expect(coverage.protectedFields).toEqual([])
  })

  it('reports a listing with a persisted sync failure', async () => {
    mockListCategoriesUncached.mockResolvedValue([restaurantCategory])
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            id: 'r1',
            name: 'Kosher Bite',
            category: 'restaurant',
            phone: '215-555-1234',
            address: '1 Main St',
            details: {
              placeId: 'abc123',
              googleFields: ['name', 'hours', 'phone', 'website'],
              lastSyncError: 'Google Places request failed (network error or bad place id).',
              lastSyncFailedAt: '2026-08-19T00:00:00.000Z',
            },
            community_id: 'philly',
          },
        ],
        error: null,
      }),
    )

    const coverage = await getSyncCoverage()
    expect(coverage.failing).toEqual([
      {
        id: 'r1',
        name: 'Kosher Bite',
        category: 'restaurant',
        categoryLabel: 'Restaurants',
        lastSyncError: 'Google Places request failed (network error or bad place id).',
        lastSyncFailedAt: '2026-08-19T00:00:00.000Z',
      },
    ])
  })

  it('throws with the Supabase error message on failure', async () => {
    mockListCategoriesUncached.mockResolvedValue([restaurantCategory])
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(getSyncCoverage()).rejects.toThrow('Failed to load resources: boom')
  })
})

describe('checkListingAgainstGoogle', () => {
  const row = {
    id: 'r1',
    name: 'Kosher Bite',
    category: 'restaurant',
    phone: '215-555-1234',
    address: '1 Main St',
    details: { placeId: 'abc123', googleFields: ['name', 'hours'] },
    community_id: 'philly',
  }

  it('compares protected fields against a fresh Google fetch', async () => {
    mockFrom.mockReturnValue(chainable({ data: row, error: null }))
    mockGetCategoryById.mockResolvedValue(restaurantCategory)
    mockFetchPlaceSync.mockResolvedValue({
      name: 'Kosher Bite',
      hours: null,
      phone: '215-555-9999',
      address: '1 Main St',
      website: null,
      businessStatus: 'OPERATIONAL',
      description: null,
    })

    const fields = await checkListingAgainstGoogle('r1')
    expect(fields).toEqual([
      { field: 'phone', label: 'Phone', ours: '215-555-1234', google: '215-555-9999', matches: false },
      { field: 'website', label: 'Website', ours: '—', google: '—', matches: true },
    ])
  })

  it('throws when the listing has no place id', async () => {
    mockFrom.mockReturnValue(chainable({ data: { ...row, details: {} }, error: null }))
    await expect(checkListingAgainstGoogle('r1')).rejects.toThrow('This listing has no Google place id.')
  })

  it('throws when Google Places fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: row, error: null }))
    mockGetCategoryById.mockResolvedValue(restaurantCategory)
    mockFetchPlaceSync.mockResolvedValue(null)
    await expect(checkListingAgainstGoogle('r1')).rejects.toThrow('Could not reach Google Places right now')
  })

  it('throws when the listing does not exist', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    await expect(checkListingAgainstGoogle('missing')).rejects.toThrow('Listing not found.')
  })
})

describe('resumeSyncField', () => {
  const matchingHours = { sun: null, mon: { open: '07:00', close: '20:00' }, tue: null, wed: null, thu: null, fri: null, sat: null }
  const row = {
    id: 'r1',
    name: 'Cheezy Vegan',
    category: 'restaurant',
    phone: '215-555-1234',
    address: '1 Main St',
    details: { placeId: 'abc123', googleFields: ['name', 'phone', 'website'], hours: matchingHours },
    community_id: 'philly',
  }

  it('hands the field back to Google when the live value matches, merging into googleFields', async () => {
    const updateBuilder = chainable({ error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? chainable({ data: row, error: null }) : updateBuilder
    })
    mockGetCategoryById.mockResolvedValue(restaurantCategory)
    mockFetchPlaceSync.mockResolvedValue({
      name: 'Cheezy Vegan',
      hours: matchingHours,
      phone: '215-555-1234',
      address: '1 Main St',
      website: null,
      businessStatus: 'OPERATIONAL',
      description: null,
    })

    const result = await resumeSyncField('r1', 'hours')

    expect(result.matches).toBe(true)
    expect(updateBuilder.update).toHaveBeenCalledWith({
      details: { ...row.details, googleFields: ['name', 'hours', 'phone', 'website'] },
    })
  })

  it('leaves googleFields untouched when the live value no longer matches', async () => {
    const updateBuilder = chainable({ error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? chainable({ data: row, error: null }) : updateBuilder
    })
    mockGetCategoryById.mockResolvedValue(restaurantCategory)
    mockFetchPlaceSync.mockResolvedValue({
      name: 'Cheezy Vegan',
      hours: { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null },
      phone: '215-555-1234',
      address: '1 Main St',
      website: null,
      businessStatus: 'OPERATIONAL',
      description: null,
    })

    const result = await resumeSyncField('r1', 'hours')

    expect(result.matches).toBe(false)
    expect(updateBuilder.update).not.toHaveBeenCalled()
  })

  it('refuses to resume a field that already follows Google', async () => {
    mockFrom.mockReturnValue(chainable({ data: row, error: null }))
    mockGetCategoryById.mockResolvedValue(restaurantCategory)
    await expect(resumeSyncField('r1', 'phone')).rejects.toThrow('This field is already following Google.')
  })

  it('throws when the listing has no place id', async () => {
    mockFrom.mockReturnValue(chainable({ data: { ...row, details: {} }, error: null }))
    await expect(resumeSyncField('r1', 'hours')).rejects.toThrow('This listing has no Google place id.')
  })
})
