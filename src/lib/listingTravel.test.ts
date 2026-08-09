import { describe, expect, it } from 'vitest'
import { travelCompare, travelParts } from './listingTravel'
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
