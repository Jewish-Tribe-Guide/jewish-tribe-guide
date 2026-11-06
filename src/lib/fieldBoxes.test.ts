import { describe, expect, it } from 'vitest'
import type { CategoryField } from './categories'
import { addBox, addToBox, boxLine, fieldBoxes, fieldItems, fieldLine, homeOf, itemKey, orderProblem, readOrder, removeBox, renameKey, type FieldItem, type FieldPage } from './fieldBoxes'
import type { ListingParts } from './listingParts'
import { moveItem } from './reorder'

// The pages as dev holds them (Nov 5).
const contacts = (key: string, label: string): CategoryField => ({ key, label, type: 'contacts' })
const hospital: FieldPage = {
  hasAddress: true,
  hasPhone: true,
  fields: [
    { key: 'hours', label: 'Hours', type: 'hours', filterable: true },
    { key: 'w', label: 'Website', type: 'url' },
    { key: 'photo', label: 'Photo', type: 'image' },
    { key: 'r', label: 'Refuah Link', type: 'url' },
    contacts('liaisons', 'Liaisons'),
    contacts('pantry', 'Pantry'),
    contacts('food_packages', 'Food packages'),
    contacts('accommodations', 'Accommodations'),
    contacts('transportation', 'Transportation'),
    contacts('miscellaneous', 'Miscellaneous'),
    { key: 'eruv', label: 'Eruv', type: 'select', options: [{ value: 'a', label: 'A' }] },
    { key: 'sukkah', label: 'Sukkah', type: 'textarea' },
  ],
}
const hospitalParts: ListingParts = {
  boxes: [
    { title: 'Who to call', fields: ['liaisons'] },
    { title: 'Kosher food', fields: ['pantry', 'food_packages'] },
    { title: 'A place to stay', fields: ['accommodations'] },
    { title: 'Rides', fields: ['transportation'] },
    { title: 'Also', fields: ['miscellaneous'] },
  ],
  shabbos: { after: 3, fields: ['eruv', 'sukkah'] },
}
const food: FieldPage = {
  hasAddress: true,
  hasPhone: true,
  fields: [
    { key: 'hours', label: 'Hours', type: 'hours', filterable: true },
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'photo', label: 'Photo', type: 'image' },
    { key: 'googleDescription', label: 'Description', type: 'textarea' },
    { key: 's', label: 'Short Description', type: 'text', showInHeader: true },
    { key: 't', label: 'Food Type', type: 'select', renderAs: 'badge', filterable: true },
    { key: 'kosherCert', label: 'Kosher Certification', type: 'select', renderAs: 'badge', filterable: true, caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' } },
    { key: 'foodType', label: 'Store Type', type: 'select', renderAs: 'badge', filterable: true },
    { key: 'k', label: 'Kosher Certification URL', type: 'url', linkLabel: 'Certification' },
    { key: 'delivery_whatsapp_group', label: 'Delivery WhatsApp Group', type: 'url', linkLabel: 'Join WhatsApp Group', leadBox: { title: 'Delivery', text: 'delivery_details' } },
    { key: 'delivery_details', label: 'Delivery Details', type: 'textarea' },
    { key: 'dishes', label: 'Main dishes', type: 'tags', renderAs: 'badge', showCountInHeader: true },
  ],
  hiddenFields: [
    { key: 'kosherPartial', label: 'Everything here is kosher', type: 'boolean', renderAs: 'hidden' },
    { key: 'kosherNote', label: 'What isn’t kosher?', type: 'textarea', renderAs: 'hidden' },
  ],
}
const shuls: FieldPage = {
  hasAddress: true,
  hasPhone: true,
  fields: [
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'photo', label: 'Photo', type: 'image' },
    { key: 'denomination', label: 'Denomination', type: 'select', renderAs: 'badge', filterable: true },
    { key: 'minyanim', label: 'Davening Times (Minyanim)', type: 'minyanim' },
  ],
}

const lines = (page: FieldPage, parts: ListingParts) => fieldBoxes(page, parts).map((b) => [b.title, boxLine(b, page)])

