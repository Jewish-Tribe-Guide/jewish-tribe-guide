import { describe, expect, it, vi } from 'vitest'
import { newlyMissing, readEruvMap } from './eruvLines'
import type { EruvLineFile } from './eruvLine'

const NOW = new Date('2026-10-12T11:00:00Z')
const A: EruvLineFile = { lines: [{ name: 'Main', points: [[39.95, -75.19], [39.96, -75.18]] }, { name: 'Old border', points: [[39.95, -75.19], [39.94, -75.18]] }] }
const B: EruvLineFile = { lines: [{ name: 'Main', points: [[39.95, -75.19], [39.97, -75.18]] }, { name: 'Old border', points: [[39.95, -75.19], [39.94, -75.18]] }] }
const geo = (f: EruvLineFile) =>
  JSON.stringify({ type: 'FeatureCollection', features: f.lines.map((l) => ({ type: 'Feature', properties: { name: l.name }, geometry: { type: 'LineString', coordinates: l.points.map(([lat, lng]) => [lng, lat]) } })) })
const serving = (f: EruvLineFile) => vi.fn(async () => new Response(geo(f))) as unknown as typeof fetch
const source = (over = {}) => ({ lineUrl: 'https://example.org/line.geojson', rawLine: A, lineLeaveOut: ['Old border'], lineHidePoints: false, lineColor: null, ...over })

describe('readEruvMap: the eruv’s own map, read now', () => {
  it('shown without what was left out; nothing to save when it’s as it was', async () => {
    const read = await readEruvMap(source(), NOW, serving(A))
    expect(read.map?.lines.map((l) => l.name)).toEqual(['Main'])
    expect(read.save).toBeUndefined()
    expect(read.missing).toEqual([])
  })
  it('a changed map shows at once, with no one to approve it, and is kept', async () => {
    const read = await readEruvMap(source(), NOW, serving(B))
    expect(read.map?.lines[0].points[1]).toEqual([39.97, -75.18])
    expect(read.save).toEqual({ ok: true, file: B, at: NOW.toISOString() })
  })
  it('in the colour an admin chose, whether read now or from the last good read; what’s kept is their own', async () => {
    const read = await readEruvMap(source({ lineColor: '#1d4ed8' }), NOW, serving(B))
    expect(read.map!.lines.map((l) => l.color)).toEqual(['#1d4ed8'])
    expect(read.save).toMatchObject({ ok: true, file: { lines: [{ name: 'Main' }, { name: 'Old border' }] } })
    expect((read.save as { file: EruvLineFile }).file.lines.every((l) => l.color === undefined)).toBe(true)
    const down = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch
    expect((await readEruvMap(source({ lineColor: '#1d4ed8' }), NOW, down)).map!.lines.map((l) => l.color)).toEqual(['#1d4ed8'])
  })

  it('a map that can’t be read shows the last good read, and says why', async () => {
    const down = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    const read = await readEruvMap(source(), NOW, down)
    expect(read.map?.lines.map((l) => l.name)).toEqual(['Main'])
    expect(read.save).toEqual({ ok: false, error: 'The map answered 404', at: NOW.toISOString() })
    expect(read.missing).toBeNull()
  })
  it('a part left out that the map no longer has is missing: the eruv renamed it, and its replacement shows', async () => {
    const renamed: EruvLineFile = { lines: [A.lines[0], { ...A.lines[1], name: 'Old border (2025)' }] }
    const read = await readEruvMap(source(), NOW, serving(renamed))
    expect(read.missing).toEqual(['Old border'])
    expect(read.map?.lines.map((l) => l.name)).toEqual(['Main', 'Old border (2025)'])
  })
})

describe('newlyMissing: admins hear once', () => {
  it('only what they haven’t been told of', () => {
    expect(newlyMissing(['Old border'], [])).toEqual(['Old border'])
    expect(newlyMissing(['Old border'], ['old border'])).toEqual([])
    expect(newlyMissing(['Old border', 'Line 9'], ['Old border'])).toEqual(['Line 9'])
  })
})
