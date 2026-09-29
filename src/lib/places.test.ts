import { describe, expect, it } from 'vitest'
import type { DirectoryResource } from '@/types'
import { findPlace, neighborhoodsFor, placeName, townsFrom, type Place } from './places'
import { makeListing } from '@/test/providerFixtures'

function at(name: string, address: string, lat: number, lng: number): DirectoryResource {
  return { id: name, category: 'grocery', name, anchorId: 'community', distance: 0, address, geo: { lat, lng } }
}

describe('townsFrom — the towns the listings name', () => {
  const listings = [
    at('A', '1 Main St, Cherry Hill Township, NJ 08034, USA', 39.93, -75.02),
    at('B', '2 Main St, Cherry Hill Township, NJ 08034, USA', 39.91, -75.0),
    at('C', '3 Montgomery Ave, Bala Cynwyd, PA 19004, USA', 40.0, -75.23),
    at('No town', 'Somewhere', 40, -75),
  ]

  it('places each town at the middle of its own listings', () => {
    const cherry = townsFrom(listings).find((t) => t.name === 'Cherry Hill')!
    expect(cherry.geo.lat).toBeCloseTo(39.92)
    expect(cherry.geo.lng).toBeCloseTo(-75.01)
  })

  it('calls "Cherry Hill Township" what people call it, keeping the full name too', () => {
    const cherry = townsFrom(listings).find((t) => t.name === 'Cherry Hill')!
    expect(cherry.aliases).toEqual(['Cherry Hill Township'])
    expect(townsFrom(listings).find((t) => t.name === 'Bala Cynwyd')?.aliases).toBeUndefined()
  })

  it('reaches at least as far as its own listings, and never less than a mile and a half', () => {
    const spread = [
      at('A', '1 Main St, Cherry Hill Township, NJ 08034, USA', 39.95, -75.04),
      at('B', '2 Main St, Cherry Hill Township, NJ 08034, USA', 39.89, -74.98),
    ]
    // Each is about 2.6 miles from the middle, so the town reaches past them.
    expect(townsFrom(spread)[0].radius).toBeGreaterThan(2.6)
    expect(townsFrom(listings).find((t) => t.name === 'Bala Cynwyd')!.radius).toBe(1.5)
  })

  it('skips an address with no town in it', () => {
    expect(townsFrom(listings).map((t) => t.name).sort()).toEqual(['Bala Cynwyd', 'Cherry Hill'])
  })
})

describe('findPlace', () => {
  const places: Place[] = [
    { name: 'Center City', geo: { lat: 39.95, lng: -75.16 }, radius: 1 },
    { name: 'City Line', geo: { lat: 39.99, lng: -75.23 }, radius: 1 },
    { name: 'South Philadelphia', aliases: ['South Philly'], geo: { lat: 39.92, lng: -75.17 }, radius: 2 },
    { name: 'Northeast Philadelphia', aliases: ['the Northeast'], geo: { lat: 40.07, lng: -75.05 }, radius: 4 },
  ]

  it('finds a place by its name or what people call it', () => {
    expect(findPlace('shul near center city', places)?.place.name).toBe('Center City')
    expect(findPlace('kosher food in south philly', places)?.place.name).toBe('South Philadelphia')
    expect(findPlace('shul in the northeast', places)?.place.name).toBe('Northeast Philadelphia')
  })

  it('reads "in" as inside it, anything else as near it', () => {
    expect(findPlace('pizza in center city', places)?.inside).toBe(true)
    expect(findPlace('pizza near center city', places)?.inside).toBe(false)
    expect(findPlace('center city pizza', places)?.inside).toBe(false)
  })

  it('knows a place said with "in" or "near" is surely a place', () => {
    expect(findPlace('pizza in center city', places)?.introduced).toBe(true)
    expect(findPlace('center city pizza', places)?.introduced).toBe(false)
  })

  it('says which of the question’s words it used', () => {
    expect(findPlace('pizza in center city', places)?.used).toEqual(['center', 'city'])
  })

  it('needs every word of the name, together', () => {
    expect(findPlace('city of brotherly love', places)).toBeNull()
    expect(findPlace('center of the city', places)).toBeNull()
  })

  it('knows no neighborhoods for a community without a list', () => {
    expect(neighborhoodsFor('nowhere')).toEqual([])
    expect(neighborhoodsFor(null)).toEqual([])
    expect(neighborhoodsFor('philly').some((p) => p.name === 'Center City')).toBe(true)
  })
})

describe('placeName: where a row says a place is', () => {
  const hoods = [
    { name: 'Rittenhouse', geo: { lat: 39.9496, lng: -75.1718 }, radius: 0.6 },
    { name: 'Northeast Philadelphia', geo: { lat: 40.07, lng: -75.05 }, radius: 4 },
    { name: 'the Main Line', geo: { lat: 40.01, lng: -75.28 }, radius: 4 },
  ]
  const listing = (id: string, address: string, geo: { lat: number; lng: number }) => makeListing({ id, address, geo })
  const listings = [
    listing('a', '1 Walnut St, Philadelphia, PA 19103, USA', { lat: 39.9497, lng: -75.172 }),
    listing('b', '9 Bustleton Ave, Philadelphia, PA 19115, USA', { lat: 40.08, lng: -75.04 }),
    listing('c', '2 Old Lancaster Rd, Merion Station, PA 19066, USA', { lat: 40.0, lng: -75.25 }),
    listing('d', '5 Haddonfield Rd, Cherry Hill Township, NJ 08002, USA', { lat: 39.93, lng: -75.01 }),
    listing('e', '1 Spring Garden St, Philadelphia, PA 19130, USA', { lat: 39.9, lng: -75.3 }),
  ]
  const towns = townsFrom(listings)
  const name = (id: string) => placeName(listings.find((l) => l.id === id)!, hoods, towns)

  it('says the tightest fit: a neighbourhood inside a city, the town outside it', () => {
    expect(name('a')).toBe('Rittenhouse')
    expect(name('b')).toBe('Northeast Philadelphia')
    // Inside "the Main Line" too, but the town says it more closely.
    expect(name('c')).toBe('Merion Station')
    expect(name('d')).toBe('Cherry Hill')
  })

  it('falls back to the town when no neighbourhood holds it', () => {
    expect(name('e')).toBe('Philadelphia')
  })
})