describe('fieldBoxes', () => {
  it('gives a hospital its boxes in the listing’s order, the Shabbos card after three (board 17)', () => {
    expect(lines(hospital, hospitalParts)).toEqual([
      ['Top', 'Photo'],
      ['Who to call', 'Liaisons'],
      ['Kosher food', 'Pantry, Food packages'],
      ['A place to stay', 'Accommodations'],
      ['This Shabbos', 'Eruv, Sukkah'],
      ['Rides', 'Transportation'],
      ['Also', 'Miscellaneous'],
      ['Contact', 'Address, Phone, Hours, Website, Refuah Link'],
    ])
  })

  it('gives Food its link’s own box, what isn’t kosher and its dishes (board 4)', () => {
    expect(lines(food, {})).toEqual([
      ['Top', 'Photo, Short Description, Food Type, Kosher Certification, Store Type, Kosher Certification URL'],
      ['Delivery', 'Delivery WhatsApp Group, Delivery Details'],
      ['What isn’t kosher', 'Everything here is kosher, What isn’t kosher?'],
      ['Main dishes', 'Main dishes'],
      ['Contact', 'Address, Phone, Hours, Website'],
      ['About', 'Description'],
    ])
  })

  it('gives a shul its davening times (board 6)', () => {
    expect(lines(shuls, {})).toEqual([
      ['Top', 'Photo, Denomination'],
      ['Davening times', 'Davening Times (Minyanim)'],
      ['Contact', 'Address, Phone, Website'],
    ])
  })

  it('makes a list of contacts in no box a box of its own, after the admin’s', () => {
    const boxes = fieldBoxes(hospital, { boxes: [{ title: 'Who to call', fields: ['liaisons'] }] })
    expect(boxes.slice(1, 4).map((b) => [b.id, b.title, b.kind])).toEqual([
      ['box:0', 'Who to call', 'admin'],
      ['contacts:pantry', 'Pantry', 'listing'],
      ['contacts:food_packages', 'Food packages', 'listing'],
    ])
  })

  it('leaves a field the admin can’t put in a card where it goes, and counts no empty box before the Shabbos card', () => {
    const boxes = fieldBoxes(hospital, { boxes: [{ title: 'New box', fields: [] }, { title: 'Odd', fields: ['hours', 'liaisons'] }], shabbos: { after: 1, fields: ['eruv'] } })
    expect(boxes.map((b) => b.id).slice(0, 4)).toEqual(['top', 'box:0', 'box:1', 'shabbos'])
    expect(boxes.find((b) => b.id === 'box:1')!.fields).toEqual(['liaisons'])
    expect(boxes.find((b) => b.id === 'contact')!.fields).toContain('hours')
  })

  it('says what a field is, where its name doesn’t', () => {
    expect(fieldLine(food.fields[5])).toBe('Filter')
    expect(fieldLine(food.fields[8])).toBe('Button: Certification')
    expect(fieldLine(hospital.fields[4])).toBe('A list of contacts')
    expect(fieldLine(food.fields[2])).toBeUndefined()
  })

  it('finds each field’s home', () => {
    expect(homeOf(food.hiddenFields![0], food)).toBe('caveat')
    expect(homeOf(food.fields[10], food)).toBe('lead:delivery_whatsapp_group')
    expect(homeOf({ key: 'h', label: 'Women’s Hours', type: 'hours', audienceKey: 'w' }, food)).toBe('audience:w')
  })
})

/** The list with the row `key` dropped at `to`, as DragList hands it back. */
function drop(items: FieldItem[], key: string, to: number): FieldItem[] {
  return moveItem(items, items.findIndex((i) => itemKey(i) === key), to)
}
const keys = (items: FieldItem[]) => items.map(itemKey)

