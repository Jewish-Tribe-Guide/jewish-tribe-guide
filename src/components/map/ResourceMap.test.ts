import { describe, expect, it } from 'vitest'
import { haversineMiles } from '@/lib/geo'
import { markerZIndex, pointsWithinZoomRadius, SELECTED_Z_BOOST, type MapPoint } from './ResourceMap'

function point(overrides: Partial<MapPoint> = {}): MapPoint {
  return { id: 'p1', lat: 40, lng: -75, name: 'Test Place', color: '#000', ...overrides }
}

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

// AdvancedMarkerElement's own default stacking (screen position, recomputed
// every zoom frame — see markerZIndex's own doc comment) has no stable
// ordering for two markers close enough together to project to nearly the
// same screen Y: which one rounds "in front" can flip frame to frame,
// visible live as the pair swapping which is on top mid-zoom. markerZIndex
// exists to make that deterministic instead.
describe('markerZIndex', () => {
  it('is deterministic — the same point/selection always yields the same value', () => {
    const p = point({ lat: 40.123456 })
    expect(markerZIndex(p, false)).toBe(markerZIndex(p, false))
  })

  it('gives a more-southern point a higher (more "in front") value than a more-northern one', () => {
    const south = point({ lat: 39 })
    const north = point({ lat: 41 })
    expect(markerZIndex(south, false)).toBeGreaterThan(markerZIndex(north, false))
  })

  it('never depends on anything but latitude and selection — same lat, same value regardless of id/lng/name', () => {
    const a = point({ id: 'a', lat: 40, lng: -75, name: 'A' })
    const b = point({ id: 'b', lat: 40, lng: -73, name: 'B' })
    expect(markerZIndex(a, false)).toBe(markerZIndex(b, false))
  })

  it('boosts a selected point above an unselected neighbor regardless of latitude', () => {
    // The selected point is further NORTH — without the boost it would rank
    // BELOW its southern, unselected neighbor; the boost must overcome that.
    const selectedNorth = point({ id: 'sel', lat: 45 })
    const unselectedSouth = point({ id: 'other', lat: 30 })
    expect(markerZIndex(selectedNorth, true)).toBeGreaterThan(markerZIndex(unselectedSouth, false))
  })

  it('applies exactly SELECTED_Z_BOOST on top of the unselected value for the same point', () => {
    const p = point({ lat: 40 })
    expect(markerZIndex(p, true) - markerZIndex(p, false)).toBe(SELECTED_Z_BOOST)
  })
})
