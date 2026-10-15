import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EruvMapSource } from '@/lib/eruvStore'
import type { EruvLineFile } from '@/lib/eruvLine'

// GET /api/eruv/maps: each eruv's own map, read now, without what an
// admin left out; the last good read when its site is down.

const store = vi.hoisted(() => ({ sources: [] as EruvMapSource[], reads: [] as unknown[][] }))
vi.mock('@/lib/eruvStore', () => ({
  listEruvMapSources: async () => store.sources,
  saveLineRead: async (...a: unknown[]) => void store.reads.push(a),
}))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))

const { GET } = await import('./route')

const KML = `<kml><Document>
  <Style id="red"><LineStyle><color>ff0000ff</color><width>5</width></LineStyle></Style>
  <Placemark><name>Boundary</name><styleUrl>#red</styleUrl><LineString><coordinates>-75.2,39.9,0 -75.1,39.9,0 -75.1,40,0</coordinates></LineString></Placemark>
  <Placemark><name>Shul</name><Point><coordinates>-75.15,39.95,0</coordinates></Point></Placemark>
</Document></kml>`
const LAST: EruvLineFile = { lines: [{ name: 'Boundary', points: [[39.9, -75.2], [39.9, -75.1]] }] }
const source = (over: Partial<EruvMapSource> = {}): EruvMapSource => ({
  communityId: 'philly', id: 'northeast', name: 'Northeast Eruv', lineUrl: 'https://www.google.com/maps/d/viewer?mid=abc', rawLine: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null, ...over,
})
const call = async () => {
  const res = await GET(new Request('http://localhost/api/eruv/maps?community=philly'))
  return { res, body: (await res.json()) as { ok: boolean; maps: { id: string; map: EruvLineFile }[] } }
}

beforeEach(() => {
  store.sources = []
  store.reads.length = 0
})
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/eruv/maps', () => {
  it('each eruv’s map as it draws it, kept at the CDN for an hour, its first read saved', async () => {
    store.sources = [source()]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(KML)))
    const { res, body } = await call()
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600')
    expect(body.maps[0].map.lines[0]).toMatchObject({ name: 'Boundary', color: '#ff0000', width: 5 })
    expect(body.maps[0].map.marks?.map((m) => m.name)).toEqual(['Shul'])
    expect(store.reads).toHaveLength(1)
  })

  it('without its markers when an admin hid them', async () => {
    store.sources = [source({ lineHidePoints: true })]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(KML)))
    const { body } = await call()
    expect(body.maps[0].map.marks).toBeUndefined()
  })

  it('in the colour an admin chose for its lines (Oct 15)', async () => {
    store.sources = [source({ lineColor: '#1d4ed8' })]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(KML)))
    const { body } = await call()
    expect(body.maps[0].map.lines[0]).toMatchObject({ name: 'Boundary', color: '#1d4ed8', width: 5 })
  })

  it('their site down: the last good read, and an eruv never read is left off', async () => {
    store.sources = [source({ rawLine: LAST }), source({ id: 'elkins-park' })]
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const { body } = await call()
    expect(body.maps).toEqual([{ id: 'northeast', map: LAST }])
  })
})
