import { describe, expect, it } from 'vitest'
import type { CategoryField } from './categories'
import { addBox, addToBox, basicsLandIn, makesBox, boxLine, boxName, boxRenames, fieldBoxes, fieldItems, rowsOfBox, fieldLine, homeOf, itemKey, orderProblem, ownBox, readOrder, removeBox, renameKey, renameListingBox, whereAdded, type FieldItem, type FieldPage } from './fieldBoxes'
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
      ['Who to call', 'Liaisons'],
      ['Kosher food', 'Pantry, Food packages'],
      ['A place to stay', 'Accommodations'],
      ['This Shabbos', 'Eruv, Sukkah'],
      ['Rides', 'Transportation'],
      ['Also', 'Miscellaneous'],
      ['Contact', 'Address, Phone, Hours, Website, Refuah Link'],
    ])
  })

  // The user, Nov 10: the listing stays as it was, and "If they are one
  // field then they should be one field always". Each is one row, in the
  // box the listing draws it in (Delivery's own, What isn't kosher) until
  // it's put in one of the admin's; its parts (the questions, the
  // certificate, the group) are no row anywhere.
  it('makes a hechsher and Delivery details one field each, where the listing shows them', () => {
    expect(lines(food, {})).toEqual([
      ['Delivery', 'Delivery Details'],
      ['What isn’t kosher', 'Kosher Certification'],
      ['Main dishes', 'Main dishes'],
      ['Contact', 'Address, Phone, Hours, Website, Short Description, Food Type, Store Type'],
      ['About', 'Description'],
    ])
    const boxed: ListingParts = {
      boxes: [
        { title: 'Kosher', fields: ['kosherCert', 't'] },
        { title: 'Delivery', fields: ['delivery_details'] },
      ],
      order: ['box', 'box', 'items', 'contact', 'about'],
    }
    expect(lines(food, boxed)).toEqual([
      ['Kosher', 'Kosher Certification, Food Type'],
      ['Delivery', 'Delivery Details'],
      ['Main dishes', 'Main dishes'],
      ['Contact', 'Address, Phone, Hours, Website, Short Description, Store Type'],
      ['About', 'Description'],
    ])
    const shown = fieldBoxes(food, boxed).flatMap((b) => b.fields)
    for (const part of ['kosherPartial', 'kosherNote', 'k', 'delivery_whatsapp_group']) expect(shown).not.toContain(part)
  })

  it('gives a shul its davening times (board 6)', () => {
    expect(lines(shuls, {})).toEqual([
      ['Davening times', 'Davening Times (Minyanim)'],
      ['Contact', 'Address, Phone, Website, Denomination'],
    ])
  })

  it('makes a list of contacts in no box a box of its own, after the admin’s', () => {
    const boxes = fieldBoxes(hospital, { boxes: [{ title: 'Who to call', fields: ['liaisons'] }] })
    expect(boxes.slice(0, 3).map((b) => [b.id, b.title, b.kind])).toEqual([
      ['box:0', 'Who to call', 'admin'],
      ['contacts:pantry', 'Pantry', 'listing'],
      ['contacts:food_packages', 'Food packages', 'listing'],
    ])
  })

  it('leaves a field the admin can’t put in a card where it goes, and counts no empty box before the Shabbos card', () => {
    const boxes = fieldBoxes(hospital, { boxes: [{ title: 'New box', fields: [] }, { title: 'Odd', fields: ['photo', 'liaisons'] }], shabbos: { after: 1, fields: ['eruv'] } })
    expect(boxes.map((b) => b.id).slice(0, 3)).toEqual(['box:0', 'box:1', 'shabbos'])
    expect(boxes.find((b) => b.id === 'box:1')!.fields).toEqual(['liaisons'])
    // The photo goes with the name, in no box (Nov 10).
    expect(boxes.some((b) => b.fields.includes('photo'))).toBe(false)
  })

  it('puts a field in Contact or About by name, whatever kind it is (the user, Nov 10)', () => {
    const boxes = fieldBoxes(hospital, { contact: ['sukkah'], about: ['w'] })
    expect(boxes.find((b) => b.id === 'contact')!.fields).toEqual(['hours', 'r', 'eruv', 'sukkah'])
    expect(boxes.find((b) => b.id === 'about')!.fields).toEqual(['w'])
    // Not the header's photo. A field that is a box itself too (the user,
    // Nov 10: "anything takes anything"), its own box gone.
    const kept = fieldBoxes(hospital, { about: ['photo', 'liaisons'] })
    expect(kept.some((b) => b.fields.includes('photo'))).toBe(false)
    expect(kept.find((b) => b.id === 'contacts:liaisons')).toBeUndefined()
    expect(kept.find((b) => b.id === 'about')!.fields).toEqual(['liaisons', 'sukkah'])
  })

  it('says what a field is, where its name doesn’t', () => {
    expect(fieldLine(food.fields[5])).toBe('Filter · Under the name')
    expect(fieldLine(food.fields[8])).toBe('Button: Certification')
    expect(fieldLine(hospital.fields[4])).toBe('A list of contacts')
    expect(fieldLine(food.fields[2])).toBeUndefined()
  })

  it('finds each field’s home', () => {
    // A part is where its field is.
    expect(homeOf(food.hiddenFields![0], food)).toBe('part')
    expect(homeOf(food.fields[8], food)).toBe('part')
    expect(homeOf(food.fields[9], food)).toBe('part')
    // The fields themselves, where any field of their kind goes.
    expect(homeOf(food.fields[6], food)).toBe('caveat')
    expect(homeOf(food.fields[10], food)).toBe('lead:delivery_whatsapp_group')
    // A certificate's link on a page with no hechsher is a link like any other.
    const noHechsher: FieldPage = { ...food, fields: food.fields.filter((f) => !f.caveat), hiddenFields: [] }
    expect(homeOf(food.fields[8], noHechsher)).toBe('contact')
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
    expect(keys(items).slice(0, 6)).toEqual(['box:box:0', 'box:box:1', 'field:pantry', 'field:food_packages', 'end:box:1', 'box:box:2'])
    // Food packages, just under A place to stay's row.
    const next = drop(items, 'field:food_packages', 5)
    expect(orderProblem(items, next, hospital)).toBeNull()
    const { parts } = readOrder(items, next, hospitalParts, hospital)
    expect(parts.boxes!.map((b) => b.fields)).toEqual([['liaisons'], ['pantry'], ['accommodations', 'food_packages'], ['transportation'], ['miscellaneous']])
  })

  it('reorders the fields in an opened box', () => {
    const items = fieldItems(boxes, 'box:1')
    const next = drop(items, 'field:food_packages', 2)
    expect(orderProblem(items, next, hospital)).toBeNull()
    expect(readOrder(items, next, hospitalParts, hospital).parts.boxes![1].fields).toEqual(['food_packages', 'pantry'])
  })

  it('takes a list of contacts into Contact (the user, Nov 10: "anything takes anything")', () => {
    const items = fieldItems(boxes, 'box:1')
    const next = drop(items, 'field:pantry', items.findIndex((i) => itemKey(i) === 'box:contact'))
    expect(orderProblem(items, next, hospital)).toBeNull()
    expect(readOrder(items, next, hospitalParts, hospital).parts.contact).toEqual(['pantry'])
  })

  it('takes any field into any box, and says where it went (the user, Nov 10)', () => {
    // Hours, from Contact, into Who to call.
    const open = fieldItems(boxes, 'contact')
    const hours = drop(open, 'field:hours', 1)
    expect(orderProblem(open, hours, hospital)).toBeNull()
    expect(readOrder(open, hours, hospitalParts, hospital).parts.boxes![0].fields).toEqual(['liaisons', 'hours'])
    // The Refuah link, from Contact, to About; then back.
    const page: FieldPage = { ...hospital, fields: hospital.fields.filter((f) => f.key !== 'sukkah') }
    const plain = fieldBoxes(page, { about: ['w'] })
    const before = fieldItems(plain, 'contact')
    const toAbout = drop(before, 'field:r', before.length - 1)
    expect(orderProblem(before, toAbout, page)).toBeNull()
    const read = readOrder(before, toAbout, { about: ['w'] }, page).parts
    expect(read.about).toEqual(['w', 'r'])
    const after = fieldItems(fieldBoxes(page, read), 'about')
    const back = drop(after, 'field:w', after.findIndex((i) => itemKey(i) === 'box:contact') + 1)
    expect(orderProblem(after, back, page)).toBeNull()
    expect(readOrder(after, back, read, page).parts).toEqual({ about: ['r'], contact: ['w'] })
    // Never above the first box: there's no box there to be in.
    expect(orderProblem(before, drop(before, 'field:r', 0), page)).toEqual({})
  })

  it('keeps the address, phone and the end of the opened box under it', () => {
    const items = fieldItems(boxes, 'contact')
    expect(orderProblem(items, drop(items, 'basic:phone', 1), hospital)).toEqual({})
    const at = items.findIndex((i) => 'end' in i)
    expect(orderProblem(items, drop(items, 'field:w', at), hospital)).toEqual({})
  })

  // The user, Nov 10: "an admin can arrange how they want".
  it('moves any box anywhere, and saves the order', () => {
    const items = fieldItems(boxes, null)
    expect(keys(items)).toEqual(['box:box:0', 'box:box:1', 'box:box:2', 'box:shabbos', 'box:box:3', 'box:box:4', 'box:contact'])
    // Rides above Who to call.
    const rides = drop(items, 'box:box:3', 0)
    expect(orderProblem(items, rides, hospital)).toBeNull()
    const read = readOrder(items, rides, hospitalParts, hospital).parts
    expect(read.boxes!.map((b) => b.title)).toEqual(['Rides', 'Who to call', 'Kosher food', 'A place to stay', 'Also'])
    expect(read.order).toEqual(['box', 'box', 'box', 'box', 'shabbos', 'box', 'contact'])
    expect(read.shabbos).toEqual({ fields: ['eruv', 'sukkah'] })
    expect(fieldBoxes(hospital, read).map((b) => b.title)).toEqual(['Rides', 'Who to call', 'Kosher food', 'A place to stay', 'This Shabbos', 'Also', 'Contact'])
    // Contact first.
    const contact = drop(items, 'box:contact', 0)
    expect(orderProblem(items, contact, hospital)).toBeNull()
    expect(fieldBoxes(hospital, readOrder(items, contact, hospitalParts, hospital).parts).map((b) => b.title).slice(0, 2)).toEqual(['Contact', 'Who to call'])
  })

  // Board E1b (Nov 10): every box open, a box's head carrying its rows.
  describe('every box open (E1b)', () => {
    const all = fieldItems(boxes)
    const block = (id: string) => [`box:${id}`, ...rowsOfBox(all, id)]
    const moveBox = (id: string, beforeBox: string) => {
      const b = block(id)
      const rest = keys(all).filter((k) => !b.includes(k))
      const at = rest.indexOf(`box:${beforeBox}`)
      const order = [...rest.slice(0, at), ...b, ...rest.slice(at)]
      const byKey = new Map(all.map((i) => [itemKey(i), i]))
      return order.map((k) => byKey.get(k)!)
    }

    it('lists every box with its rows, each ending in its own end', () => {
      expect(keys(all).slice(0, 7)).toEqual(['box:box:0', 'field:liaisons', 'end:box:0', 'box:box:1', 'field:pantry', 'field:food_packages', 'end:box:1'])
      expect(rowsOfBox(all, 'box:1')).toEqual(['field:pantry', 'field:food_packages', 'end:box:1'])
    })

    it('moves a box with its fields, and saves the order', () => {
      const next = moveBox('box:3', 'box:0')
      expect(orderProblem(all, next, hospital)).toBeNull()
      const read = readOrder(all, next, hospitalParts, hospital).parts
      expect(read.boxes!.map((b) => [b.title, b.fields])).toEqual([
        ['Rides', ['transportation']],
        ['Who to call', ['liaisons']],
        ['Kosher food', ['pantry', 'food_packages']],
        ['A place to stay', ['accommodations']],
        ['Also', ['miscellaneous']],
      ])
    })

    it('turns down a box head dropped without its fields', () => {
      expect(orderProblem(all, drop(all, 'box:box:3', 0), hospital)).toEqual({})
    })

    it('moves a field from one open box into another', () => {
      const into = all.findIndex((i) => itemKey(i) === 'end:box:2')
      const next = drop(all, 'field:food_packages', into - 1)
      expect(orderProblem(all, next, hospital)).toBeNull()
      expect(readOrder(all, next, hospitalParts, hospital).parts.boxes!.map((b) => b.fields)).toEqual([['liaisons'], ['pantry'], ['accommodations', 'food_packages'], ['transportation'], ['miscellaneous']])
    })

    it('never puts a field after a box’s end, outside any box', () => {
      const end = all.findIndex((i) => itemKey(i) === 'end:box:0')
      expect(orderProblem(all, drop(all, 'field:pantry', end + 1), hospital)).toEqual({})
    })
  })

  it('keeps "Not on the listing" last', () => {
    const page: FieldPage = { ...hospital, fields: [...hospital.fields, { key: 'internal', label: 'Internal', type: 'text', renderAs: 'hidden' }] }
    const items = fieldItems(fieldBoxes(page, hospitalParts), null)
    expect(keys(items).at(-1)).toBe('box:hidden')
    expect(orderProblem(items, drop(items, 'box:contact', items.length - 1), page)).toEqual({})
    expect(orderProblem(items, drop(items, 'box:hidden', 1), page)).toEqual({})
  })

  it('puts a box the saved order doesn’t name after the one it follows anyway', () => {
    const parts: ListingParts = { ...hospitalParts, order: ['contact', 'box', 'box', 'box', 'box', 'box'], shabbos: { fields: ['eruv', 'sukkah'] } }
    // The Shabbos card isn't named: it follows Also, as it would.
    expect(fieldBoxes(hospital, parts).map((b) => b.title)).toEqual(['Contact', 'Who to call', 'Kosher food', 'A place to stay', 'Rides', 'Also', 'This Shabbos'])
  })

  it('doesn’t let a box move between an opened box and its fields', () => {
    const items = fieldItems(boxes, 'box:1')
    expect(orderProblem(items, drop(items, 'box:box:0', 3), hospital)).toEqual({})
  })

  it('reorders a box of the listing’s own among the page’s fields', () => {
    const items = fieldItems(fieldBoxes(food, {}), 'contact')
    const at = items.findIndex((i) => itemKey(i) === 'field:hours')
    const next = drop(items, 'field:foodType', at)
    expect(orderProblem(items, next, food)).toBeNull()
    const { order } = readOrder(items, next, {}, food)
    // Store Type takes Hours' place; the rest of Contact moves along a slot.
    expect(order).toEqual(['foodType', 'hours', 'photo', 'googleDescription', 'website', 's', 'kosherCert', 't', 'k', 'delivery_whatsapp_group', 'delivery_details', 'dishes'])
  })

  it('puts a field back where it goes when it’s dropped there', () => {
    const parts = { boxes: [{ title: 'Note', fields: ['s'] }] }
    const items = fieldItems(fieldBoxes(food, parts), 'box:0')
    expect(keys(items).slice(2, 4)).toEqual(['box:items', 'box:box:0'])
    // Short Description, back under Contact's row.
    const next = drop(items, 'field:s', items.findIndex((i) => itemKey(i) === 'box:contact'))
    expect(orderProblem(items, next, food)).toBeNull()
    const read = readOrder(items, next, parts, food).parts
    expect(read.boxes![0].fields).toEqual([])
    expect(fieldBoxes(food, read).find((b) => b.id === 'contact')!.fields).toContain('s')
  })
})

