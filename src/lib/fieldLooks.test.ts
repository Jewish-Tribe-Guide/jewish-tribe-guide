import { describe, expect, it } from 'vitest'
import type { CategoryConfig, CategoryField } from './categories'
import { addingScreen, answerText, filterLook, filtersScreen, listingLook, listingScreen, madeUpPlace, madeUpPlaces, rowLook, withRealPlaces } from './fieldLooks'

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
    // Delivery's group is its part: Delivery's own box, as the listing
    // draws it, or whatever admin box Delivery is put in (Nov 10).
    const group: CategoryField = { key: 'group', label: 'Delivery WhatsApp Group', type: 'url', linkLabel: 'Join WhatsApp Group', leadBox: { title: 'Delivery', text: 'delivery' } }
    const withGroup = food([foodType, group, delivery, hours])
    expect(listingLook(withGroup, delivery, madeUpPlace(withGroup, 'A place'))).toMatchObject({ at: 'box', title: 'Delivery' })
    expect(listingLook(withGroup, group, madeUpPlace(withGroup, 'A place'))).toMatchObject({ at: 'box', title: 'Delivery', text: 'Join WhatsApp Group' })
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

  // The listing as it was before round 3 (the user, Nov 10): What isn't
  // kosher shows only at a place where something isn't.
  it('draws What isn’t kosher only where something isn’t, and the note in it', () => {
    const flag: CategoryField = { key: 'all_kosher', label: 'Everything here is kosher', type: 'boolean' }
    const note: CategoryField = { key: 'not_kosher', label: 'What isn’t kosher?', type: 'textarea' }
    const cert: CategoryField = { ...hechsher, caveat: { flagField: 'all_kosher', noteField: 'not_kosher' } }
    const kosher = food([foodType, cert, flag, note])
    const place = madeUpPlace(kosher, 'A place')
    expect(listingScreen(kosher, foodType, place).boxes.map((b) => b.title)).not.toContain('What isn’t kosher')
    expect(listingScreen(kosher, note, place).boxes.find((b) => b.mine)?.title).toBe('What isn’t kosher')
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

  // The user, Nov 10: the Adding tab should show a field as the add form
  // really does. Hours are a section of their own after the contact, and
  // that row says the address and phone, as the form's own row does.
  it('shows hours as their own section after the contact, which says the address and phone', () => {
    const at = { ...item, address: '133 S 18th St, Philadelphia, PA', phone: '(267) 606-6612' }
    const adding = addingScreen(page, hours, at)
    expect(adding.title).toBe('Hours')
    const contact = adding.before.at(-1)!
    expect(contact.title).toMatch(/^Address(,| and) phone/)
    expect(contact.text).toBe('133 S 18th St · (267) 606-6612')
    expect(adding.after).toEqual([])
  })

  it('shows davening as the form asks it: usual weekday times open, usual Shabbos times under it', () => {
    const minyanim: CategoryField = { key: 'minyanim', label: 'Davening Times', type: 'minyanim' }
    const shul = { ...page, detailFields: [...page.detailFields, minyanim] }
    const adding = addingScreen(shul, minyanim, item)
    expect(adding.title).toBe('Usual weekday times')
    expect(adding.after.map((r) => r.title)).toEqual(['Usual Shabbos times'])
  })
})

// The user, Nov 10: "it's not previewing with the fields we actually have".
describe('fieldLooks: the page’s own places', () => {
  const page = food([foodType, hechsher, delivery])
  const made = madeUpPlaces(page, 'A restaurant')
  const real = (id: string, more: Record<string, unknown>) => ({ id, category: 'food', name: id, anchorId: 'all', distance: 1, address: '', ...more })

  it('draws on those that answer the field first, then the fullest', () => {
    const { places, answered } = withRealPlaces(page, delivery, [real('Bare', {}), real('Full', { food_type: 'Meat', hechsher: 'OU' }), real('Delivers', { delivery: 'Sundays' })], made)
    expect(places.map((p) => p.item.name)).toEqual(['Delivers', 'Full', 'Bare'])
    expect(places[0].item.delivery).toBe('Sundays')
    expect(answered).toBe(true)
  })

  it('gives a place the made-up answer where none answers it, and says so', () => {
    const { places, answered } = withRealPlaces(page, delivery, [real('Full', { food_type: 'Meat' })], made)
    expect(places[0].item.name).toBe('Full')
    expect(places[0].item.delivery).toBe(made[0].item.delivery)
    expect(places[0].item.food_type).toBe('Meat')
    expect(answered).toBe(false)
    // Made-up places fill in the list's other rows.
    expect(places.slice(1).map((p) => p.item.id)).toEqual(['made-up-1', 'made-up-2'])
  })

  it('is the made-up places with none of the page’s own', () => {
    expect(withRealPlaces(page, delivery, [], made)).toEqual({ places: made, answered: null })
  })
})
