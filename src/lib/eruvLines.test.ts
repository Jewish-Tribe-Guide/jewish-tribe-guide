import { describe, expect, it, vi } from 'vitest'
import { runLine } from './eruvLines'
import type { EruvLineFile } from './eruvLine'

const NOW = new Date('2026-10-08T11:00:00Z') // Thursday
const A: EruvLineFile = { lines: [{ name: 'Main', points: [[39.95, -75.19], [39.96, -75.18]] }] }
const B: EruvLineFile = { lines: [{ name: 'Main', points: [[39.95, -75.19], [39.97, -75.18]] }] }
const geo = (f: EruvLineFile) =>
  JSON.stringify({ type: 'FeatureCollection', features: f.lines.map((l) => ({ type: 'Feature', properties: { name: l.name }, geometry: { type: 'LineString', coordinates: l.points.map(([lat, lng]) => [lng, lat]) } })) })
const serving = (f: EruvLineFile) => vi.fn(async () => new Response(geo(f))) as unknown as typeof fetch
const eruv = (over = {}) => ({ id: 'cc', lineUrl: 'https://example.org/line.geojson', rawLine: A, linePending: null, lineReadAt: '2026-10-01T11:00:00Z', ...over })

describe('runLine', () => {
  it('waits for the day before candles, except a line never read', async () => {
    const fetchImpl = serving(A)
    expect((await runLine(eruv(), { due: false, now: NOW, fetchImpl })).run.result).toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect((await runLine(eruv({ rawLine: null, lineReadAt: null }), { due: false, now: NOW, fetchImpl })).run.result).toBe('new')
  })
  it('the same line clears anything pending; a different one waits for an admin', async () => {
    expect(await runLine(eruv({ linePending: B }), { due: true, now: NOW, fetchImpl: serving(A) })).toEqual({ run: { id: 'cc', result: 'unchanged' }, save: { ok: true, pending: null, at: NOW.toISOString() } })
    expect(await runLine(eruv(), { due: true, now: NOW, fetchImpl: serving(B) })).toEqual({ run: { id: 'cc', result: 'changed' }, save: { ok: true, pending: B, at: NOW.toISOString() } })
  })
  it('a change already waiting isn’t news again', async () => {
    expect((await runLine(eruv({ linePending: B }), { due: true, now: NOW, fetchImpl: serving(B) })).run.result).toBe('waiting')
  })
  it('a map that can’t be read keeps the line and says why', async () => {
    const down = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    expect(await runLine(eruv(), { due: true, now: NOW, fetchImpl: down })).toEqual({ run: { id: 'cc', result: 'failed', error: 'The map answered 404' }, save: { ok: false, error: 'The map answered 404', at: NOW.toISOString() } })
  })
})
