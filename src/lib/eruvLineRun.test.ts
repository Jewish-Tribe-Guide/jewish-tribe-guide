import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EruvMapSource } from './eruvStore'

// The daily check: each eruv's map read, and the admins told once of a
// part they left out that the map no longer has.

const store = vi.hoisted(() => ({ sources: [] as EruvMapSource[], reads: [] as unknown[], missing: [] as unknown[] }))
vi.mock('./eruvStore', () => ({
  listEruvMapSources: async () => store.sources,
  saveLineRead: async (...a: unknown[]) => void store.reads.push(a),
  saveLineMissing: async (...a: unknown[]) => void store.missing.push(a),
}))
const sent = vi.hoisted(() => [] as unknown[])
vi.mock('./email', () => ({ sendEruvLineAlert: async (...a: unknown[]) => void sent.push(a) }))

const { runEruvLines } = await import('./eruvLineRun')

const file = (names: string[]) =>
  JSON.stringify({ type: 'FeatureCollection', features: names.map((name, i) => ({ type: 'Feature', properties: { name }, geometry: { type: 'LineString', coordinates: [[-75.1, 39.9 + i / 100], [-75.2, 39.9 + i / 100]] } })) })
const source = (over: Partial<EruvMapSource> = {}): EruvMapSource => ({
  communityId: 'philly', id: 'center-city', name: 'Center City Eruv', lineUrl: 'https://example.org/map.geojson', rawLine: null, lineLeaveOut: ['Washington Border'], lineHidePoints: false, lineMissing: [], lineColor: null, ...over,
})
const serve = (body: string, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))

beforeEach(() => {
  store.sources = []
  store.reads.length = 0
  store.missing.length = 0
  sent.length = 0
})
afterEach(() => vi.unstubAllGlobals())

describe('runEruvLines', () => {
  it('a map as it should be: kept, nobody told', async () => {
    store.sources = [source()]
    serve(file(['Main', 'Washington Border']))
    expect(await runEruvLines()).toEqual([{ id: 'center-city', result: 'read' }])
    expect(store.reads).toHaveLength(1)
    expect(sent).toEqual([])
  })

  it('a left-out part the map no longer has: the admins hear, once', async () => {
    store.sources = [source()]
    serve(file(['Main', 'Washington Avenue Border']))
    expect(await runEruvLines()).toEqual([{ id: 'center-city', result: 'missing', missing: ['Washington Border'] }])
    expect(store.missing).toEqual([['philly', 'center-city', ['Washington Border']]])
    expect(sent).toEqual([['philly', [{ name: 'Center City Eruv', missing: ['Washington Border'] }]]])

    // The next day: already told, so no email and nothing to save.
    sent.length = 0
    store.missing.length = 0
    store.sources = [source({ lineMissing: ['Washington Border'] })]
    await runEruvLines()
    expect(sent).toEqual([])
    expect(store.missing).toEqual([])
  })

  it('a map that can’t be read: recorded, nobody told, the rest still read', async () => {
    store.sources = [source(), source({ id: 'university-city', name: 'University City Eruv', lineLeaveOut: [] })]
    serve('', 503)
    const runs = await runEruvLines()
    expect(runs.map((r) => r.result)).toEqual(['failed', 'failed'])
    expect(store.reads).toHaveLength(2)
    expect(sent).toEqual([])
  })
})
