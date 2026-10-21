import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeListing } from '@/test/providerFixtures'
import type { Watch } from '@/lib/watches'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  listApprovedResources: vi.fn(),
  listWatches: vi.fn(),
  addWatch: vi.fn(),
  updateWatch: vi.fn(),
  removeWatch: vi.fn(),
  runAndRecord: vi.fn(),
  readRefuahNear: vi.fn(),
  pending: [] as { target_id: string }[],
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches, addWatch: m.addWatch, updateWatch: m.updateWatch, removeWatch: m.removeWatch }))
vi.mock('@/lib/watchRunner', () => ({ runAndRecord: m.runAndRecord }))
vi.mock('@/lib/refuahRun', () => ({ readRefuahNear: m.readRefuahNear }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, in: () => q, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: m.pending, error: null }).then(ok) }
      return q
    },
  }),
}))

const { GET, POST } = await import('./route')
const { REFUAH_MATCH_CREATOR, REFUAH_NOT_LISTED_CREATOR, notOnRefuahUrl, refuahPageUrl } = await import('@/lib/refuahMatch')

const PA_ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const FAR_ID = '7d1f3c2a-9b8e-4c6d-a5f4-3e2d1c0b9a87'
const PA = { _id: 'jx75q42dv17pxq7zckc9sx31v589mzem', name: 'Pennsylvania Hospital', formattedAddress: '800 Spruce St, Philadelphia, PA 19107, USA', latitude: 39.9451, longitude: -75.1556 }
const HUP = { _id: 'jx77h9d00qztqgbbe8e0rfj1r589mgf5', name: 'Hospital of the University of Pennsylvania', formattedAddress: '3400 Spruce St, Philadelphia, PA 19104, USA', latitude: 39.9496, longitude: -75.1925 }
const req = (method: string, body?: unknown) => new Request('http://x/api/admin/watches/hospitals', { method, body: body === undefined ? undefined : JSON.stringify(body) })
const w = (over: Partial<Watch>) => ({ id: 'w1', communityId: 'philly', kind: 'website', active: true, createdBy: REFUAH_MATCH_CREATOR, lastCheck: null, ...over }) as Watch

beforeEach(() => {
  vi.clearAllMocks()
  m.pending = []
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listApprovedResources.mockResolvedValue([
    makeListing({ id: PA_ID, category: 'hospital', name: 'Pennsylvania Hospital', geo: { lat: 39.9451, lng: -75.1556 } }),
    makeListing({ id: FAR_ID, category: 'hospital', name: 'Shriners', geo: { lat: 39.99, lng: -75.15 } }),
    makeListing({ id: 'shul', category: 'synagogue', name: 'A shul' }),
  ])
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.readRefuahNear.mockResolvedValue([PA, HUP])
  m.addWatch.mockImplementation(async (_c: string, x: Partial<Watch>) => w({ id: 'new', ...x }))
  m.runAndRecord.mockImplementation(async (x: Watch) => ({ watch: { ...x, lastRunAt: 'now' } }))
})

describe('GET /api/admin/watches/hospitals', () => {
  it('refuses anyone who isn’t this community’s admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req('GET'))).status).toBe(401)
    expect((await POST(req('POST', { action: 'off', resourceId: PA_ID }))).status).toBe(401)
  })

  it('lists each hospital with where its Refuah page came from, or why it has none, and what waits in the queue', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ url: refuahPageUrl(PA._id), resourceId: PA_ID })], available: true })
    m.pending = [{ target_id: PA_ID }]
    const body = await (await GET(req('GET'))).json()
    expect(body.hospitals.map((h: { name: string }) => h.name)).toEqual(['Pennsylvania Hospital', 'Shriners'])
    const [pa, far] = body.hospitals
    expect(pa).toMatchObject({ source: 'match', line: 'Matched to Refuah’s Pennsylvania Hospital, 800 Spruce St · same spot on the map', pending: 1, refuah: { name: 'Pennsylvania Hospital', street: '800 Spruce St' } })
    expect(far).toMatchObject({ source: null, watch: null, line: expect.stringMatching(/^Not found on Refuah\. The nearest hospital on Refuah is 3\.\d mi away/) })
    // Nearest first, for "Give its Refuah page".
    expect(far.nearby.map((r: { id: string }) => r.id)).toEqual([PA._id, HUP._id])
  })

  it('a page given by hand says so, and wins over the run’s own', async () => {
    m.listWatches.mockResolvedValue({
      watches: [w({ id: 'auto', url: refuahPageUrl(PA._id), resourceId: PA_ID }), w({ id: 'hand', url: refuahPageUrl(HUP._id), resourceId: PA_ID, createdBy: 'me@x.co' })],
      available: true,
    })
    const [pa] = (await (await GET(req('GET'))).json()).hospitals
    expect(pa.watch.id).toBe('hand')
    expect(pa.line).toMatch(/^Given by hand: Refuah’s Hospital of the University of Pennsylvania, 3400 Spruce St · 2 mi apart on the map$/)
  })

  it('asks Refuah about the hospitals on the map, from where each is', async () => {
    await GET(req('GET'))
    expect(m.readRefuahNear).toHaveBeenCalledWith([
      { lat: 39.9451, lng: -75.1556 },
      { lat: 39.99, lng: -75.15 },
    ])
  })

  it('Refuah down: still lists them, and says so', async () => {
    m.readRefuahNear.mockResolvedValue({ error: 'Refuah answered 502' })
    const body = await (await GET(req('GET'))).json()
    expect(body.refuahError).toBe('Refuah answered 502')
    expect(body.hospitals).toHaveLength(2)
  })
})

