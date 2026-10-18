import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The run's own decisions: what it files, what it refuses to file again,
// and when it files nothing at all. Reading and comparing the list is
// covered in mekorWatch.test.ts.

const fixture = fs.readFileSync(path.join(__dirname, '__fixtures__/mekor-center-city.html'), 'utf8')

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
vi.mock('@/lib/submissionStore', () => ({ submitListingCreate: mockCreate, submitListingUpdate: mockUpdate, submitListingDelete: vi.fn() }))
const mockDigest = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email', () => ({ sendWatchDigest: mockDigest }))
const mockGoogle = vi.hoisted(() => vi.fn())
const mockCanAsk = vi.hoisted(() => vi.fn(() => true))
vi.mock('@/lib/googlePlaces', () => ({ findPlaceStatus: mockGoogle, canAskGoogle: mockCanAsk }))

const { runMekorWatch } = await import('./mekorRun')
const LIST = 'https://www.mekorhabracha.org/center-city'

const base = { category: 'restaurant', status: 'approved', anchor_id: 'community', distance: null }
const magical = { ...base, id: 'magical', name: 'Magical Sweet Shop', address: '200 White Horse Rd E, Voorhees Township, NJ 08043, USA', phone: '(856) 309-1100', details: { kosherCert: 'IKC' } }
const zevis = { ...base, id: 'zevis', name: 'Zevi’s Bakery', address: 'South Philadelphia, Philadelphia, PA, USA', phone: null, details: { kosherCert: ['IKC'] } }
const shtetl = { ...base, id: 'shtetl', status: 'archived', name: 'Shtetl Kosher Restaurant', address: '9859 Bustleton Ave, Philadelphia, PA 19115, USA', phone: '(215) 677-3323', details: { kosherCert: 'Keystone-K' } }

let resourceQuery: Record<string, ReturnType<typeof vi.fn>> = {}

/** The guide's listings, the queue's pending new places, and what the watch filed before. */
function setDb(listings: unknown[], pending: unknown[], earlier: unknown[]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'resource') return (resourceQuery = chainable({ data: listings, error: null }) as typeof resourceQuery)
    const b = chainable(null)
    // The pending read asks for status = pending; the earlier read doesn't.
    let isPending = false
    b.eq = vi.fn((col: string) => {
      if (col === 'status') isPending = true
      return b
    })
    b.then = (resolve: (v: unknown) => void) => resolve({ data: isPending ? pending : earlier, error: null })
    return b
  })
}

const run = (dry = false) => runMekorWatch('philly', LIST, { dry })

