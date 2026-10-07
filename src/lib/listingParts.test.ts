import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { CategoryField } from './categories'
import { boxesOf, cardFieldChoices, listingPartsFromKey, listingPartsKey, listingPartsToSave, mainCardOf, parseListingParts, shabbosAfter, shabbosFieldsOf } from './listingParts'

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
      setLocation: true,
    })
    // A card with no title or no fields isn't one.
    expect(parseListingParts({ main: { title: '', fields: ['who'] } })).toEqual({})
    expect(parseListingParts({ main: { title: 'Who', fields: [] } })).toEqual({})
    expect(parseListingParts({ setLocation: 'yes' })).toEqual({})
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
  it('offers what a person writes or picks, not hours or a hidden field', () => {
    expect(cardFieldChoices([who, phone, eruv, hours, secret])).toEqual([who, phone, eruv])
  })
})

describe('in the editor’s draft', () => {
  it('keeps a card the admin hasn’t finished, and saves only finished ones', () => {
    const draft = listingPartsKey({ main: { title: '', fields: [] }, setLocation: true })
    expect(listingPartsFromKey(draft)).toEqual({ main: { title: '', fields: [] }, setLocation: true })
    expect(listingPartsToSave(draft)).toEqual({ setLocation: true })
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
  it('offers a list of contacts for a box', () => {
    expect(cardFieldChoices([pantry, hours])).toEqual([pantry])
  })
  it('keeps a box the admin hasn’t finished in the draft, and saves only finished ones', () => {
    const draft = listingPartsKey({ boxes: [{ title: 'Rides', fields: ['rides'] }, { title: '', fields: [] }], shabbos: { fields: [], after: 2 } })
    expect(listingPartsFromKey(draft)).toEqual({ boxes: [{ title: 'Rides', fields: ['rides'] }, { title: '', fields: [] }], shabbos: { fields: [], after: 2 } })
    expect(listingPartsToSave(draft)).toEqual({ boxes: [{ title: 'Rides', fields: ['rides'] }], shabbos: { fields: [], after: 2 } })
  })
})