describe('POST /api/admin/watches/hospitals', () => {
  it('choose: the chosen page replaces its other one and a "Not on Refuah", given by hand, and is read at once', async () => {
    m.listWatches.mockResolvedValue({
      watches: [w({ id: 'auto', url: refuahPageUrl(PA._id), resourceId: PA_ID }), w({ id: 'n', url: notOnRefuahUrl(PA_ID), resourceId: PA_ID, createdBy: REFUAH_NOT_LISTED_CREATOR })],
      available: true,
    })
    const res = await POST(req('POST', { action: 'choose', resourceId: PA_ID, url: 'refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5' }))
    expect(res.status).toBe(200)
    expect(m.removeWatch.mock.calls.map((c) => c[1])).toEqual(['auto', 'n'])
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: refuahPageUrl(HUP._id), resourceId: PA_ID, label: 'Pennsylvania Hospital on Refuah', createdBy: 'me@x.co' })
    expect(m.runAndRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }), undefined, undefined, { full: true })
  })

  it('choose: never a Refuah search, nor a page another hospital has', async () => {
    expect((await POST(req('POST', { action: 'choose', resourceId: PA_ID, url: 'https://refuah.com/search?q=penn' }))).status).toBe(400)
    m.listWatches.mockResolvedValue({ watches: [w({ url: refuahPageUrl(HUP._id), resourceId: FAR_ID })], available: true })
    const taken = await POST(req('POST', { action: 'choose', resourceId: PA_ID, url: refuahPageUrl(HUP._id) }))
    expect(taken.status).toBe(409)
    expect((await taken.json()).errors[0]).toBe('That Refuah page is already read for Shriners.')
    expect(m.addWatch).not.toHaveBeenCalled()
  })

  it('off: a page is turned off, not removed; with none, it’s kept as "Not on Refuah"', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'auto', url: refuahPageUrl(PA._id), resourceId: PA_ID })], available: true })
    await POST(req('POST', { action: 'off', resourceId: PA_ID }))
    expect(m.updateWatch).toHaveBeenCalledWith('philly', 'auto', { active: false })
    expect(m.removeWatch).not.toHaveBeenCalled()

    m.listWatches.mockResolvedValue({ watches: [], available: true })
    const body = await (await POST(req('POST', { action: 'off', resourceId: FAR_ID }))).json()
    expect(body.notOnRefuah).toBe(true)
    expect(m.addWatch).toHaveBeenCalledWith('philly', expect.objectContaining({ url: notOnRefuahUrl(FAR_ID), resourceId: FAR_ID, createdBy: REFUAH_NOT_LISTED_CREATOR, active: false }))
  })

  it('on: a page turned off is read again at once; a "Not on Refuah" goes and the hospital is matched again', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'auto', url: refuahPageUrl(PA._id), resourceId: PA_ID, active: false })], available: true })
    await POST(req('POST', { action: 'on', resourceId: PA_ID }))
    expect(m.updateWatch).toHaveBeenCalledWith('philly', 'auto', { active: true })
    expect(m.runAndRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'auto', active: true }), undefined, undefined, { full: true })

    vi.clearAllMocks()
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'n', url: notOnRefuahUrl(PA_ID), resourceId: PA_ID, createdBy: REFUAH_NOT_LISTED_CREATOR, active: false })], available: true })
    await POST(req('POST', { action: 'on', resourceId: PA_ID }))
    expect(m.removeWatch).toHaveBeenCalledWith('philly', 'n')
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: refuahPageUrl(PA._id), resourceId: PA_ID, label: 'Pennsylvania Hospital on Refuah', createdBy: REFUAH_MATCH_CREATOR })
    expect(m.runAndRecord).toHaveBeenCalledTimes(1)
  })

  it('refuses a listing that isn’t one of the guide’s hospitals', async () => {
    expect((await POST(req('POST', { action: 'off', resourceId: '11111111-2222-4333-8444-555555555555' }))).status).toBe(400)
    expect((await POST(req('POST', { action: 'nonsense', resourceId: PA_ID }))).status).toBe(400)
  })
})