beforeEach(() => {
  mockDigest.mockResolvedValue(undefined)
  mockGoogle.mockResolvedValue({ placeId: 'p', name: null, businessStatus: 'OPERATIONAL' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(fixture, { status: 200 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  mockFrom.mockReset()
  mockCreate.mockReset()
  mockUpdate.mockReset()
  mockDigest.mockReset()
  mockGoogle.mockReset()
  mockCanAsk.mockReset().mockReturnValue(true)
})

describe('runMekorWatch', () => {
  it('flags an IKC Mekor doesn’t give, quoting the list, from the watch, with one digest', async () => {
    setDb([magical, zevis], [], [])
    const body = await run()
    expect(body.ok).toBe(true)
    const byId = Object.fromEntries(mockUpdate.mock.calls.map((c) => [c[1], c]))
    const [community, , payload, note, by] = byId.magical
    expect(community).toBe('philly')
    expect(payload.details.kosherCert).toEqual([])
    expect(note).toContain('Supervision: "Under Keystone-K Supervision"')
    expect(note).toContain('last updated 2026-10-12')
    expect(by).toEqual({ name: 'Mekor Habracha list (automated)' })
    expect(byId.zevis[3]).toMatch(/doesn't have this place/)
    expect(mockCreate).toHaveBeenCalled() // the places the guide lacks
    expect(mockDigest).toHaveBeenCalledTimes(1)
    expect(mockDigest.mock.calls[0][2]).toHaveLength(body.ok ? body.filed : -1)
  })

  it('never files a removal', async () => {
    setDb([magical, zevis], [], [])
    const { submitListingDelete } = await import('@/lib/submissionStore')
    await run()
    expect(submitListingDelete).not.toHaveBeenCalled()
  })

  it('files a place the guide archived under the guide’s own name and address, saying so', async () => {
    setDb([shtetl], [], [])
    await run()
    const call = mockCreate.mock.calls.find(([, p]) => p.name === 'Shtetl Kosher Restaurant')!
    expect(call[1]).toMatchObject({ category: 'restaurant', address: shtetl.address, phone: shtetl.phone, submittedBy: { name: 'Mekor Habracha list (automated)' } })
    expect(call[2]).toMatch(/archived/)
    // The guide's archived listings are read, not only its live ones.
    expect(resourceQuery.in).toHaveBeenCalledWith('status', ['approved', 'archived'])
  })

  it('writes a new place’s phone as the guide does', async () => {
    setDb([], [], [])
    await run()
    expect(mockCreate.mock.calls.find(([, p]) => p.name === 'Z Candy Bar')![1].phone).toBe('(610) 668-1481')
  })

  it('does not suggest a place already waiting in the queue', async () => {
    setDb([], [{ id: 'q1', payload: { category: 'restaurant', name: 'Z Candy Bar', address: '304 Levering Mill Rd, Bala Cynwyd, PA 19004', phone: null, details: {} } }], [])
    await run()
    expect(mockCreate.mock.calls.map(([, p]) => p.name)).not.toContain('Z Candy Bar')
  })

  it('does not file again what it filed before, whatever the admin decided', async () => {
    setDb([magical, zevis, shtetl], [], [])
    await run()
    const filed = [
      ...mockUpdate.mock.calls.map(([, id, payload, note]) => ({ operation: 'update', target_id: id, payload, note })),
      ...mockCreate.mock.calls.map(([, payload, note]) => ({ operation: 'create', target_id: null, payload, note })),
    ]
    expect(filed.length).toBeGreaterThan(3)
    mockUpdate.mockReset()
    mockCreate.mockReset()
    mockDigest.mockReset().mockResolvedValue(undefined)

    setDb([magical, zevis, shtetl], [], filed)
    const body = await run()
    expect(body.ok && body.filed).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('does not suggest a new place Google says is permanently closed, and says Google’s answer on the rest', async () => {
    mockGoogle.mockImplementation(async (name: string) =>
      name === 'Z Candy Bar' ? { placeId: 'p1', name: 'Z Candy', businessStatus: 'CLOSED_PERMANENTLY' } : { placeId: 'p2', name: null, businessStatus: 'OPERATIONAL' },
    )
    setDb([], [], [])
    const body = await run()
    expect(mockCreate.mock.calls.map(([, p]) => p.name)).not.toContain('Z Candy Bar')
    expect(body.ok && body.closedOnGoogle).toContain('Z Candy Bar')
    expect(mockCreate.mock.calls[0][2]).toContain('Google: open.')
  })

  it('files nothing on a dry run', async () => {
    setDb([magical], [], [])
    const body = await run(true)
    expect(body.ok && body.wouldFile!.length).toBeGreaterThan(0)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockDigest).not.toHaveBeenCalled()
  })

  it('files nothing when it reads too few places, rather than flagging every IKC in the guide', async () => {
    const cards = fixture.split('<article')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(cards.slice(0, 11).join('<article'), { status: 200 })))
    setDb([magical, zevis], [], [])
    const body = await run()
    expect(body).toMatchObject({ ok: false, error: expect.stringContaining('Read only 10 places') })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('says when Mekor’s page can’t be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    expect(await run()).toEqual({ ok: false, error: 'Mekor Habracha’s list answered 503' })
  })
})
