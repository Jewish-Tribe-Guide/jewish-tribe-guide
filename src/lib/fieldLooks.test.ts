import { describe, expect, it } from 'vitest'
import type { CategoryConfig, CategoryField } from './categories'
import { addingScreen, answerText, filterLook, filtersScreen, listingLook, listingScreen, madeUpPlace, madeUpPlaces, rowLook } from './fieldLooks'

const choices = (...values: string[]) => values.map((v) => ({ value: v, label: v }))
const foodType: CategoryField = { key: 'food_type', label: 'Food Type', type: 'select', renderAs: 'badge', filterable: true, onCard: true, options: choices('Meat', 'Dairy', 'Parve') }
const hechsher: CategoryField = { key: 'hechsher', label: 'Hechsher', type: 'select', renderAs: 'badge', filterable: true, onCard: true, options: choices('Keystone-K', 'OU') }
const kind: CategoryField = { key: 'type', label: 'Type', type: 'select', renderAs: 'badge', filterable: true, onCard: true, options: choices('Restaurant', 'Bakery') }
const delivery: CategoryField = { key: 'delivery', label: 'Delivery Details', type: 'textarea' }
const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours', filterable: true }
const food = (fields: CategoryField[]): CategoryConfig => ({ id: 'food', label: 'Restaurant', pluralLabel: 'Food', icon: '', description: '', kind: 'listing', detailFields: fields })

