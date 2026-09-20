import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A listing with a place id that had never synced was a state the app could
// sit in for up to a day: it fell through every section of the sync-coverage
// report, the business-status override couldn't reach it, and a shop Google
// had marked closed showed as open the whole time. syncOneListing is the
// primitive that lets approval close that window using the SAME ownership
// rules as the nightly run, rather than a second implementation that drifts.

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    update: vi.fn(self),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from: mockFrom }) }))

const mockFetchPlaceSync = vi.hoisted(() => vi.fn())
vi.mock('@/lib/googlePlaces', async () => {
  const actual = await vi.importActual<typeof import('@/lib/googlePlaces')>('@/lib/googlePlaces')
  return { ...actual, fetchPlaceSync: mockFetchPlaceSync }
})

const mockSubmitClosure = vi.hoisted(() => vi.fn())
vi.mock('@/lib/submissionStore', () => ({ submitGoogleClosure: mockSubmitClosure }))
vi.mock('@/lib/email', () => ({ sendSubmissionNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/categoryStore', () => ({ listCategories: vi.fn().mockResolvedValue([]) }))

const { syncOneListing, loadSyncableListing } = await import('./syncListing')

const GOOGLE = {
  name: null,
  hours: null,
  phone: null,
  address: null,
  website: null,
  businessStatus: 'OPERATIONAL' as const,
  description: null,
}

const row = {
  id: 'r1',
  name: 'New York Bagel Bakery',
  phone: null,
  address: '1 Main St',
  details: { placeId: 'abc123' } as Record<string, unknown>,
  category: 'restaurant',
  community_id: 'philly',
}

beforeEach(() => {
  mockSubmitClosure.mockResolvedValue(null)
})

afterEach(() => {
  mockFrom.mockReset()
  mockFetchPlaceSync.mockReset()
  mockSubmitClosure.mockReset()
})

describe('syncOneListing', () => {
  it('writes a status onto a listing that has never had one', () => {
    mockFetchPlaceSync.mockResolvedValue({ ...GOOGLE, businessStatus: 'CLOSED_TEMPORARILY' })
    const builder = chainable({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    return syncOneListing(row).then((result) => {
      expect(result).toMatchObject({ outcome: 'synced' })
      const update = builder.update as ReturnType<typeof vi.fn>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            businessStatus: 'CLOSED_TEMPORARILY',
            googleSyncedAt: expect.any(String),
            // No prior value, so the transition is recorded from UNKNOWN
            // rather than pretending nothing changed.
            businessStatusBefore: 'UNKNOWN',
          }),
        }),
      )
      expect(result).toMatchObject({
        statusChange: { from: 'UNKNOWN', to: 'CLOSED_TEMPORARILY', name: 'New York Bagel Bakery' },
      })
    })
  })

  it('reports a failure without throwing, and records it on the listing', async () => {
    mockFetchPlaceSync.mockResolvedValue(null)
    const builder = chainable({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    expect(await syncOneListing(row)).toEqual({ outcome: 'failed' })
    const update = builder.update as ReturnType<typeof vi.fn>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ lastSyncError: expect.stringContaining('Google Places') }),
      }),
    )
  })

  it('respects an admin override when routing a permanent closure', async () => {
    mockFetchPlaceSync.mockResolvedValue({ ...GOOGLE, businessStatus: 'CLOSED_PERMANENTLY' })
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))

    const overridden = { ...row, details: { ...row.details, businessStatusOverride: 'OPERATIONAL' } }
    expect(await syncOneListing(overridden)).toMatchObject({ flaggedClosed: false })
    expect(mockSubmitClosure).not.toHaveBeenCalled()
  })

  // `description` (googleDescription) is now tracked the same way as
  // hours/phone/website — see OWNABLE_SYNC_FIELDS' own doc — rather than the
  // one-off `!details.googleDescription` check it used to be. These two
  // cover the same fill-once behavior that special case had, plus the new
  // part: recording ownership so the public page can say where it came from.
  it('fills an empty description from Google and records ownership', async () => {
    mockFetchPlaceSync.mockResolvedValue({ ...GOOGLE, description: 'A great bagel shop.' })
    const builder = chainable({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    await syncOneListing(row)
    const update = builder.update as ReturnType<typeof vi.fn>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          googleDescription: 'A great bagel shop.',
          googleFields: expect.arrayContaining(['description']),
        }),
      }),
    )
  })

  it('never overwrites a hand-written description, even when Google offers a different one', async () => {
    mockFetchPlaceSync.mockResolvedValue({ ...GOOGLE, description: "Google's own summary." })
    const builder = chainable({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const withOwnDescription = {
      ...row,
      details: { ...row.details, googleDescription: 'Written by the community.' },
    }
    await syncOneListing(withOwnDescription)
    const update = builder.update as ReturnType<typeof vi.fn>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ googleDescription: 'Written by the community.' }),
      }),
    )
    const written = (update.mock.calls[0][0] as { details: Record<string, unknown> }).details
    expect(Array.isArray(written.googleFields) ? written.googleFields : []).not.toContain('description')
  })
})

describe('loadSyncableListing', () => {
  it('returns nothing for a listing with no place id — there is nothing to sync against', async () => {
    mockFrom.mockReturnValue(chainable({ data: { ...row, details: {} } }))
    expect(await loadSyncableListing('r1')).toBeNull()
  })

  it('returns the row when there is a place id', async () => {
    mockFrom.mockReturnValue(chainable({ data: row }))
    expect(await loadSyncableListing('r1')).toMatchObject({ id: 'r1' })
  })

  // Approving a removal archives the listing. Syncing it then would ask Google
  // about a place that's just been taken down, and a CLOSED_PERMANENTLY answer
  // would file a fresh removal submission — putting a listing an admin had
  // just archived straight back into the moderation queue.
  it('will not load an archived listing to sync', async () => {
    const builder = chainable({ data: null })
    mockFrom.mockReturnValue(builder)

    expect(await loadSyncableListing('r1')).toBeNull()
    const eq = builder.eq as ReturnType<typeof vi.fn>
    expect(eq).toHaveBeenCalledWith('status', 'approved')
  })
})
