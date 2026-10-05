import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The run's own decisions: what it files, what it refuses to file again,
// and when it files nothing at all. Reading and comparing the list is
// covered in keystoneWatch.test.ts.

const fixture = fs.readFileSync(path.join(__dirname, '__fixtures__/keystone-establishments.html'), 'utf8')

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    in: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from: mockFrom }) }))
const mockCreate = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockDelete = vi.hoisted(() => vi.fn())
vi.mock('@/lib/submissionStore', () => ({
  submitListingCreate: mockCreate,
  submitListingUpdate: mockUpdate,
  submitListingDelete: mockDelete,
}))
const mockDigest = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email', () => ({ sendWatchDigest: mockDigest }))
const mockGoogle = vi.hoisted(() => vi.fn())
vi.mock('@/lib/googlePlaces', () => ({ findPlaceStatus: mockGoogle }))

const { runKeystoneWatch } = await import('./keystoneRun')
const LIST = 'https://keystone-k.org/establishments/'

// The fixture holds nine entries; the route refuses fewer than 30, so the
// page is repeated with new links to stand in for the full list.
function fullPage(): string {
  const copies = [0, 1, 2, 3].map((n) =>
    n === 0 ? fixture : fixture.replace(/keystone-k\.org\/kosher\/([a-z0-9-]+)\//g, `keystone-k.org/kosher/$1-copy${n}/`),
  )
  return copies.join('\n')
}

const bagel = {
  id: 'bagel-1',
  category: 'restaurant',
  name: 'New York Bagel Bakery',
  address: '7555 Haverford Ave, Philadelphia, PA 19151, USA',
  phone: null,
  anchor_id: 'community',
  distance: null,
  details: { kosherCert: 'Keystone-K', k: 'https://keystone-k.org/kosher/new-york-bagel/' },
}

function setDb(listings: unknown[], earlier: unknown[]) {
  mockFrom.mockImplementation((table: string) =>
    table === 'resource' ? chainable({ data: listings, error: null }) : chainable({ data: earlier, error: null }),
  )
}

const run = (dry = false) => runKeystoneWatch('philly', LIST, { dry })

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  delete process.env.CRON_SECRET
  mockDigest.mockResolvedValue(undefined)
  mockGoogle.mockResolvedValue({ placeId: 'p', name: null, businessStatus: 'OPERATIONAL' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(fullPage(), { status: 200 })))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  mockFrom.mockReset()
  mockCreate.mockReset()
  mockUpdate.mockReset()
  mockDelete.mockReset()
  mockDigest.mockReset()
  mockGoogle.mockReset()
})

describe('runKeystoneWatch', () => {
  it('files an edit for a place on both, with the list quoted in its note, and one digest', async () => {
    setDb([bagel], [])
    const body = await run()
    expect(body.ok).toBe(true)
    if (!body.ok) return
    const [community, id, payload, note, by] = mockUpdate.mock.calls[0]
    expect([community, id]).toEqual(['philly', 'bagel-1'])
    expect(payload.details.t).toEqual(['Dairy', 'Parve'])
    expect(note).toContain('Certification: "Dairy – Cholov Stam, Pareve – Pas Yisroel"')
    expect(by).toEqual({ name: 'Keystone-K list (automated)' })
    expect(mockCreate).toHaveBeenCalled() // the places the guide lacks
    expect(mockDigest).toHaveBeenCalledTimes(1)
    expect(mockDigest.mock.calls[0][2]).toHaveLength(body.ok ? body.filed : -1)
  })

  it('files a removal for a place whose only hechsher was Keystone-K and is off the list', async () => {
    const shtetl = { ...bagel, id: 'shtetl-1', name: 'Shtetl', details: { kosherCert: 'Keystone-K' } }
    setDb([shtetl], [])
    await run()
    expect(mockDelete).toHaveBeenCalledTimes(1)
    const [community, id, note, by] = mockDelete.mock.calls[0]
    expect([community, id, by]).toEqual(['philly', 'shtetl-1', { name: 'Keystone-K list (automated)' }])
    expect(note).toContain('approving removes the listing')
    expect(mockUpdate).not.toHaveBeenCalledWith('philly', 'shtetl-1', expect.anything(), expect.anything(), expect.anything())
  })

  it('does not file again what it filed before, whatever the admin decided', async () => {
    const shtetl = { ...bagel, id: 'shtetl-1', name: 'Shtetl', details: { kosherCert: 'Keystone-K' } }
    setDb([bagel, shtetl], [])
    await run()
    const filed = [
      ...mockUpdate.mock.calls.map(([, id, payload, note]) => ({ operation: 'update', target_id: id, payload, note })),
      ...mockCreate.mock.calls.map(([, payload, note]) => ({ operation: 'create', target_id: null, payload, note })),
      ...mockDelete.mock.calls.map(([, id, note]) => ({ operation: 'delete', target_id: id, payload: {}, note })),
    ]
    expect(mockDelete).toHaveBeenCalledTimes(1)
    mockUpdate.mockReset()
    mockCreate.mockReset()
    mockDigest.mockReset()
    mockDigest.mockResolvedValue(undefined)

    mockDelete.mockReset()
    setDb([bagel, shtetl], filed)
    const body = await run()
    expect(body.ok && body.filed).toBe(0)
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  // Keystone-K's list lags: Shalom Pizzeria was still on it, closed for
  // good on Google. A place the guide lacks is asked about first.
  it('does not suggest a new place Google says is permanently closed, and says Google\u2019s answer on the rest', async () => {
    mockGoogle.mockImplementation(async (name: string) =>
      name === 'Sababa Falafel'
        ? { placeId: 'p1', name: 'Sababa', businessStatus: 'CLOSED_PERMANENTLY' }
        : { placeId: 'p2', name: null, businessStatus: 'OPERATIONAL' },
    )
    setDb([], [])
    const body = await run()
    const names = mockCreate.mock.calls.map(([, payload]) => payload.name)
    expect(names).not.toContain('Sababa Falafel')
    expect(body.ok && body.closedOnGoogle).toContain('Sababa Falafel')
    expect(mockCreate.mock.calls[0][2]).toContain('Google: open.')
  })

  it('files nothing on a dry run', async () => {
    setDb([bagel], [])
    const body = await run(true)
    expect(body.ok && body.wouldFile!.length).toBeGreaterThan(0)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockDigest).not.toHaveBeenCalled()
  })

  it('files nothing when it reads too few places, rather than calling every hechsher lost', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(fixture, { status: 200 })))
    setDb([bagel], [])
    const body = await run()
    expect(body).toMatchObject({ ok: false, error: expect.stringContaining("Read only 9 places") })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