describe('fieldLooks: a field on a made-up place', () => {
  const page = food([foodType, hechsher, kind, delivery, hours])
  const item = madeUpPlace(page, 'A restaurant')

  it('answers every field by its type', () => {
    expect(item.food_type).toBe('Meat')
    expect(answerText(hours, item.hours)).toContain('Mon–Thu 9:00 AM–9:00 PM')
    expect(item.delivery).toBeTruthy()
  })

  it('marks the field’s own part of the row, among its neighbours', () => {
    const row = rowLook(page, foodType, item)
    expect(row.facts.filter((p) => p.mine).map((p) => p.text)).toEqual(['Meat'])
    expect(row.facts.map((p) => p.text)).toEqual(expect.arrayContaining(['Keystone-K', 'Restaurant']))
    expect(row.onRow).toBe(true)
  })

  it('says hours as the row does, on a Wednesday afternoon', () => {
    expect(rowLook(page, hours, item).facts.filter((p) => p.mine).map((p) => p.text)).toEqual(['Open until 9 PM'])
  })

  it('knows a field off the row, and the line that would take it', () => {
    expect(rowLook(page, delivery, item)).toMatchObject({ onRow: false, canGoOn: 'third' })
    const off = { ...foodType, onCard: false }
    expect(rowLook(food([off, hechsher]), off, item)).toMatchObject({ onRow: false, canGoOn: 'second' })
    expect(rowLook(food([off]), off, item).facts.some((p) => p.mine)).toBe(false)
    expect(rowLook(page, { ...hours, key: 'hours' }, item).canGoOn).toBeNull()
  })

  it('puts it where the listing does: the kind line, the facts, or a box', () => {
    expect(listingLook(page, kind, item)).toEqual({ at: 'kind', parts: [{ text: 'Restaurant', mine: true }] })
    const facts = listingLook(page, foodType, item)
    expect(facts.at).toBe('facts')
    expect(facts.at === 'facts' && facts.parts).toEqual([
      { text: 'Meat', mine: true },
      { text: 'Keystone-K', mine: false },
    ])
    expect(listingLook(page, delivery, item)).toMatchObject({ at: 'box', title: 'About', label: null })
    // Delivery's group is its part: in whatever box Delivery is (Nov 10).
    const group: CategoryField = { key: 'group', label: 'Delivery WhatsApp Group', type: 'url', linkLabel: 'Join WhatsApp Group', leadBox: { title: 'Delivery', text: 'delivery' } }
    const withGroup = food([foodType, group, delivery, hours])
    expect(listingLook(withGroup, delivery, madeUpPlace(withGroup, 'A place'))).toMatchObject({ at: 'box', title: 'About' })
    expect(listingLook(withGroup, group, madeUpPlace(withGroup, 'A place'))).toMatchObject({ at: 'box', title: 'About', text: 'Join WhatsApp Group' })
    const boxed = { ...withGroup, listingParts: { boxes: [{ title: 'Delivery', fields: ['delivery'] }] } }
    expect(listingLook(boxed, group, madeUpPlace(boxed, 'A place'))).toMatchObject({ at: 'box', title: 'Delivery' })
    expect(listingLook(page, hours, item)).toMatchObject({ at: 'box', title: 'Contact', label: 'Hours' })
    expect(listingLook(page, { ...delivery, renderAs: 'hidden' }, item)).toEqual({ at: 'none' })
  })

  it('is in Filters only while it’s in the filter', () => {
    expect(filterLook(page, foodType)).toEqual({ kind: 'chips', legend: 'Food Type', values: [{ text: 'Meat' }, { text: 'Dairy' }, { text: 'Parve' }] })
    expect(filterLook(page, { ...foodType, filterable: false })).toBeNull()
    expect(filterLook(page, hours)).toEqual({ kind: 'switch', label: 'Open now' })
    expect(filterLook(page, delivery)).toBeNull()
  })

  it('makes three places, the field answered differently on each, named for their kinds', () => {
    const places = madeUpPlaces(page, 'A place', ['Rittenhouse', 'Center City'])
    expect(places.map((p) => p.item.food_type)).toEqual(['Meat', 'Dairy', 'Parve'])
    // "A place" says nothing a kind doesn't: the first is named for its kind.
    expect(places.map((p) => p.item.name)).toEqual(['A restaurant', 'A bakery', 'A third place'])
    expect(places.map((p) => p.where)).toEqual(['Rittenhouse', 'Center City', null])
    expect(places.map((p) => rowLook(page, hours, p.item).facts.find((f) => f.mine)?.text)).toEqual(['Open until 9 PM', 'Open until 8 PM', 'Open until 6 PM'])
    // No address, so no Directions; a phone, so Call.
    expect(places[0].item.address).toBe('')
    expect(places[0].item.phone).toBeTruthy()
  })

  it('names a place by its kind only when the kind is one place’s noun', () => {
    const kinds = { ...kind, options: choices('Eatery', 'Scheduled Deliveries', 'Ice cream & treats') }
    expect(madeUpPlaces(food([kinds]), 'A place').map((p) => p.item.name)).toEqual(['An eatery', 'Another place', 'A third place'])
    const denomination = { ...kind, label: 'Denomination', options: choices('Orthodox', 'Conservative') }
    expect(madeUpPlaces(food([denomination]), 'A place').map((p) => p.item.name)).toEqual(['A place', 'Another place', 'A third place'])
  })

  // Delivery Details is asked once Store Type is Scheduled Deliveries; a
  // place that isn't one doesn't have it.
  it('gives the answer the field is asked after, and leaves out what wouldn’t be asked', () => {
    const asked = { field: 'type', equals: 'Bakery' }
    const groupLink: CategoryField = { key: 'group', label: 'Group', type: 'url', showIf: { field: 'type', equals: 'Bakery' } }
    const withGroup = food([kind, groupLink, delivery])
    expect(madeUpPlaces(withGroup, 'A place')[0].item.group).toBeUndefined()
    const given = madeUpPlaces(withGroup, 'A place', [], asked)[0].item
    expect(given.type).toBe('Bakery')
    expect(given.group).toBe('https://example.com')
  })

  it('draws the opened listing: kind, facts with open now first, the buttons, the boxes', () => {
    const screen = listingScreen(page, foodType, item)
    expect(screen.kind).toEqual([{ text: 'Restaurant', mine: false }])
    expect(screen.facts).toEqual([
      { text: 'Open until 9 PM', mine: false, tone: 'open' },
      { text: 'Meat', mine: true },
      { text: 'Keystone-K', mine: false },
    ])
    expect(screen.actions.map((a) => a.label)).toEqual(['Call', 'Share'])
    expect(screen.boxes.find((b) => b.mine)).toBeUndefined()
    const about = listingScreen(page, delivery, item).boxes.find((b) => b.mine)
    expect(about).toMatchObject({ title: 'About', lines: [expect.stringContaining('Orders by Wednesday')] })
  })

  it('has no What isn’t kosher box: its question is the hechsher’s, in the hechsher’s box', () => {
    const flag: CategoryField = { key: 'all_kosher', label: 'Everything here is kosher', type: 'boolean' }
    const note: CategoryField = { key: 'not_kosher', label: 'What isn’t kosher?', type: 'textarea' }
    const cert: CategoryField = { ...hechsher, caveat: { flagField: 'all_kosher', noteField: 'not_kosher' } }
    const kosher = food([foodType, cert, flag, note])
    const place = madeUpPlace(kosher, 'A place')
    expect(listingScreen(kosher, foodType, place).boxes.map((b) => b.title)).not.toContain('What isn’t kosher')
    expect(listingScreen(kosher, note, place).boxes.find((b) => b.mine)?.title).toBe('Contact')
  })

  it('puts Open now first in Filters, then the page’s filters in order', () => {
    expect(filtersScreen(page, foodType).map((f) => [f.key, f.mine])).toEqual([
      ['hours', false],
      ['food_type', true],
      ['hechsher', false],
      ['type', false],
    ])
  })

  it('opens the field’s row when adding, after the name and the row before it', () => {
    const adding = addingScreen(page, foodType, item)
    expect(adding.before.map((r) => r.title)).toEqual(['Name', 'Type'])
    expect(adding.fields.map((f) => f.key)).toContain('food_type')
    expect(addingScreen(page, hours, item).big).toBe(true)
  })
})
