import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import { parseWalkList, walkGroups, walkListFromKey, walkListKey, walkListTargets, walkMinutes } from './walkList'

// A mile due north is 1/69 of a degree of latitude, near enough.
const hotel = { lat: 39.95, lng: -75.16 }
const milesNorth = (miles: number) => ({ lat: hotel.lat + miles / 69.05, lng: hotel.lng })
const shul = (id: string, name: string, miles: number | null) =>
  makeListing({ id, name, geo: miles === null ? undefined : milesNorth(miles) }) as DirectoryResource

describe('parseWalkList', () => {
  it('reads a list it knows, and anything else as none', () => {
    expect(parseWalkList({ categoryId: 'synagogue', maxMinutes: 30 })).toEqual({ categoryId: 'synagogue', maxMinutes: 30 })
    expect(parseWalkList({ categoryId: 'synagogue', maxMinutes: 30, extra: 1 })).toEqual({ categoryId: 'synagogue', maxMinutes: 30 })
    expect(parseWalkList({ categoryId: 'synagogue', maxMinutes: 25 })).toBeNull()
    expect(parseWalkList({ categoryId: 'synagogue', maxMinutes: '30' })).toBeNull()
    expect(parseWalkList({ categoryId: '', maxMinutes: 30 })).toBeNull()
    expect(parseWalkList({ maxMinutes: 30 })).toBeNull()
    expect(parseWalkList(null)).toBeNull()
    expect(parseWalkList('synagogue')).toBeNull()
  })

  it('goes to and from the editor’s one string', () => {
    const w = { categoryId: 'synagogue', maxMinutes: 45 }
    expect(walkListKey(w)).toBe('synagogue:45')
    expect(walkListFromKey(walkListKey(w))).toEqual(w)
    expect(walkListKey(null)).toBe('')
    expect(walkListFromKey('')).toBeNull()
    expect(walkListFromKey('synagogue')).toBeNull()
    expect(walkListFromKey('synagogue:7')).toBeNull()
  })
})

describe('walkListTargets', () => {
  it('offers the other listing categories whose places have an address', () => {
    const cats = [
      makeCategory({ id: 'hotel' }),
      makeCategory({ id: 'synagogue' }),
      makeCategory({ id: 'whatsapp', hasAddress: false }),
      makeCategory({ id: 'zmanim', kind: 'zmanim' }),
    ]
    expect(walkListTargets(cats, { id: 'hotel' }).map((c) => c.id)).toEqual(['synagogue'])
  })
})

describe('walkMinutes', () => {
  it('walks 25 minutes a mile, in a straight line, and never says 0', () => {
    expect(walkMinutes(hotel, milesNorth(1))).toBe(25)
    expect(walkMinutes(hotel, milesNorth(0.4))).toBe(10)
    expect(walkMinutes(hotel, hotel)).toBe(1)
  })
})

describe('walkGroups', () => {
  const places = [
    shul('far', 'Too Far', 1.3), // 33 min
    shul('b', 'Beth', 0.4), // 10 min
    shul('a', 'Adath', 0.4), // 10 min, same as Beth
    shul('edge', 'Edge', 1.2), // 30 min: in
    shul('mid', 'Middle', 0.8), // 20 min: the second group
    shul('nogeo', 'No Address', null),
  ]

  it('splits a list past 20 minutes into under 20 and 20 to its limit, nearest first, name on a tie', () => {
    const groups = walkGroups(hotel, places, 30)
    expect(groups.map((g) => g.label)).toEqual(['Under 20 minutes', '20 to 30 minutes'])
    expect(groups[0].rows.map((r) => [r.item.name, r.minutes])).toEqual([
      ['Adath', 10],
      ['Beth', 10],
    ])
    expect(groups[1].rows.map((r) => [r.item.name, r.minutes])).toEqual([
      ['Middle', 20],
      ['Edge', 30],
    ])
  })

  it('keeps a list of 20 minutes or less as one group', () => {
    const groups = walkGroups(hotel, places, 15)
    expect(groups.map((g) => g.label)).toEqual(['Up to 15 minutes'])
    expect(groups[0].rows.map((r) => r.item.id)).toEqual(['a', 'b'])
  })

  it('leaves out an empty group, and gives none when nothing is near', () => {
    expect(walkGroups(hotel, [shul('mid', 'Middle', 0.8)], 30).map((g) => g.label)).toEqual(['20 to 30 minutes'])
    expect(walkGroups(hotel, [shul('far', 'Too Far', 3)], 30)).toEqual([])
  })
})
