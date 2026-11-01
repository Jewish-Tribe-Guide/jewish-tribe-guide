import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EruvMapSource } from '@/lib/eruvStore'
import type { EruvLineFile } from '@/lib/eruvLine'

// GET /api/eruv/maps: each eruv's saved map, without what an admin left out.
// Nothing is read or saved here (the user, Nov 1): the nightly job reads them.

const store = vi.hoisted(() => ({ sources: [] as EruvMapSource[], reads: [] as unknown[][] }))
vi.mock('@/lib/eruvStore', () => ({
  listEruvMapSources: async () => store.sources,
  saveLineRead: async (...a: unknown[]) => void store.reads.push(a),
}))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))

const { GET } = await import('./route')

const SAVED: EruvLineFile = {
  lines: [{ name: 'Boundary', points: [[39.9, -75.2], [39.9, -75.1]], color: '#ff0000', width: 5 }, { name: 'Old border', points: [[39.9, -75.2], [39.8, -75.1]] }],
  marks: [{ name: 'Shul', at: [39.95, -75.15] }],
}
const source = (over: Partial<EruvMapSource> = {}): EruvMapSource => ({
  communityId: 'philly', id: 'northeast', name: 'Northeast Eruv', lineUrl: 'https://www.google.com/maps/d/viewer?mid=abc', rawLine: SAVED, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null, lineError: null, ...over,
})
const call = async () => {
  const res = await GET(new Request('http://localhost/api/eruv/maps?community=philly'))
  return { res, body: (await res.json()) as { ok: boolean; maps: { id: string; map: EruvLineFile }[] } }
}
const reader = vi.fn(async () => new Response('', { status: 500 }))

beforeEach(() => {
  store.sources = []
  store.reads.length = 0
  reader.mockClear()
  vi.stubGlobal('fetch', reader)
})
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/eruv/maps', () => {
  it('each eruv’s saved map, kept at the CDN for an hour', async () => {
    store.sources = [source()]
    const { res, body } = await call()
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600')
    expect(body.maps[0].map.lines[0]).toMatchObject({ name: 'Boundary', color: '#ff0000', width: 5 })
    expect(body.maps[0].map.marks?.map((m) => m.name)).toEqual(['Shul'])
  })

  it('a visitor never sets off a read, or saves anything (the user, Nov 1)', async () => {
    store.sources = [source(), source({ id: 'elkins-park', rawLine: null })]
    await call()
    expect(reader).not.toHaveBeenCalled()
    expect(store.reads).toEqual([])
  })

  it('without what an admin left out', async () => {
    store.sources = [source({ lineLeaveOut: ['Old border'] })]
    const { body } = await call()
    expect(body.maps[0].map.lines.map((l) => l.name)).toEqual(['Boundary'])
  })

  it('without its markers when an admin hid them', async () => {
    store.sources = [source({ lineHidePoints: true })]
    const { body } = await call()
    expect(body.maps[0].map.marks).toBeUndefined()
  })

  it('in the colour an admin chose for its lines (Oct 15)', async () => {
    store.sources = [source({ lineColor: '#1d4ed8' })]
    const { body } = await call()
    expect(body.maps[0].map.lines[0]).toMatchObject({ name: 'Boundary', color: '#1d4ed8', width: 5 })
  })

  it('an eruv never read is left off', async () => {
    store.sources = [source({ id: 'elkins-park', rawLine: null })]
    const { body } = await call()
    expect(body.maps).toEqual([])
  })
})
