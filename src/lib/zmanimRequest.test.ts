import { describe, expect, it } from 'vitest'
import { ZMANIM_BATCH_MAX, parseZmanimBatchRequest, parseZmanimRequest, roundZmanimCoord, zmanimBatchPath, zmanimPath } from './zmanimRequest'

const TZ = 'America/New_York'
const parse = (q: string) => parseZmanimRequest(new URLSearchParams(q), TZ)

describe('parseZmanimRequest', () => {
  it('accepts a normal request and rounds the coordinates', () => {
    expect(parse('lat=39.95234&lng=-75.16379&tzid=America/Chicago')).toEqual({
      ok: true,
      latitude: 39.95,
      longitude: -75.16,
      timezone: 'America/Chicago',
    })
  })

  it('falls back to the default timezone', () => {
    expect(parse('lat=1&lng=2')).toMatchObject({ ok: true, timezone: TZ })
  })

  it('collapses GPS jitter to one location, so nearby visitors share a cache entry', () => {
    const a = parse('lat=39.95101&lng=-75.16301')
    const b = parse('lat=39.95399&lng=-75.16499')
    expect(a).toEqual(b)
  })

  it.each([
    ['missing lng', 'lat=1'],
    ['missing both', ''],
  ])('rejects %s as Missing', (_n, q) => {
    expect(parse(q)).toEqual({ ok: false, error: 'Missing lat/lng.' })
  })

  it.each([
    ['trailing junk', 'lat=12abc&lng=5'],
    ['Infinity', 'lat=Infinity&lng=5'],
    ['NaN', 'lat=NaN&lng=5'],
    ['exponent form', 'lat=1e2&lng=5'],
    ['latitude past 90', 'lat=90.5&lng=5'],
    ['latitude below -90', 'lat=-91&lng=5'],
    ['longitude past 180', 'lat=5&lng=181'],
    ['empty', 'lat=&lng='],
  ])('rejects %s as Invalid', (_n, q) => {
    expect(parse(q)).toEqual({ ok: false, error: 'Invalid lat/lng.' })
  })

  it('accepts the exact limits', () => {
    expect(parse('lat=-90&lng=180')).toMatchObject({ ok: true, latitude: -90, longitude: 180 })
  })

  it.each([
    ['not a timezone', 'tzid=Not/AZone'],
    ['injection attempt', 'tzid=' + encodeURIComponent('UTC&latitude=1')],
    ['too long', 'tzid=' + 'A'.repeat(65)],
    ['empty', 'tzid='],
  ])('rejects a bad tzid: %s', (_n, tz) => {
    expect(parse(`lat=1&lng=2&${tz}`)).toEqual({ ok: false, error: 'Invalid tzid.' })
  })
})

describe('roundZmanimCoord / zmanimPath', () => {
  it('never yields negative zero', () => {
    expect(Object.is(roundZmanimCoord(-0.001), 0)).toBe(true)
  })

  it('builds a rounded, encoded path', () => {
    expect(zmanimPath(39.95234, -75.16379, 'America/New_York')).toBe(
      '/api/zmanim?lat=39.95&lng=-75.16&tzid=America%2FNew_York',
    )
    expect(zmanimPath(1, 2)).toBe('/api/zmanim?lat=1&lng=2')
  })
})

describe('zmanim batch request', () => {
  const qs = (s: string) => new URLSearchParams(s)

  it('builds one URL per set of spots, whatever the order or jitter', () => {
    const a = zmanimBatchPath([{ lat: 40.001, lng: -75.2 }, { lat: 39.95, lng: -75.16 }])
    const b = zmanimBatchPath([{ lat: 39.951, lng: -75.161 }, { lat: 40.004, lng: -75.201 }, { lat: 40.0, lng: -75.2 }])
    expect(a).toBe(b)
    expect(a).toBe('/api/zmanim/batch?p=39.95,-75.16&p=40,-75.2')
  })

  it('parses points, rounding and de-duplicating them', () => {
    const r = parseZmanimBatchRequest(qs('p=39.951,-75.161&p=39.95,-75.16&p=40,-75.2'), 'America/New_York')
    expect(r).toEqual({
      ok: true,
      timezone: 'America/New_York',
      points: [{ lat: 39.95, lng: -75.16 }, { lat: 40, lng: -75.2 }],
    })
  })

  it.each([
    ['no points', ''],
    ['a malformed point', 'p=abc,1'],
    ['a three-part point', 'p=1,2,3'],
    ['an out-of-range latitude', 'p=91,0'],
    ['a bad timezone', 'p=1,2&tzid=Not/AZone'],
  ])('refuses %s', (_name, query) => {
    expect(parseZmanimBatchRequest(qs(query), 'America/New_York').ok).toBe(false)
  })

  it('refuses more points than the cap', () => {
    const many = Array.from({ length: ZMANIM_BATCH_MAX + 1 }, (_, i) => `p=${i},0`).join('&')
    expect(parseZmanimBatchRequest(qs(many), 'America/New_York').ok).toBe(false)
  })
})
