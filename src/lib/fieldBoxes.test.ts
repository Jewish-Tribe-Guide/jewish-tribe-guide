import { describe, expect, it } from 'vitest'
import type { CategoryField } from './categories'
import { addBox, addToBox, basicsLandIn, boxLine, boxName, boxRenames, fieldBoxes, fieldItems, fieldLine, homeOf, itemKey, orderProblem, readOrder, removeBox, renameKey, renameListingBox, whereAdded, type FieldItem, type FieldPage } from './fieldBoxes'
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

// Board 4: Delivery, What isn't kosher and Main dishes have handles, and
// the listing follows their order.
describe('the listing’s own boxes', () => {
  const foodBoxes = fieldBoxes(food, {})

  it('move among each other, and the order is kept', () => {
    const items = fieldItems(foodBoxes, null)
    expect(keys(items)).toEqual(['box:top', 'box:lead:delivery_whatsapp_group', 'box:caveat', 'box:items', 'box:contact', 'box:about'])
    expect(foodBoxes.filter((b) => b.moves).map((b) => b.title)).toEqual(['Delivery', 'What isn’t kosher', 'Main dishes'])
    // Main dishes first.
    const next = drop(items, 'box:items', 1)
    expect(orderProblem(items, next, food)).toBeNull()
    const { parts } = readOrder(items, next, {}, food)
    expect(parts.lead).toEqual(['main', 'link', 'caveat'])
    expect(fieldBoxes(food, parts).map((b) => b.title).slice(0, 4)).toEqual(['Top', 'Main dishes', 'Delivery', 'What isn’t kosher'])
    // Back as it was: nothing saved.
    const moved = fieldItems(fieldBoxes(food, parts), null)
    expect(readOrder(moved, drop(moved, 'box:items', 3), parts, food).parts.lead).toBeUndefined()
  })

  it('stay above the admin’s boxes and below Top, and a mikvah’s sections move together', () => {
    const items = fieldItems(fieldBoxes(food, { boxes: [{ title: 'Also', fields: ['short_description'] }] }), null)
    expect(orderProblem(items, drop(items, 'box:lead:delivery_whatsapp_group', 4), food)).toEqual({})
    expect(orderProblem(items, drop(items, 'box:items', 0), food)).toEqual({})
    const mikvah: FieldPage = {
      fields: [
        { key: 'join', label: 'Join', type: 'url', leadBox: { title: 'Book' } },
        { key: 'women', label: 'Women’s Hours', type: 'hours', audienceKey: 'women' },
        { key: 'men', label: 'Men’s Hours', type: 'hours', audienceKey: 'men' },
      ],
      hasAddress: true,
      hasPhone: false,
    }
    const m = fieldItems(fieldBoxes(mikvah, {}), null)
    expect(keys(m).slice(0, 4)).toEqual(['box:top', 'box:lead:join', 'box:audience:women', 'box:audience:men'])
    expect(orderProblem(m, drop(m, 'box:lead:join', 2), mikvah)).toEqual({})
    expect(orderProblem(m, drop(m, 'box:lead:join', 3), mikvah)).toBeNull()
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

// The user, Nov 5: "even ones that could be moved like Delivery". A box the
// listing makes itself is renamed where its name comes from.
describe('renaming the listing’s own boxes', () => {
  // The user, Nov 7: a ready-made field's box keeps its name ("lock the
  // name"); only a field made here, or the admin's own box, is renamed.
  it('renames a box made here, never a ready-made field’s, nor one every listing has', () => {
    const named = (page: FieldPage, parts: ListingParts = {}) => fieldBoxes(page, parts).filter((b) => boxRenames(b, page)).map((b) => b.title)
    const madeHere = (page: FieldPage): FieldPage => ({ ...page, fields: page.fields.map((f) => ({ ...f, madeHere: true })) })
    expect(named(food)).toEqual([])
    expect(named(madeHere(food))).toEqual(['Delivery', 'What isn’t kosher', 'Main dishes'])
    expect(named(shuls, { shabbos: { fields: ['denomination'] } })).toEqual([])
    // A hospital's are the admin's own boxes, holding ready-made fields.
    expect(named(hospital, hospitalParts)).toEqual(['Who to call', 'Kosher food', 'A place to stay', 'Rides', 'Also'])
  })

  it('says each one’s new name on the field it comes from', () => {
    expect(renameListingBox(food, 'lead:delivery_whatsapp_group', 'Get it delivered')).toEqual({
      key: 'delivery_whatsapp_group',
      patch: { leadBox: { title: 'Get it delivered', text: 'delivery_details' } },
    })
    expect(renameListingBox(food, 'items', 'Dishes')).toEqual({ key: 'dishes', patch: { label: 'Dishes' } })
    expect(renameListingBox(food, 'caveat', 'Not kosher here')).toEqual({
      key: 'kosherCert',
      patch: { caveat: { flagField: 'kosherPartial', noteField: 'kosherNote', title: 'Not kosher here' } },
    })
    expect(renameListingBox(food, 'box:0', 'x')).toBeNull()
    const mikvah: FieldPage = {
      fields: [
        { key: 'women', label: 'Women’s Tevillah', type: 'boolean', filterLabel: 'Women’s' },
        { key: 'womenHours', label: 'Women’s Hours', type: 'hours', audienceKey: 'women' },
        contacts('liaisons', 'Liaisons'),
      ],
      hasAddress: true,
      hasPhone: false,
    }
    expect(renameListingBox(mikvah, 'audience:women', 'Women')).toEqual({ key: 'women', patch: { filterLabel: 'Women' } })
    expect(renameListingBox(mikvah, 'contacts:liaisons', 'Who to call')).toEqual({ key: 'liaisons', patch: { label: 'Who to call' } })
  })

  it('is typed over as saved, empty while it’s retyped', () => {
    const box = (page: FieldPage, id: string) => fieldBoxes(page, {}).find((b) => b.id === id)!
    expect(boxName(food, box(food, 'caveat'))).toEqual({ value: 'What isn’t kosher', placeholder: 'What isn’t kosher' })
    const cleared: FieldPage = { ...food, fields: food.fields.map((f) => (f.leadBox ? { ...f, leadBox: { ...f.leadBox, title: '' } } : f)) }
    expect(boxName(cleared, box(cleared, 'lead:delivery_whatsapp_group'))).toEqual({ value: '', placeholder: 'Delivery WhatsApp Group' })
    expect(boxName(food, box(food, 'items'))).toEqual({ value: 'Main dishes', placeholder: 'New box' })
  })

  it('heads what isn’t kosher with its new name', () => {
    const renamed = { ...food, fields: food.fields.map((f) => (f.caveat ? { ...f, caveat: { ...f.caveat, title: 'Not kosher here' } } : f)) }
    expect(fieldBoxes(renamed, {}).map((b) => b.title)).toContain('Not kosher here')
  })
})

// The user, Nov 9: "I'll click add a field under a specific box and it gets
// added under a different box." The picker opened from a box offers what
// lands in it, then what makes a box of its own, never what goes elsewhere.
describe('what a box’s + Add a field offers', () => {
  const page: FieldPage = { hasAddress: true, hasPhone: true, fields: [{ key: 's', label: 'Short', type: 'text', showInHeader: true }, { key: 'd', label: 'About it', type: 'textarea' }] }
  const boxes = fieldBoxes(page, { boxes: [{ title: 'Mine', fields: [] }] })
  const box = (id: string) => boxes.find((b) => b.id === id)!
  const kind = (type: CategoryField['type']): CategoryField => ({ key: 'x', label: 'X', type })

  it('never lands a long text in Contact, or a short one in About', () => {
    expect(whereAdded(box('contact'), kind('textarea'), page)).toBe('elsewhere')
    expect(whereAdded(box('contact'), kind('text'), page)).toBe('here')
    expect(whereAdded(box('about'), kind('textarea'), page)).toBe('here')
    expect(whereAdded(box('about'), kind('text'), page)).toBe('elsewhere')
  })

  it('takes into an admin’s box what a box can show', () => {
    expect(whereAdded(box('box:0'), kind('text'), page)).toBe('here')
    expect(whereAdded(box('box:0'), kind('image'), page)).toBe('elsewhere')
  })

  it('keeps the fields that make a box of their own addable from any box', () => {
    expect(whereAdded(box('contact'), kind('contacts'), page)).toBe('own')
    expect(whereAdded(box('about'), kind('minyanim'), page)).toBe('own')
  })

  it('puts the page’s address, phone, hours and website in Contact only', () => {
    expect(basicsLandIn(box('contact'))).toBe(true)
    expect(basicsLandIn(box('about'))).toBe(false)
    expect(basicsLandIn(box('box:0'))).toBe(false)
  })
})
