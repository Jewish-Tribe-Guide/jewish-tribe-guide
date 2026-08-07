import { describe, expect, it } from 'vitest'
import { distanceMiles, haversineMiles, type LatLng } from './geo'

// Reference points around Philadelphia, where the distances are the ones the
// directory actually sorts by.
const PENN_PRESBYTERIAN: LatLng = { lat: 39.9573, lng: -75.1979 }
const JEFFERSON: LatLng = { lat: 39.9492, lng: -75.1583 }
const CHOP: LatLng = { lat: 39.9487, lng: -75.1938 }

describe('haversineMiles', () => {
  it('is zero for a point against itself', () => {
    expect(haversineMiles(PENN_PRESBYTERIAN, PENN_PRESBYTERIAN)).toBe(0)
  })

  it('measures a known short city distance', () => {
    // Penn Presbyterian → Jefferson is a little over two miles.
    expect(haversineMiles(PENN_PRESBYTERIAN, JEFFERSON)).toBeCloseTo(2.16, 1)
  })

  it('is symmetric', () => {
    expect(haversineMiles(PENN_PRESBYTERIAN, JEFFERSON)).toBeCloseTo(
      haversineMiles(JEFFERSON, PENN_PRESBYTERIAN),
      10,
    )
  })

  it('measures a known long distance across the country', () => {
    // Philadelphia → Los Angeles, ~2,400 miles.
    const la: LatLng = { lat: 34.0522, lng: -118.2437 }
    expect(haversineMiles(PENN_PRESBYTERIAN, la)).toBeGreaterThan(2350)
    expect(haversineMiles(PENN_PRESBYTERIAN, la)).toBeLessThan(2450)
  })

  it('handles crossing the equator and the prime meridian', () => {
    const north: LatLng = { lat: 1, lng: 1 }
    const south: LatLng = { lat: -1, lng: -1 }
    // ~1 degree in each direction from the origin, twice over.
    expect(haversineMiles(north, south)).toBeCloseTo(195, 0)
  })

  it('orders nearby places correctly', () => {
    // CHOP is closer to Penn Presbyterian than Jefferson is — this ordering is
    // what the "nearest first" sort depends on.
    expect(haversineMiles(PENN_PRESBYTERIAN, CHOP)).toBeLessThan(
      haversineMiles(PENN_PRESBYTERIAN, JEFFERSON),
    )
  })
})

describe('distanceMiles', () => {
  it('rounds to one decimal place, the way distances are displayed', () => {
    expect(distanceMiles(PENN_PRESBYTERIAN, JEFFERSON)).toBe(2.2)
    expect(distanceMiles(PENN_PRESBYTERIAN, PENN_PRESBYTERIAN)).toBe(0)
  })

  it('never returns more than one decimal', () => {
    const d = distanceMiles(PENN_PRESBYTERIAN, CHOP)
    expect(d).toBe(Math.round(d * 10) / 10)
  })
})
