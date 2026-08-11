import { describe, expect, it } from 'vitest'
import { travelCompare, travelParts, withMilesFromAddress } from './listingTravel'
import type { DirectoryResource } from '@/types'

// This comparator decides the order of every directory. The case worth guarding
// is a listing with no travel data at all — a category with hasAddress: false
// (WhatsApp Groups), or a visitor who hasn't typed an address yet. Returning 0
// there would leave listings in whatever order the database handed them over,
// which reads as random and changes between visits.

const at = (name: string, travel: Partial<DirectoryResource> = {}): DirectoryResource => ({
  id: name,
  category: 'grocery',
  name,
  anchorId: 'community',
  distance: 0,
  address: '',
  ...travel,
})

const sortedNames = (items: DirectoryResource[]) => [...items].sort(travelCompare).map((i) => i.name)

describe('travelCompare', () => {
  it('puts the closest first when the visitor typed an address', () => {
    expect(
      sortedNames([
        at('far', { milesFromAddress: 5.2 }),
        at('near', { milesFromAddress: 0.4 }),
        at('middle', { milesFromAddress: 2 }),
      ]),
    ).toEqual(['near', 'middle', 'far'])
  })

  it('sorts a listing with no distance last rather than first', () => {
    expect(sortedNames([at('unknown'), at('near', { milesFromAddress: 0.4 })])).toEqual(['near', 'unknown'])
  })

  it('prefers miles over drive time when both are present', () => {
    // Address mode is the live signal; drive minutes are dormant leftovers.
    expect(
      sortedNames([
        at('closer-by-road', { milesFromAddress: 3, driveMinutes: 1 }),
        at('closer-as-crow-flies', { milesFromAddress: 1, driveMinutes: 30 }),
      ]),
    ).toEqual(['closer-as-crow-flies', 'closer-by-road'])
  })

  it('falls back to drive time, then walk time', () => {
    expect(sortedNames([at('b', { driveMinutes: 20 }), at('a', { driveMinutes: 5 })])).toEqual(['a', 'b'])
    expect(sortedNames([at('b', { walkMinutes: 20 }), at('a', { walkMinutes: 5 })])).toEqual(['a', 'b'])
  })

  it('breaks a drive-time tie with walk time', () => {
    expect(
      sortedNames([
        at('longer-walk', { driveMinutes: 5, walkMinutes: 40 }),
        at('shorter-walk', { driveMinutes: 5, walkMinutes: 12 }),
      ]),
    ).toEqual(['shorter-walk', 'longer-walk'])
  })

  it('falls back to alphabetical when nothing has travel data', () => {
    expect(sortedNames([at('Zichron'), at('Ahavas'), at('Mikvah')])).toEqual(['Ahavas', 'Mikvah', 'Zichron'])
  })

  it('is a stable, total order — the same list always sorts the same way', () => {
    const items = [at('Zichron'), at('Ahavas'), at('Beis'), at('Mikvah')]
    expect(sortedNames(items)).toEqual(sortedNames([...items].reverse()))
  })

  it('treats zero miles as a real distance, not as missing', () => {
    expect(sortedNames([at('one-mile', { milesFromAddress: 1 }), at('here', { milesFromAddress: 0 })])).toEqual([
      'here',
      'one-mile',
    ])
  })
})

describe('withMilesFromAddress', () => {
  const geo = (lat: number, lng: number) => ({ lat, lng })

  it('stamps unrounded straight-line miles from the given coords', () => {
    const items = [at('a', { geo: geo(39.9573, -75.1979) })]
    const [a] = withMilesFromAddress(items, { lat: 39.9492, lng: -75.1583 })
    // Penn Presbyterian → Jefferson is ~2.16 mi — not the rounded 2.2 a
    // display value would show.
    expect(a.milesFromAddress).toBeCloseTo(2.16, 1)
  })

  it('leaves a listing with no coordinates untouched', () => {
    const items = [at('a')]
    expect(withMilesFromAddress(items, { lat: 0, lng: 0 })[0].milesFromAddress).toBeUndefined()
  })

  it('returns the listings as-is when there is no anchor yet', () => {
    const items = [at('a', { geo: geo(0, 0) })]
    expect(withMilesFromAddress(items, null)).toBe(items)
  })

  // The actual bug this guards: two listings a couple hundred feet apart
  // both round to the same 0.1-mile bucket, so rounding before comparing
  // (the old behavior) ties them and falls back to whatever order they
  // happened to load in — the map, which never rounded before sorting, had
  // no such problem and got it right every time.
  it('keeps the true nearer listing first even when both round the same', () => {
    const anchor = geo(39.9573, -75.1979)
    // ~250 ft and ~500 ft away respectively — both round to "0.1 mi".
    const items = [at('farther', { geo: geo(39.9580, -75.1979) }), at('nearer', { geo: geo(39.9577, -75.1979) })]
    const sorted = [...withMilesFromAddress(items, anchor)].sort(travelCompare)
    expect(sorted.map((i) => i.name)).toEqual(['nearer', 'farther'])
  })

  // "I'm here" (see SetLocationButton) sets the anchor to a listing's own
  // geo, which the haversine math already resolves to exactly 0 in the
  // normal case — same point against itself. This tests the explicit
  // guarantee on top of that: even if the listing's OWN stored geo has
  // drifted from the coords that set the anchor (a re-sync, a stale
  // object), it still sorts first by definition, not by whatever the
  // coordinate math happens to come out to.
  it('forces the anchored listing to zero even if its own geo has drifted from the anchor', () => {
    const anchor = geo(39.9573, -75.1979) // what "I'm here" set
    const items = [
      at('true-closest-by-math', { id: 'x', geo: geo(39.95732, -75.19792) }), // a few feet from the anchor
      at('the-anchor', { id: 'anchor-id', geo: geo(39.958, -75.198) }), // its own stored geo has drifted
    ]
    const [trueClosest, theAnchor] = withMilesFromAddress(items, anchor, 'anchor-id')
    expect(theAnchor.milesFromAddress).toBe(0)
    expect(trueClosest.milesFromAddress).toBeGreaterThan(0)
    const sorted = [...withMilesFromAddress(items, anchor, 'anchor-id')].sort(travelCompare)
    expect(sorted[0].id).toBe('anchor-id')
  })
})

describe('travelParts', () => {
  it('shows miles alone when the visitor typed an address', () => {
    expect(travelParts(at('x', { milesFromAddress: 0.4, driveMinutes: 5 }))).toEqual(['📍 0.4 mi'])
  })

  it('stacks drive and walk as separate chips so they can wrap', () => {
    expect(travelParts(at('x', { driveMinutes: 5, walkMinutes: 18 }))).toEqual(['🚗 5 min', '🚶 18 min'])
  })

  it('shows nothing at all when there is nothing to show', () => {
    expect(travelParts(at('x'))).toEqual([])
  })

  it('omits the half it does not have', () => {
    expect(travelParts(at('x', { driveMinutes: 5 }))).toEqual(['🚗 5 min'])
    expect(travelParts(at('x', { walkMinutes: 18 }))).toEqual(['🚶 18 min'])
  })
})
