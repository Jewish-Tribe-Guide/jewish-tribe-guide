import { describe, expect, it } from 'vitest'
import type { DirectoryResource } from '@/types'
import { findPlace, neighborhoodsFor, townsFrom, type Place } from './places'

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
