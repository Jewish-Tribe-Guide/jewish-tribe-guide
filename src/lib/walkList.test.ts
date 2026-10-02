import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import { makeCategory as category } from '@/test/providerFixtures'
import { nearestBeyond, parseWalkList, parseWalkLists, walkAnswer, walkDistanceText, walkGroupFields, walkGroups, walkListFromKey, walkListKey, walkListTargets, walkMinutes } from './walkList'
import type { CategoryField } from './categories'

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

  it('keeps how a list is grouped', () => {
    expect(parseWalkList({ categoryId: 'restaurant', maxMinutes: 30, groupBy: 'foodType' })).toEqual({ categoryId: 'restaurant', maxMinutes: 30, groupBy: 'foodType' })
    expect(parseWalkList({ categoryId: 'restaurant', maxMinutes: 30, groupBy: '' })).toEqual({ categoryId: 'restaurant', maxMinutes: 30 })
  })
})

describe('parseWalkLists', () => {
  it('reads several lists, and the one list stored before there could be several', () => {
    expect(parseWalkLists({ categoryId: 'synagogue', maxMinutes: 30 })).toEqual([{ categoryId: 'synagogue', maxMinutes: 30 }])
    expect(
      parseWalkLists([
        { categoryId: 'restaurant', maxMinutes: 30, groupBy: 'foodType' },
        { categoryId: 'synagogue', maxMinutes: 45 },
      ]),
    ).toEqual([
      { categoryId: 'restaurant', maxMinutes: 30, groupBy: 'foodType' },
      { categoryId: 'synagogue', maxMinutes: 45 },
    ])
    expect(parseWalkLists(null)).toEqual([])
    expect(parseWalkLists([])).toEqual([])
  })

  it('leaves out what it doesn’t know, and a second list of the same places', () => {
    expect(
      parseWalkLists([
        { categoryId: 'synagogue', maxMinutes: 30 },
        { categoryId: 'hotel', maxMinutes: 25 },
        'mikvah',
        { categoryId: 'synagogue', maxMinutes: 45 },
      ]),
    ).toEqual([{ categoryId: 'synagogue', maxMinutes: 30 }])
  })

  it('goes to and from the editor’s one string', () => {
    const lists = [{ categoryId: 'synagogue', maxMinutes: 45 }, { categoryId: 'restaurant', maxMinutes: 30, groupBy: 'foodType' }]
    expect(walkListFromKey(walkListKey(lists))).toEqual(lists)
    expect(walkListKey([])).toBe('')
    expect(walkListFromKey('')).toEqual([])
    expect(walkListFromKey('synagogue:30')).toEqual([])
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

// Food, as the guide has it: Store Type in its option order.
const storeType: CategoryField = {
  key: 'foodType',
  label: 'Store Type',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  options: [
    { value: 'Restaurant', label: 'Restaurant' },
    { value: 'Bakery', label: 'Bakery' },
    { value: 'Ice Cream & Treats', label: 'Ice Cream & Treats' },
  ],
}
const shabbatFriendly: CategoryField = { key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', renderAs: 'badge', filterable: true }
const place = (id: string, miles: number, details: Record<string, unknown>) =>
  makeListing({ id, name: id, geo: milesNorth(miles), ...details }) as DirectoryResource

describe('walkGroups by a field', () => {
  const food = [
    place('Pizza', 1.08, { foodType: 'Restaurant' }), // 27 min
    place('Cookies', 0.24, { foodType: 'Bakery' }), // 6 min
    place('Falafel', 1.08, { foodType: 'Restaurant' }), // 27 min
    place('Ice cream', 0.52, { foodType: 'Ice Cream & Treats' }), // 13 min
    place('Unsaid', 0.4, {}), // 10 min
    place('Far', 2, { foodType: 'Restaurant' }), // 50 min: out
  ]

  it('groups by a pick-list in its option order, nearest first in each, then what doesn’t say', () => {
    const groups = walkGroups(hotel, food, 30, storeType)
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.item.name)])).toEqual([
      ['Restaurant', ['Falafel', 'Pizza']],
      ['Bakery', ['Cookies']],
      ['Ice Cream & Treats', ['Ice cream']],
      ['Doesn’t say', ['Unsaid']],
    ])
  })

  it('groups by a yes/no: those it says, then the rest', () => {
    const hotels = [place('Marriott', 0.64, { shabbatFriendly: true }), place('Morris House', 0.16, {})]
    expect(walkGroups(hotel, hotels, 30, shabbatFriendly).map((g) => [g.label, g.rows.map((r) => r.item.name)])).toEqual([
      ['Shabbat friendly', ['Marriott']],
      ['Doesn’t say', ['Morris House']],
    ])
  })

  it('answers with the nearest of the first option, and what’s nearer when something is', () => {
    expect(walkAnswer(walkGroups(hotel, food, 30, storeType), storeType)).toBe('Nearest restaurant: Falafel, 27 min. Nearer: Cookies, a bakery, 6 min.')
    const restaurantsFirst = food.filter((f) => f.foodType === 'Restaurant')
    expect(walkAnswer(walkGroups(hotel, restaurantsFirst, 30, storeType), storeType)).toBe('Nearest restaurant: Falafel, 27 min.')
    // No restaurant within the walk, or no pick-list: no answer.
    expect(walkAnswer(walkGroups(hotel, [food[1]], 30, storeType), storeType)).toBeNull()
    expect(walkAnswer(walkGroups(hotel, food, 30), null)).toBeNull()
  })

  it('offers a category’s yes/no and pick-list badges to group by', () => {
    const c = category({ detailFields: [storeType, shabbatFriendly, { key: 'notes', label: 'Notes', type: 'textarea' }, { key: 'kind', label: 'Kind', type: 'select', renderAs: 'row' }] })
    expect(walkGroupFields(c).map((f) => f.key)).toEqual(['foodType', 'shabbatFriendly'])
  })
})

describe('nearestBeyond', () => {
  it('names the nearest past the walk, in minutes up to an hour and miles after', () => {
    const far = nearestBeyond(hotel, [shul('a', 'A', 0.4), shul('b', 'B', 1.48), shul('c', 'C', 3)], 30)!
    expect(far.item.name).toBe('B')
    expect(walkDistanceText(far)).toBe('37 min')
    expect(walkDistanceText(nearestBeyond(hotel, [shul('c', 'C', 2.5)], 30)!)).toBe('2.5 mi')
    expect(nearestBeyond(hotel, [shul('a', 'A', 0.4)], 30)).toBeNull()
  })
})
