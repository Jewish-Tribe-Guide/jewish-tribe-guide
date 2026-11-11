import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { CategoryField } from './categories'
import { boxesOf, cardFieldChoices, fixedPlaceOf, leadOrderOf, listingPartsFromKey, listingPartsKey, listingPartsToSave, mainCardOf, parseListingParts, shabbosAfter, shabbosFieldsOf } from './listingParts'

const who: CategoryField = { key: 'who', label: 'Who to call first', type: 'text' }
const phone: CategoryField = { key: 'who_phone', label: 'Their phone', type: 'tel' }
const eruv: CategoryField = { key: 'eruv', label: 'Eruv', type: 'select', renderAs: 'row' }
const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours' }
const secret: CategoryField = { key: 'note', label: 'Note', type: 'textarea', renderAs: 'hidden' }

describe('parseListingParts', () => {
  it('reads what it knows, and anything else as none', () => {
    expect(parseListingParts({ main: { title: ' Who to call first ', fields: ['who', 'who', 3] }, shabbos: { fields: ['eruv'] }, setLocation: true, x: 1 })).toEqual({
      main: { title: 'Who to call first', fields: ['who'] },
      shabbos: { fields: ['eruv'] },
    })
    // A card with no title or no fields isn't one.
    expect(parseListingParts({ main: { title: '', fields: ['who'] } })).toEqual({})
    expect(parseListingParts({ main: { title: 'Who', fields: [] } })).toEqual({})
    // Set as location was a switch until Oct 10; a stored one means nothing.
    expect(parseListingParts({ setLocation: true })).toEqual({})
    expect(parseListingParts(null)).toEqual({})
    expect(parseListingParts([])).toEqual({})
  })
})

describe('the cards’ fields', () => {
  const hospital = makeCategory({
    detailFields: [who, phone, eruv, hours, secret],
    listingParts: { main: { title: 'Who to call first', fields: ['who_phone', 'who', 'gone'] }, shabbos: { fields: ['eruv', 'gone'] } },
  })
  it('in the category’s own order, leaving out a field that’s gone', () => {
    expect(mainCardOf(hospital)).toEqual({ label: 'Who to call first', fields: [who, phone] })
    expect(shabbosFieldsOf(hospital)).toEqual([eruv])
  })
  it('none when the category has none', () => {
    expect(mainCardOf(makeCategory({ detailFields: [who] }))).toBeNull()
    expect(shabbosFieldsOf(makeCategory({ detailFields: [who] }))).toBeNull()
    expect(mainCardOf(makeCategory({ detailFields: [hours], listingParts: { main: { title: 'Who', fields: ['who'] } } }))).toBeNull()
  })
  it('offers what a person writes or picks, hours too (Nov 10), not a hidden field', () => {
    expect(cardFieldChoices([who, phone, eruv, hours, secret])).toEqual([who, phone, eruv, hours])
  })
})

describe('Contact and About, by name (Nov 10)', () => {
  it('reads and keeps the fields put in each', () => {
    expect(parseListingParts({ contact: ['notes', 'notes', 1], about: [] })).toEqual({ contact: ['notes'] })
    const key = listingPartsKey({ about: ['phone2'] })
    expect(key).not.toBe('')
    expect(listingPartsFromKey(key)).toEqual({ about: ['phone2'] })
    expect(listingPartsToSave(key)).toEqual({ about: ['phone2'] })
    const place = fixedPlaceOf(makeCategory({ listingParts: { contact: ['notes'], about: ['phone2'] } }))
    expect([place('notes'), place('phone2'), place('x')]).toEqual(['contact', 'about', null])
  })
})

describe('in the editor’s draft', () => {
  it('keeps a card the admin hasn’t finished, and saves only finished ones', () => {
    const draft = listingPartsKey({ main: { title: '', fields: [] }, shabbos: { fields: ['eruv'] } })
    expect(listingPartsFromKey(draft)).toEqual({ main: { title: '', fields: [] }, shabbos: { fields: ['eruv'] } })
    expect(listingPartsToSave(draft)).toEqual({ shabbos: { fields: ['eruv'] } })
    expect(listingPartsToSave(listingPartsKey({ main: { title: '', fields: [] } }))).toBeNull()
    expect(listingPartsKey({})).toBe('')
    expect(listingPartsFromKey('')).toEqual({})
    expect(listingPartsFromKey('{nope')).toEqual({})
  })
})

