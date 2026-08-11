import { describe, expect, it } from 'vitest'
import { parseStoredLocation } from './useStoredLocation'

const EMPTY = { address: '', coords: null, listingId: null }

describe('parseStoredLocation', () => {
  it('parses a typed-address location', () => {
    const raw = JSON.stringify({ address: '123 Pine St', coords: { lat: 39.9, lng: -75.1 } })
    expect(parseStoredLocation(raw)).toEqual({
      address: '123 Pine St',
      coords: { lat: 39.9, lng: -75.1 },
      listingId: null,
    })
  })

  it('parses a listing anchor, keeping which listing it came from', () => {
    const raw = JSON.stringify({
      address: 'Sheraton Philadelphia Downtown',
      coords: { lat: 39.95, lng: -75.17 },
      listingId: 'listing-abc',
    })
    expect(parseStoredLocation(raw)).toEqual({
      address: 'Sheraton Philadelphia Downtown',
      coords: { lat: 39.95, lng: -75.17 },
      listingId: 'listing-abc',
    })
  })

  it('reads a location saved before listing anchors existed', () => {
    // No listingId key at all — every previously-stored location looks like
    // this, and must keep working rather than being discarded on upgrade.
    const raw = JSON.stringify({ address: 'Current location', coords: { lat: 1, lng: 2 } })
    expect(parseStoredLocation(raw)).toEqual({
      address: 'Current location',
      coords: { lat: 1, lng: 2 },
      listingId: null,
    })
  })

  it('returns an empty location for null (nothing saved yet)', () => {
    expect(parseStoredLocation(null)).toEqual(EMPTY)
  })

  it('returns an empty location for garbage JSON rather than throwing', () => {
    expect(parseStoredLocation('not json')).toEqual(EMPTY)
  })

  it('returns an empty location for valid JSON that is not an object', () => {
    expect(parseStoredLocation(JSON.stringify(['nope']))).toEqual(EMPTY)
    expect(parseStoredLocation(JSON.stringify('nope'))).toEqual(EMPTY)
    expect(parseStoredLocation(JSON.stringify(null))).toEqual(EMPTY)
  })

  it('drops a half-written coord instead of letting NaN reach distance math', () => {
    // A coord missing one half would make every haversine result NaN, which
    // renders as a blank distance on every card rather than an obvious error.
    expect(parseStoredLocation(JSON.stringify({ address: 'x', coords: { lat: 39.9 } })).coords).toBeNull()
    expect(parseStoredLocation(JSON.stringify({ address: 'x', coords: { lng: -75.1 } })).coords).toBeNull()
    expect(
      parseStoredLocation(JSON.stringify({ address: 'x', coords: { lat: '39.9', lng: '-75.1' } })).coords,
    ).toBeNull()
  })

  it('ignores a non-string address or listingId', () => {
    const raw = JSON.stringify({ address: 42, coords: null, listingId: { id: 'x' } })
    expect(parseStoredLocation(raw)).toEqual(EMPTY)
  })
})
