import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Focused on the one behavior this route needs covered directly: a failed
// Google Places fetch persists a per-listing error (not just an aggregate
// counter) so the admin sync-coverage report (src/lib/syncCoverage.ts) can
// show it, and a successful sync clears any stale failure it left behind.
// Everything else here (field ownership, hours mapping, closure routing) is
// covered where it actually lives — googlePlaces.test.ts and syncCoverage.test.ts.

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    not: vi.fn(self),
    limit: vi.fn(self),
    update: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const mockFetchPlaceSync = vi.hoisted(() => vi.fn())
vi.mock('@/lib/googlePlaces', async () => {
  const actual = await vi.importActual<typeof import('@/lib/googlePlaces')>('@/lib/googlePlaces')
  return { ...actual, fetchPlaceSync: mockFetchPlaceSync }
})

vi.mock('@/lib/submissionStore', () => ({ submitGoogleClosure: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendSubmissionNotification: vi.fn() }))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: vi.fn() }))
vi.mock('@/lib/categoryStore', () => ({ listCategories: vi.fn().mockResolvedValue([]) }))

const { GET } = await import('./route')

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  delete process.env.CRON_SECRET
  vi.stubEnv('NODE_ENV', 'test')
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllEnvs()
  mockFrom.mockReset()
  mockFetchPlaceSync.mockReset()
})

const row = {
  id: 'r1',
  name: 'Kosher Bite',
  phone: '215-555-1234',
  address: '1 Main St',
  details: { placeId: 'abc123' },
  category: 'restaurant',
  community_id: 'philly',
}

async function runGet() {
  return GET(new NextRequest('http://localhost/api/cron/sync-hours'))
}

describe('GET /api/cron/sync-hours', () => {
  it('persists a per-listing error when the Google fetch fails', async () => {
    mockFetchPlaceSync.mockResolvedValue(null)
    const readBuilder = chainable({ data: [row], error: null })
    const writeBuilder = chainable({ data: null, error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? readBuilder : writeBuilder
    })

    const res = await runGet()
    const body = await res.json()

    expect(body).toMatchObject({ ok: true, total: 1, synced: 0, failed: 1 })
    expect(writeBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          placeId: 'abc123',
          lastSyncError: expect.stringContaining('Google Places request failed'),
          lastSyncFailedAt: expect.any(String),
        }),
      }),
    )
    expect(writeBuilder.eq).toHaveBeenCalledWith('id', 'r1')
  })

  it('clears a stale failure once the sync succeeds again', async () => {
    mockFetchPlaceSync.mockResolvedValue({
      name: null,
      hours: null,
      phone: null,
      address: null,
      website: null,
      businessStatus: 'OPERATIONAL',
      description: null,
    })
    const staleRow = {
      ...row,
      details: { placeId: 'abc123', lastSyncError: 'old failure', lastSyncFailedAt: '2026-01-01T00:00:00.000Z' },
    }
    const readBuilder = chainable({ data: [staleRow], error: null })
    const writeBuilder = chainable({ data: null, error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? readBuilder : writeBuilder
    })

    await runGet()

    const updateArg = (writeBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      details: Record<string, unknown>
    }
    expect(updateArg.details.lastSyncError).toBeUndefined()
    expect(updateArg.details.lastSyncFailedAt).toBeUndefined()
  })
})