// ── Boxes (Oct 6: a hospital on Refuah's sections) ──────────────────────────
describe('boxes', () => {
  const liaisons: CategoryField = { key: 'liaisons', label: 'Who to call', type: 'contacts' }
  const pantry: CategoryField = { key: 'pantry', label: 'Pantry', type: 'contacts' }
  const packages: CategoryField = { key: 'packages', label: 'Food packages', type: 'contacts' }
  it('reads each box with a title and fields, and where the Shabbos card goes among them', () => {
    expect(
      parseListingParts({
        boxes: [{ title: ' Kosher food ', fields: ['pantry', 'packages', 'pantry'] }, { title: '', fields: ['x'] }, { title: 'Empty', fields: [] }, 'nope'],
        shabbos: { fields: ['eruv'], after: 3 },
      }),
    ).toEqual({ boxes: [{ title: 'Kosher food', fields: ['pantry', 'packages'] }], shabbos: { fields: ['eruv'], after: 3 } })
    expect(parseListingParts({ shabbos: { fields: [], after: -1 } })).toEqual({ shabbos: { fields: [] } })
    expect(parseListingParts({ shabbos: { fields: [], after: 1.5 } })).toEqual({ shabbos: { fields: [] } })
  })
  it('keeps each box’s own order of fields, leaving out one that’s gone or hidden', () => {
    const hospital = makeCategory({
      detailFields: [liaisons, packages, pantry, secret],
      listingParts: { boxes: [{ title: 'Kosher food', fields: ['pantry', 'gone', 'packages'] }, { title: 'Who to call', fields: ['liaisons'] }, { title: 'Secret', fields: ['note'] }], shabbos: { fields: [], after: 1 } },
    })
    expect(boxesOf(hospital)).toEqual([
      { title: 'Kosher food', fields: [pantry, packages] },
      { title: 'Who to call', fields: [liaisons] },
    ])
    expect(shabbosAfter(hospital)).toBe(1)
    expect(shabbosAfter(makeCategory({ listingParts: { shabbos: { fields: [] } } }))).toBeNull()
    expect(boxesOf(makeCategory({ detailFields: [pantry] }))).toEqual([])
  })
  // The user, Nov 10: davening times, a list of items and contacts can go
  // in any of the admin's boxes.
  it('offers a list of contacts and a list of items for a box', () => {
    const dishes: CategoryField = { key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true }
    expect(cardFieldChoices([pantry, dishes])).toEqual([pantry, dishes])
  })
  it('keeps a box the admin hasn’t finished in the draft, and saves only finished ones', () => {
    const draft = listingPartsKey({ boxes: [{ title: 'Rides', fields: ['rides'] }, { title: '', fields: [] }], shabbos: { fields: [], after: 2 } })
    expect(listingPartsFromKey(draft)).toEqual({ boxes: [{ title: 'Rides', fields: ['rides'] }, { title: '', fields: [] }], shabbos: { fields: [], after: 2 } })
    expect(listingPartsToSave(draft)).toEqual({ boxes: [{ title: 'Rides', fields: ['rides'] }], shabbos: { fields: [], after: 2 } })
  })
})

describe('the listing’s own boxes’ order', () => {
  it('reads each known box once, the rest after, and the usual order as none', () => {
    expect(parseListingParts({ lead: ['main', 'main', 'x', 'link'] })).toEqual({ lead: ['main', 'link', 'caveat'] })
    expect(parseListingParts({ lead: ['link', 'caveat', 'main'] })).toEqual({})
    expect(parseListingParts({ lead: 'main' })).toEqual({})
    expect(leadOrderOf(makeCategory({ listingParts: { lead: ['caveat'] } }))).toEqual(['caveat', 'link', 'main'])
    expect(leadOrderOf(makeCategory({}))).toEqual(['link', 'caveat', 'main'])
    expect(listingPartsToSave(listingPartsKey({ lead: ['main', 'link', 'caveat'] }))).toEqual({ lead: ['main', 'link', 'caveat'] })
  })
})
