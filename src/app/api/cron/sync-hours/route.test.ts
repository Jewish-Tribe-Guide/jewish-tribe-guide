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

const mockSubmitClosure = vi.hoisted(() => vi.fn())
vi.mock('@/lib/submissionStore', () => ({ submitGoogleClosure: mockSubmitClosure }))
const mockDigest = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email', () => ({
  sendSubmissionNotification: vi.fn(),
  sendStatusChangeDigest: mockDigest,
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: vi.fn() }))
vi.mock('@/lib/categoryStore', () => ({ listCategories: vi.fn().mockResolvedValue([]) }))

const { GET } = await import('./route')

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  delete process.env.CRON_SECRET
  vi.stubEnv('NODE_ENV', 'test')
  // The route awaits this and attaches a .catch, so the default must be a
  // promise — a bare vi.fn() returns undefined and blows up before the
  // assertion the test is actually about.
  mockDigest.mockResolvedValue(undefined)
  mockSubmitClosure.mockResolvedValue(null)
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllEnvs()
  mockFrom.mockReset()
  mockFetchPlaceSync.mockReset()
  mockDigest.mockReset()
  mockSubmitClosure.mockReset()
})

const OPERATIONAL = {
  name: null,
  hours: null,
  phone: null,
  address: null,
  website: null,
  businessStatus: 'OPERATIONAL' as const,
  description: null,
}

/** Wires the read + write builders the route expects, returning the write one. */
function stubTable(rows: unknown[]) {
  const readBuilder = chainable({ data: rows, error: null })
  const writeBuilder = chainable({ data: null, error: null })
  let call = 0
  mockFrom.mockImplementation(() => {
    call += 1
    return call === 1 ? readBuilder : writeBuilder
  })
  return writeBuilder
}

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

  // businessStatus used to be overwritten with no record of what it replaced,
  // so nothing downstream could tell that a listing had just closed or just
  // reopened — no notification was possible, and a two-day-old closure looked
  // identical to a two-year-old one.
  it('records the transition and digests it when the status changes', async () => {
    mockFetchPlaceSync.mockResolvedValue({ ...OPERATIONAL, businessStatus: 'CLOSED_TEMPORARILY' })
    const writeBuilder = stubTable([{ ...row, details: { placeId: 'abc123', businessStatus: 'OPERATIONAL' } }])

    const body = await (await runGet()).json()

    expect(body).toMatchObject({ ok: true, statusChanged: 1 })
    expect(writeBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          businessStatus: 'CLOSED_TEMPORARILY',
          businessStatusBefore: 'OPERATIONAL',
          businessStatusChangedAt: expect.any(String),
        }),
      }),
    )
    expect(mockDigest).toHaveBeenCalledWith([
      { name: 'Kosher Bite', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_TEMPORARILY' },
    ])
  })

  // Reopenings matter as much as closures — that's the direction nobody would
  // otherwise hear about, since it needs no approval and fixes itself.
  it('digests a reopening too', async () => {
    mockFetchPlaceSync.mockResolvedValue(OPERATIONAL)
    stubTable([{ ...row, details: { placeId: 'abc123', businessStatus: 'CLOSED_TEMPORARILY' } }])

    await runGet()

    expect(mockDigest).toHaveBeenCalledWith([
      expect.objectContaining({ from: 'CLOSED_TEMPORARILY', to: 'OPERATIONAL' }),
    ])
  })

  it('says nothing on a run where no status moved', async () => {
    mockFetchPlaceSync.mockResolvedValue(OPERATIONAL)
    const writeBuilder = stubTable([{ ...row, details: { placeId: 'abc123', businessStatus: 'OPERATIONAL' } }])

    const body = await (await runGet()).json()

    expect(body).toMatchObject({ statusChanged: 0 })
    // Called with an empty list, which sendStatusChangeDigest itself no-ops on
    // — a quiet week must not produce a "0 listings changed" email.
    expect(mockDigest).toHaveBeenCalledWith([])
    // And no stale transition marker is written onto an unchanged listing.
    // chainable() is loosely typed (Record<string, unknown>), so the mock needs
    // naming before its calls can be read.
    const update = writeBuilder.update as ReturnType<typeof vi.fn>
    const written = update.mock.calls.at(-1)?.[0] as { details: Record<string, unknown> }
    expect(written.details).not.toHaveProperty('businessStatusChangedAt')
  })

  // A dead email provider must not turn a successful sync into a failed cron:
  // the listings are already updated by the time the digest is attempted.
  it('still reports success when the digest fails to send', async () => {
    mockFetchPlaceSync.mockResolvedValue({ ...OPERATIONAL, businessStatus: 'CLOSED_TEMPORARILY' })
    stubTable([{ ...row, details: { placeId: 'abc123', businessStatus: 'OPERATIONAL' } }])
    mockDigest.mockRejectedValue(new Error('provider down'))

    const res = await runGet()

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, synced: 1 })
  })

  // An admin who has overruled Google has already looked at this listing and
  // said Google is wrong. Filing a removal — and emailing about it — on every
  // run would be arguing with them daily.
  it('does not file a removal for a permanent closure an admin has overridden', async () => {
    mockFetchPlaceSync.mockResolvedValue({ ...OPERATIONAL, businessStatus: 'CLOSED_PERMANENTLY' })
    stubTable([
      {
        ...row,
        details: {
          placeId: 'abc123',
          businessStatus: 'CLOSED_PERMANENTLY',
          businessStatusOverride: 'OPERATIONAL',
        },
      },
    ])

    const body = await (await runGet()).json()

    expect(mockSubmitClosure).not.toHaveBeenCalled()
    expect(body).toMatchObject({ flaggedClosed: 0 })
  })

  it('still files one when no override is set', async () => {
    mockFetchPlaceSync.mockResolvedValue({ ...OPERATIONAL, businessStatus: 'CLOSED_PERMANENTLY' })
    mockSubmitClosure.mockResolvedValue({ id: 'sub1' })
    stubTable([{ ...row, details: { placeId: 'abc123', businessStatus: 'CLOSED_PERMANENTLY' } }])

    const body = await (await runGet()).json()

    expect(mockSubmitClosure).toHaveBeenCalledWith('r1')
    expect(body).toMatchObject({ flaggedClosed: 1 })
  })
})