// Board 4: Main dishes has a handle, and the listing follows the order.
describe('the listing’s own boxes', () => {
  const foodBoxes = fieldBoxes(food, {})

  it('move anywhere, About above them all, and the order is kept', () => {
    const items = fieldItems(foodBoxes, null)
    expect(keys(items)).toEqual(['box:lead:delivery_whatsapp_group', 'box:caveat', 'box:items', 'box:contact', 'box:about'])
    expect(foodBoxes.filter((b) => b.moves).map((b) => b.title)).toEqual(['Delivery', 'What isn’t kosher', 'Main dishes', 'Contact', 'About'])
    // Contact first.
    const next = drop(items, 'box:contact', 0)
    expect(orderProblem(items, next, food)).toBeNull()
    const { parts } = readOrder(items, next, {}, food)
    expect(parts.order).toEqual(['contact', 'lead:delivery_whatsapp_group', 'caveat', 'items', 'about'])
    expect(fieldBoxes(food, parts).map((b) => b.title)).toEqual(['Contact', 'Delivery', 'What isn’t kosher', 'Main dishes', 'About'])
    // About above them all.
    const about = drop(items, 'box:about', 0)
    expect(orderProblem(items, about, food)).toBeNull()
    expect(fieldBoxes(food, readOrder(items, about, {}, food).parts).map((b) => b.title)).toEqual(['About', 'Delivery', 'What isn’t kosher', 'Main dishes', 'Contact'])
  })

  // A hechsher in the admin's Kosher box, its question and link as no rows
  // of their own; dragged into Contact, it's Contact's, What isn't kosher
  // gone. A box of the listing's own still takes only its own field.
  it('keeps a hechsher in the admin’s box with its parts, and drops it in Contact', () => {
    const boxed: ListingParts = { boxes: [{ title: 'Kosher', fields: ['kosherCert', 't'] }] }
    const items = fieldItems(fieldBoxes(food, boxed), 'box:0')
    expect(keys(items).slice(0, 6)).toEqual(['box:lead:delivery_whatsapp_group', 'box:items', 'box:box:0', 'field:kosherCert', 'field:t', 'end:box:0'])
    const next = drop(items, 'field:kosherCert', items.findIndex((i) => itemKey(i) === 'box:contact'))
    expect(orderProblem(items, next, food)).toBeNull()
    const parts = readOrder(items, next, boxed, food).parts
    expect(parts.contact).toEqual(['kosherCert'])
    const after = fieldBoxes(food, parts)
    expect(after.find((b) => b.id === 'contact')!.fields).toContain('kosherCert')
    expect(after.find((b) => b.id === 'caveat')).toBeUndefined()
    // A mikvah's section is its switch's: nothing else goes in it.
    const mikvah: FieldPage = {
      hasAddress: true,
      hasPhone: false,
      fields: [
        { key: 'women', label: 'Women’s Tevillah', type: 'boolean', filterLabel: 'Women’s' },
        { key: 'womenHours', label: 'Women’s Hours', type: 'hours', audienceKey: 'women' },
        { key: 's', label: 'Short Description', type: 'text' },
      ],
    }
    const all = fieldItems(fieldBoxes(mikvah, {}))
    const wrong = drop(all, 'field:s', all.findIndex((i) => itemKey(i) === 'box:audience:women') + 1)
    expect(orderProblem(all, wrong, mikvah)).toEqual({ at: 'audience:women', why: 'Short Description can’t go in Women’s' })
  })
})

