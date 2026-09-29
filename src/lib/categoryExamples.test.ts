import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { categoryExamples } from './categoryExamples'

const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  pluralLabel: 'Food',
  detailFields: [
    { key: 'hours', label: 'Hours', type: 'hours', filterable: true },
    { key: 't', label: 'Food Type', type: 'select', filterable: true, options: [{ value: 'Meat', label: 'Meat' }, { value: 'Dairy', label: 'Dairy' }, { value: 'Parve', label: 'Parve' }] },
  ],
})
const grocery = makeCategory({
  id: 'grocery',
  label: 'Grocery',
  pluralLabel: 'Grocery Stores',
  detailFields: [
    { key: 'm', label: 'Kosher items', type: 'tags' },
    { key: 'hours', label: 'Hours', type: 'hours' },
  ],
})
const hotel = makeCategory({
  id: 'hotel',
  label: 'Hotel',
  pluralLabel: 'Hotels',
  detailFields: [{ key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', filterable: true }],
})
const school = makeCategory({ id: 'school', label: 'School', pluralLabel: 'Schools', detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }] })
const synagogue = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
const all = [food, grocery, hotel, school, synagogue]

describe('categoryExamples', () => {
  it('asks for the two commonest kinds open now where people walk in, then each plain for when nothing is open', () => {
    const items = [
      makeListing({ id: 'a', t: 'Parve' }),
      makeListing({ id: 'b', t: 'Parve' }),
      makeListing({ id: 'c', t: 'Parve' }),
      makeListing({ id: 'd', t: ['Meat'] }),
      makeListing({ id: 'e', t: 'Meat' }),
      makeListing({ id: 'f', t: 'Dairy' }),
      makeListing({ id: 'g', t: 'Dairy' }),
    ]
    expect(categoryExamples(food, items, all).slice(0, 5)).toEqual(['parve open now', 'dairy open now', 'parve', 'dairy', 'meat'])
  })

  it('names the items most stores carry, and skips one only a single store has or nobody would type', () => {
    const items = [
      makeListing({ id: 'a', m: ['Challah', 'Wine', 'Prepared Shabbos food from the deli counter'] }),
      makeListing({ id: 'b', m: ['Challah', 'Milk', 'Prepared Shabbos food from the deli counter'] }),
      makeListing({ id: 'c', m: ['Wine', 'Challah', 'Kugel'] }),
    ]
    expect(categoryExamples(grocery, items, all)).toEqual(['challah', 'wine'])
  })

  it('asks for the yeses of a yes/no the category keeps', () => {
    expect(categoryExamples(hotel, [makeListing({ id: 'a', shabbatFriendly: true })], all)).toEqual(['shabbat friendly'])
    expect(categoryExamples(hotel, [makeListing({ id: 'a' })], all)).toEqual([])
  })

  it('never asks for the next minyan on a shul page: its card already answers that', () => {
    const shul = makeListing({ id: 's', category: 'synagogue', minyanim: [{ tefillah: 'mincha', time: '1:30pm', days: ['sun'] }] })
    const examples = categoryExamples(synagogue, [shul], all)
    expect(examples).toEqual(['shacharis tomorrow', 'Friday night', 'Shabbos morning'])
    expect(examples.some((e) => /next/i.test(e))).toBe(false)
    expect(categoryExamples(synagogue, [makeListing({ id: 't', category: 'synagogue' })], all)).toEqual([])
  })

  it('offers where most of the places are', () => {
    const places = [
      { name: 'Old City', geo: { lat: 39.951, lng: -75.144 }, radius: 0.5 },
      { name: 'Center City', geo: { lat: 39.9524, lng: -75.1636 }, radius: 1.3 },
    ]
    const items = [
      makeListing({ id: 'a', geo: { lat: 39.9505, lng: -75.1445 } }),
      makeListing({ id: 'b', geo: { lat: 39.9515, lng: -75.1435 } }),
      makeListing({ id: 'c', geo: { lat: 39.9524, lng: -75.1636 } }),
    ]
    expect(categoryExamples(school, items, all, places)).toEqual(['in Old City'])
  })

  it('offers nothing where there is nothing to ask', () => {
    expect(categoryExamples(school, [], all)).toEqual([])
  })
})

describe('categoryExamples: which kinds', () => {
  it('uses the pick-list with the fewest kinds: meat, dairy or parve before restaurant, bakery or caterer', () => {
    const cat = makeCategory({
      id: 'restaurant',
      label: 'Food',
      pluralLabel: 'Food',
      detailFields: [
        { key: 'type', label: 'Store Type', type: 'select', filterable: true, options: [] },
        { key: 't', label: 'Food Type', type: 'select', filterable: true, options: [] },
      ],
    })
    const items = [
      makeListing({ id: 'a', type: 'Restaurant', t: 'Meat' }),
      makeListing({ id: 'b', type: 'Bakery', t: 'Meat' }),
      makeListing({ id: 'c', type: 'Catering', t: 'Dairy' }),
      makeListing({ id: 'd', type: 'Restaurant', t: 'Dairy' }),
      makeListing({ id: 'e', type: 'Bakery', t: 'Parve' }),
      makeListing({ id: 'f', type: 'Catering', t: 'Parve' }),
      makeListing({ id: 'g', type: 'Food Truck', t: 'Meat' }),
      makeListing({ id: 'h', type: 'Food Truck', t: 'Dairy' }),
    ]
    expect(categoryExamples(cat, items, [cat])).toEqual(['dairy', 'meat', 'parve'])
  })

  it('never offers "in the Main Line"', () => {
    const places = [{ name: 'the Main Line', geo: { lat: 40.01, lng: -75.28 }, radius: 4 }]
    const items = [makeListing({ id: 'a', geo: { lat: 40.01, lng: -75.28 } }), makeListing({ id: 'b', geo: { lat: 40.011, lng: -75.281 } })]
    expect(categoryExamples(makeCategory({ id: 'school', detailFields: [] }), items, [], places)).toEqual([])
  })
})
