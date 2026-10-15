import { describe, expect, it } from 'vitest'
import { orsMatrixBody, readOrsMatrix, routesThatHold, routesToWorkOut, samePlace, type WalkRoute } from './walkRoutes'

const at = { lat: 39.95, lng: -75.16 }
const milesNorth = (miles: number) => ({ lat: at.lat + miles / 69.05, lng: at.lng })
const route = (to: { lat: number; lng: number }, minutes: number | null, meters: number | null = 1000): WalkRoute => ({ from: at, to, minutes, meters })

describe('samePlace', () => {
  it('is the same place within about 25 metres, not past it', () => {
    expect(samePlace(at, milesNorth(0.01))).toBe(true)
    expect(samePlace(at, milesNorth(0.02))).toBe(false)
  })
})

describe('routesThatHold', () => {
  const a = { id: 'a', geo: milesNorth(0.5) }
  it('keeps a walk while neither end has moved, in minutes and miles', () => {
    const held = routesThatHold({ a: route(a.geo, 14, 1609) }, at, [a])
    expect(held.get('a')?.minutes).toBe(14)
    expect(held.get('a')?.miles).toBeCloseTo(1, 2)
  })
  it('drops it once either end moves, or when no route was found', () => {
    expect(routesThatHold({ a: route(a.geo, 14) }, milesNorth(0.1), [a]).size).toBe(0)
    expect(routesThatHold({ a: route(a.geo, 14) }, at, [{ id: 'a', geo: milesNorth(0.6) }]).size).toBe(0)
    expect(routesThatHold({ a: route(a.geo, null, null) }, at, [a]).size).toBe(0)
  })
})

describe('routesToWorkOut', () => {
  const near = { id: 'near', geo: milesNorth(1) }
  const far = { id: 'far', geo: milesNorth(2) }
  it('every place in reach that has no walk yet; never one too far even in a straight line', () => {
    // 30 minutes reaches 1.5 straight-line miles at its fastest.
    expect(routesToWorkOut(at, [near, far, { id: 'nowhere' }], 30, undefined).map((p) => p.id)).toEqual(['near'])
  })
  it('not one already worked out, unless an end has moved since', () => {
    const stored = new Map([['near', route(near.geo, 22)]])
    expect(routesToWorkOut(at, [near], 30, stored)).toEqual([])
    expect(routesToWorkOut(milesNorth(0.1), [near], 30, stored).map((p) => p.id)).toEqual(['near'])
  })
})

describe('the OpenRouteService matrix', () => {
  it('asks from one place to each, in longitude, latitude', () => {
    expect(orsMatrixBody(at, [{ lat: 40, lng: -75 }])).toEqual({
      locations: [[-75.16, 39.95], [-75, 40]],
      sources: [0],
      destinations: [1],
      metrics: ['duration', 'distance'],
      units: 'm',
    })
  })
  it('reads minutes (at least one) and metres, null where it found no route', () => {
    expect(readOrsMatrix({ durations: [[600.4, 20, null]], distances: [[812.6, 5, null]] }, 3)).toEqual([
      { minutes: 10, meters: 813 },
      { minutes: 1, meters: 5 },
      { minutes: null, meters: null },
    ])
  })
  it('is no answer when the reply isn’t one, or is short', () => {
    expect(readOrsMatrix({ error: 'quota' }, 1)).toBeNull()
    expect(readOrsMatrix({ durations: [[60]], distances: [[80]] }, 2)).toBeNull()
  })
})