describe('dragging', () => {
  const boxes = fieldBoxes(hospital, hospitalParts)

  it('moves a field onto another box’s row (board 18)', () => {
    const items = fieldItems(boxes, 'box:1')
    expect(keys(items).slice(0, 7)).toEqual(['box:top', 'box:box:0', 'box:box:1', 'field:pantry', 'field:food_packages', 'end', 'box:box:2'])
    // Food packages, just under A place to stay's row.
    const next = drop(items, 'field:food_packages', 6)
    expect(orderProblem(items, next, hospital)).toBeNull()
    const { parts } = readOrder(items, next, hospitalParts, hospital)
    expect(parts.boxes!.map((b) => b.fields)).toEqual([['liaisons'], ['pantry'], ['accommodations', 'food_packages'], ['transportation'], ['miscellaneous']])
  })

  it('reorders the fields in an opened box', () => {
    const items = fieldItems(boxes, 'box:1')
    const next = drop(items, 'field:food_packages', 3)
    expect(orderProblem(items, next, hospital)).toBeNull()
    expect(readOrder(items, next, hospitalParts, hospital).parts.boxes![1].fields).toEqual(['food_packages', 'pantry'])
  })

  it('turns a field down where it can’t go, saying so', () => {
    const items = fieldItems(boxes, 'box:1')
    // Pantry under Contact's row.
    const next = drop(items, 'field:pantry', items.findIndex((i) => itemKey(i) === 'box:contact'))
    expect(orderProblem(items, next, hospital)).toEqual({ at: 'contact', why: 'Pantry can’t go in Contact' })
    // Hours, from Contact, into a box.
    const open = fieldItems(boxes, 'contact')
    const hours = drop(open, 'field:hours', 2)
    expect(orderProblem(open, hours, hospital)).toEqual({ at: 'box:0', why: 'Hours can’t go in Who to call' })
  })

  it('keeps the address, phone and the end of the opened box under it', () => {
    const items = fieldItems(boxes, 'contact')
    expect(orderProblem(items, drop(items, 'basic:phone', 1), hospital)).toEqual({})
    const at = items.findIndex((i) => 'end' in i)
    expect(orderProblem(items, drop(items, 'field:w', at), hospital)).toEqual({})
  })

  it('moves the admin’s boxes among each other, the Shabbos card counted where it lands', () => {
    const items = fieldItems(boxes, null)
    expect(keys(items)).toEqual(['box:top', 'box:box:0', 'box:box:1', 'box:box:2', 'box:shabbos', 'box:box:3', 'box:box:4', 'box:contact'])
    // Rides above Who to call.
    const rides = drop(items, 'box:box:3', 1)
    expect(orderProblem(items, rides, hospital)).toBeNull()
    const read = readOrder(items, rides, hospitalParts, hospital).parts
    expect(read.boxes!.map((b) => b.title)).toEqual(['Rides', 'Who to call', 'Kosher food', 'A place to stay', 'Also'])
    expect(read.shabbos!.after).toBe(4)
    // The Shabbos card first.
    const shabbos = drop(items, 'box:shabbos', 1)
    expect(readOrder(items, shabbos, hospitalParts, hospital).parts.shabbos!.after).toBe(0)
    // Not above Top, not below Contact, and Top never moves.
    expect(orderProblem(items, drop(items, 'box:box:0', 0), hospital)).toEqual({})
    expect(orderProblem(items, drop(items, 'box:box:0', 7), hospital)).toEqual({})
    expect(orderProblem(items, drop(items, 'box:contact', 2), hospital)).toEqual({})
  })

  it('doesn’t let a box move between an opened box and its fields', () => {
    const items = fieldItems(boxes, 'box:1')
    expect(orderProblem(items, drop(items, 'box:box:0', 3), hospital)).toEqual({})
  })

  it('reorders a box of the listing’s own among the page’s fields', () => {
    const items = fieldItems(fieldBoxes(food, {}), 'top')
    const at = items.findIndex((i) => itemKey(i) === 'field:photo')
    const next = drop(items, 'field:foodType', at)
    expect(orderProblem(items, next, food)).toBeNull()
    const { order } = readOrder(items, next, {}, food)
    // Store Type takes Photo's place; the rest of Top moves along a slot.
    expect(order).toEqual(['hours', 'website', 'foodType', 'googleDescription', 'photo', 's', 't', 'kosherCert', 'k', 'delivery_whatsapp_group', 'delivery_details', 'dishes'])
  })

  it('puts a field back where it goes when it’s dropped there', () => {
    const parts = { boxes: [{ title: 'Note', fields: ['s'] }] }
    const items = fieldItems(fieldBoxes(food, parts), 'box:0')
    expect(keys(items).slice(0, 4)).toEqual(['box:top', 'box:lead:delivery_whatsapp_group', 'box:caveat', 'box:items'])
    // Short Description, back under Top's row.
    const next = drop(items, 'field:s', 1)
    expect(orderProblem(items, next, food)).toBeNull()
    expect(readOrder(items, next, parts, food).parts.boxes![0].fields).toEqual([])
  })
})

describe('the admin’s boxes', () => {
  it('adds a box after the others, keeping the Shabbos card where it was', () => {
    const { parts, id } = addBox(hospitalParts)
    expect(id).toBe('box:5')
    expect(fieldBoxes(hospital, parts).map((b) => b.title).slice(-3)).toEqual(['Also', 'New box', 'Contact'])
    expect(parts.shabbos!.after).toBe(3)
  })

  it('takes a box off, its fields going back where they go, the Shabbos card after the same boxes', () => {
    const parts = removeBox(hospitalParts, 'box:0')
    expect(parts.shabbos!.after).toBe(2)
    expect(fieldBoxes(hospital, parts).map((b) => b.title)).toEqual(['Top', 'Kosher food', 'A place to stay', 'This Shabbos', 'Rides', 'Also', 'Liaisons', 'Contact'])
    expect(removeBox(hospitalParts, 'box:4').shabbos!.after).toBe(3)
  })

  it('adds a field to a box, and follows a field’s key when its name changes', () => {
    expect(addToBox(hospitalParts, 'box:3', 'r').boxes![3].fields).toEqual(['transportation', 'r'])
    expect(renameKey(hospitalParts, 'eruv', 'eruvs').shabbos!.fields).toEqual(['eruvs', 'sukkah'])
  })
})
