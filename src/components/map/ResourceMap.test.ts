import { describe, expect, it } from 'vitest'
import { haversineMiles } from '@/lib/geo'
import { pointsWithinZoomRadius } from './ResourceMap'

// Pure-function coverage for the admin's map zoom radius (site_settings.
// map_zoom_radius_miles) — the piece that decides which points count toward
// the map's automatic "fit everything" framing. The actual fitBounds calls
// that consume this live inside a real google.maps.Map effect, which (like
// the rest of ResourceMap.tsx) isn't unit-testable without the real SDK —
// see ResourceMapView.test.tsx's own note on mocking ResourceMap wholesale
// for that reason. This is the one piece of that logic worth pulling out and
// testing directly.

const CENTER = { lat: 40, lng: -75 }
// Roughly 1 mile north of CENTER (1 degree of latitude ≈ 69 miles).
const NEAR = { lat: 40 + 1 / 69, lng: -75 }
// Roughly 50 miles north of CENTER — a stand-in for a delivery-only listing
// far outside town.
const FAR = { lat: 40 + 50 / 69, lng: -75 }

describe('pointsWithinZoomRadius', () => {
  it('returns every point unchanged when no radius is configured (null)', () => {
    expect(pointsWithinZoomRadius([NEAR, FAR], CENTER, null)).toEqual([NEAR, FAR])
  })

  it('returns every point unchanged when the radius is undefined (not yet migrated/configured)', () => {
    expect(pointsWithinZoomRadius([NEAR, FAR], CENTER, undefined)).toEqual([NEAR, FAR])
  })

  it('excludes a point farther than the configured radius from the anchor', () => {
    expect(pointsWithinZoomRadius([NEAR, FAR], CENTER, 10)).toEqual([NEAR])
  })

  it('includes a point exactly at the radius boundary (<=, not <)', () => {
    const exactDistance = haversineMiles(CENTER, NEAR)
    expect(pointsWithinZoomRadius([NEAR], CENTER, exactDistance)).toEqual([NEAR])
  })

  it('returns an empty array when every point is outside the radius', () => {
    expect(pointsWithinZoomRadius([FAR], CENTER, 1)).toEqual([])
  })

  it('returns an empty array unchanged when given no points', () => {
    expect(pointsWithinZoomRadius([], CENTER, 10)).toEqual([])
  })
})
