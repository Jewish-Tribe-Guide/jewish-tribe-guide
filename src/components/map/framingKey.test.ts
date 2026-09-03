import { describe, expect, it } from 'vitest'
import { framingKey } from './ResourceMap'

// Press-and-hold on a marker pins it — and used to zoom the map out to the
// whole community while doing so, but only for a visitor with no address set.
//
// The cause is that "the points array changed" and "a different set of places
// is shown" are not the same thing. allPoints stamps `pinned` on every point
// and lists pinnedIds in its deps, so toggling one pin rebuilds the whole
// array; ResourceMap's marker-rebuild effect reruns and ends by reframing the
// camera. With a location set that reframe is skipped outright, which is why
// the bug was invisible to anyone who had entered an address.
//
// framingKey is that distinction, pulled out as a pure function for the same
// reason pointsWithinZoomRadius was: the fitBounds call that consumes it needs
// the real Maps SDK (see ResourceMap.test.ts's own note), and this is the part
// worth testing directly.
describe('framingKey', () => {
  const points = [
    { id: 'shul-a', pinned: false },
    { id: 'deli-b', pinned: false },
    { id: 'store-c', pinned: false },
  ]

  it('is unchanged when a point is pinned — the same places, drawn differently', () => {
    const afterPinning = points.map((p) => (p.id === 'deli-b' ? { ...p, pinned: true } : p))
    expect(framingKey(afterPinning)).toBe(framingKey(points))
  })

  it('is unchanged when the same places arrive in a different order', () => {
    // Reordering produces identical bounds, so re-fitting for it would be the
    // same unwanted camera move.
    expect(framingKey([...points].reverse())).toBe(framingKey(points))
  })

  it('changes when a filter removes a place, which SHOULD reframe', () => {
    expect(framingKey(points.slice(0, 2))).not.toBe(framingKey(points))
  })

  it('changes when a search brings a different place in', () => {
    const swapped = [...points.slice(0, 2), { id: 'bakery-d', pinned: false }]
    expect(framingKey(swapped)).not.toBe(framingKey(points))
  })

  it('differs from the empty initial key, so the first real load still frames', () => {
    expect(framingKey(points)).not.toBe('')
    expect(framingKey([])).toBe('')
  })
})