describe('the admin’s boxes', () => {
  // Board B: in place, at the end, its name to type.
  it('adds an empty box at the end, after Contact, keeping the others where they were', () => {
    const { parts, id } = addBox(hospitalParts, fieldBoxes(hospital, hospitalParts))
    expect(id).toBe('box:5')
    expect(fieldBoxes(hospital, parts).map((b) => b.title)).toEqual(['Who to call', 'Kosher food', 'A place to stay', 'This Shabbos', 'Rides', 'Also', 'Contact', ''])
    expect(parts.boxes![5]).toEqual({ title: '', fields: [] })
  })

  it('takes any box out of the saved order, the admin’s by their turn', () => {
    const parts: ListingParts = { ...hospitalParts, order: ['contact', 'box', 'box', 'shabbos', 'box', 'box', 'box'] }
    const less = removeBox(parts, 'box:1')
    expect(less.order).toEqual(['contact', 'box', 'shabbos', 'box', 'box', 'box'])
    // Kosher food's lists, in no box now, follow the admin's boxes.
    expect(fieldBoxes(hospital, less).map((b) => b.title)).toEqual(['Contact', 'Who to call', 'This Shabbos', 'A place to stay', 'Rides', 'Also', 'Pantry', 'Food packages'])
    expect(removeBox(parts, 'contact').order).toEqual(['box', 'box', 'shabbos', 'box', 'box', 'box'])
  })

  it('takes a box off, its fields going back where they go, the Shabbos card after the same boxes', () => {
    const parts = removeBox(hospitalParts, 'box:0')
    expect(parts.shabbos!.after).toBe(2)
    expect(fieldBoxes(hospital, parts).map((b) => b.title)).toEqual(['Kosher food', 'A place to stay', 'This Shabbos', 'Rides', 'Also', 'Liaisons', 'Contact'])
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
  // The user, Nov 10, changing Nov 7's "lock the name": every box is
  // renamed but those every listing has (the Shabbos card, Contact, About).
  it('renames every box but the ones every listing has', () => {
    const named = (page: FieldPage, parts: ListingParts = {}) => fieldBoxes(page, parts).filter((b) => boxRenames(b, page)).map((b) => b.title)
    const madeHere = (page: FieldPage): FieldPage => ({ ...page, fields: page.fields.map((f) => ({ ...f, madeHere: true })) })
    expect(named(food)).toEqual(['Delivery', 'What isn’t kosher', 'Main dishes'])
    expect(named(madeHere(food))).toEqual(['Delivery', 'What isn’t kosher', 'Main dishes'])
    expect(named(shuls, { shabbos: { fields: ['denomination'] } })).toEqual(['Davening times'])
    // A hospital's are the admin's own boxes, holding ready-made fields.
    expect(named(hospital, hospitalParts)).toEqual(['Who to call', 'Kosher food', 'A place to stay', 'Rides', 'Also'])
  })

  it('says each one’s new name on the field it comes from', () => {
    expect(renameListingBox(food, 'items', 'Dishes')).toEqual({ key: 'dishes', patch: { label: 'Dishes' } })
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
    expect(boxName(food, box(food, 'items'))).toEqual({ value: 'Main dishes', placeholder: 'New box' })
    const cleared: FieldPage = { ...food, fields: food.fields.map((f) => (f.key === 'dishes' ? { ...f, label: '' } : f)) }
    expect(boxName(cleared, box(cleared, 'items')).value).toBe('')
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

  it('lands a long text in Contact, or a short one in About (the user, Nov 10)', () => {
    for (const type of ['textarea', 'text', 'tel', 'url', 'number', 'hours', 'tags'] as const) {
      expect(whereAdded(box('contact'), kind(type), page)).toBe('here')
      expect(whereAdded(box('about'), kind(type), page)).toBe('here')
      expect(whereAdded(box('box:0'), kind(type), page)).toBe('here')
    }
  })

  it('puts one added from Contact or About there by name, out of the other', () => {
    expect(addToBox({}, 'about', 'phone2')).toEqual({ about: ['phone2'] })
    expect(addToBox({ about: ['phone2'] }, 'contact', 'phone2')).toEqual({ contact: ['phone2'] })
    expect(renameKey({ contact: ['#3'] }, '#3', 'notes')).toEqual({ contact: ['notes'] })
  })

  it('takes into an admin’s box what a box can show', () => {
    expect(whereAdded(box('box:0'), kind('text'), page)).toBe('here')
    expect(whereAdded(box('box:0'), kind('image'), page)).toBe('elsewhere')
  })

  it('takes a field that is a box of its own into any box (the user, Nov 10: "anything takes anything")', () => {
    expect(whereAdded(box('contact'), kind('contacts'), page)).toBe('here')
    expect(whereAdded(box('about'), kind('minyanim'), page)).toBe('here')
    expect(whereAdded(box('box:0'), kind('minyanim'), page)).toBe('here')
    expect(whereAdded(box('box:0'), kind('contacts'), page)).toBe('here')
    expect(makesBox(kind('minyanim'), page)).toBe(true)
    expect(makesBox(kind('contacts'), page)).toBe(true)
    expect(makesBox(kind('textarea'), page)).toBe(false)
    // A hechsher is What isn't kosher's until it's put in another box.
    expect(makesBox(food.fields[6], food)).toBe(true)
    expect(whereAdded(box('box:0'), food.fields[6], food)).toBe('here')
    expect(whereAdded(box('contact'), food.fields[6], food)).toBe('here')
  })

  it('takes any field into a box of the listing’s own (the user, Nov 10: "existing boxes not being editable")', () => {
    const own = fieldBoxes(food, {})
    const at = (id: string) => own.find((b) => b.id === id)!
    for (const id of ['lead:delivery_whatsapp_group', 'caveat', 'items']) {
      expect(whereAdded(at(id), kind('text'), food)).toBe('here')
      expect(whereAdded(at(id), kind('minyanim'), food)).toBe('here')
      expect(whereAdded(at(id), kind('image'), food)).toBe('elsewhere')
    }
    const shul = fieldBoxes(shuls, {}).find((b) => b.id === 'minyanim')!
    expect(whereAdded(shul, kind('contacts'), shuls)).toBe('here')
  })

  it('puts the page’s address, phone, hours and website in Contact only', () => {
    expect(basicsLandIn(box('contact'))).toBe(true)
    expect(basicsLandIn(box('about'))).toBe(false)
    expect(basicsLandIn(box('box:0'))).toBe(false)
  })
})

// The user, Nov 10: "I can not for the life of me understand why we're still
// having existing boxes not being editable." A box of the listing's own
// becomes one of the admin's, in its place, when it takes a field or a name.
describe('a box of the listing’s own, made the admin’s', () => {
  it('keeps its place, name and fields, the admin’s after it one further along', () => {
    const parts: ListingParts = { boxes: [{ title: 'Mine', fields: ['s'] }] }
    const shown = fieldBoxes(food, parts)
    expect(shown.map((b) => b.id)).toEqual(['lead:delivery_whatsapp_group', 'caveat', 'items', 'box:0', 'contact', 'about'])
    const { parts: owned, id } = ownBox(parts, shown, 'items', food)
    expect(id).toBe('box:0')
    expect(owned.boxes).toEqual([{ title: 'Main dishes', fields: ['dishes'] }, { title: 'Mine', fields: ['s'] }])
    const after = fieldBoxes(food, owned)
    expect(after.map((b) => [b.id, b.title, b.kind])).toEqual([
      ['lead:delivery_whatsapp_group', 'Delivery', 'listing'],
      ['caveat', 'What isn’t kosher', 'listing'],
      ['box:0', 'Main dishes', 'admin'],
      ['box:1', 'Mine', 'admin'],
      ['contact', 'Contact', 'fixed'],
      ['about', 'About', 'fixed'],
    ])
    // Renamed as it's made.
    expect(ownBox({}, fieldBoxes(food, {}), 'lead:delivery_whatsapp_group', food, 'Getting it delivered').parts.boxes).toEqual([{ title: 'Getting it delivered', fields: ['delivery_details'] }])
    // Contact, About and the admin's own stay as they are.
    for (const b of ['contact', 'about', 'box:0']) expect(ownBox(parts, shown, b, food)).toEqual({ parts, id: b })
  })

  it('takes a field dragged into it', () => {
    const shown = fieldBoxes(shuls, {})
    const items = fieldItems(shown)
    // The website, from Contact, under the davening times.
    const next = drop(items, 'field:website', items.findIndex((i) => itemKey(i) === 'end:minyanim'))
    expect(orderProblem(items, next, shuls)).toBeNull()
    const { parts } = readOrder(items, next, {}, shuls)
    expect(parts.boxes).toEqual([{ title: 'Davening times', fields: ['minyanim', 'website'] }])
    expect(fieldBoxes(shuls, parts).map((b) => [b.title, boxLine(b, shuls)])).toEqual([
      ['Davening times', 'Davening Times (Minyanim), Website'],
      ['Contact', 'Address, Phone, Denomination'],
    ])
  })
})
