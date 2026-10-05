import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The route's own decisions: what it files, what it refuses to file again,
// and when it files nothing at all. Reading and comparing the list is
// covered in keystoneWatch.test.ts.

const fixture = fs.readFileSync(path.join(__dirname, '../../../../lib/__fixtures__/keystone-establishments.html'), 'utf8')

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
vi.mock('@/lib/submissionStore', () => ({ submitListingCreate: mockCreate, submitListingUpdate: mockUpdate }))
const mockDigest = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email', () => ({ sendWatchDigest: mockDigest }))

const { GET } = await import('./route')

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

function request(query = '') {
  return new NextRequest(`http://localhost/api/cron/watch-keystone${query}`)
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  delete process.env.CRON_SECRET
  mockDigest.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(fullPage(), { status: 200 })))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  mockFrom.mockReset()
  mockCreate.mockReset()
  mockUpdate.mockReset()
  mockDigest.mockReset()
})

describe('/api/cron/watch-keystone', () => {
  it('files an edit for a place on both, with the list quoted in its note, and one digest', async () => {
    setDb([bagel], [])
    const res = await GET(request())
    const body = await res.json()
    expect(body.ok).toBe(true)
    const [community, id, payload, note, by] = mockUpdate.mock.calls[0]
    expect([community, id]).toEqual(['philly', 'bagel-1'])
    expect(payload.details.t).toEqual(['Dairy', 'Parve'])
    expect(note).toContain('Certification: "Dairy – Cholov Stam, Pareve – Pas Yisroel"')
    expect(by).toEqual({ name: 'Keystone-K list (automated)' })
    expect(mockCreate).toHaveBeenCalled() // the places the guide lacks
    expect(mockDigest).toHaveBeenCalledTimes(1)
    expect(mockDigest.mock.calls[0][2]).toHaveLength(body.filed)
  })

  it('does not file again what it filed before, whatever the admin decided', async () => {
    setDb([bagel], [])
    await GET(request())
    const filed = [
      ...mockUpdate.mock.calls.map(([, id, payload, note]) => ({ operation: 'update', target_id: id, payload, note })),
      ...mockCreate.mock.calls.map(([, payload, note]) => ({ operation: 'create', target_id: null, payload, note })),
    ]
    mockUpdate.mockReset()
    mockCreate.mockReset()
    mockDigest.mockReset()
    mockDigest.mockResolvedValue(undefined)

    setDb([bagel], filed)
    const body = await (await GET(request())).json()
    expect(body.filed).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('files nothing on a dry run', async () => {
    setDb([bagel], [])
    const body = await (await GET(request('?dry=1'))).json()
    expect(body.dry).toBe(true)
    expect(body.wouldFile.length).toBeGreaterThan(0)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockDigest).not.toHaveBeenCalled()
  })

  it('files nothing when it reads too few places, rather than calling every hechsher lost', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(fixture, { status: 200 })))
    setDb([bagel], [])
    const res = await GET(request())
    expect(res.status).toBe(502)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('refuses a production request without the cron secret', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await GET(request())
    expect(res.status).toBe(401)
  })
})
