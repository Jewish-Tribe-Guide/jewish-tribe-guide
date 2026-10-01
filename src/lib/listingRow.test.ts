import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { CategoryField } from './categories'
import { candlesToday, initialsOf, isVouchedFor, listingRowFacts, listingRowNote, rowItems } from './listingRow'
import type { ZmanimData } from '@/types'

const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' }
const type: CategoryField = {
  key: 'type',
  label: 'Food type',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  options: [
    { value: 'meat', label: 'Meat' },
    { value: 'parve', label: 'Parve' },
  ],
}
const cert: CategoryField = {
  key: 'cert',
  label: 'Hechsher',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  caveat: { flagField: 'partial', noteField: 'partialNote' },
}
const items: CategoryField = {
  key: 'items',
  label: 'Kosher items',
  type: 'tags',
  showCountInHeader: true,
  countLabel: 'kosher item',
  countReplacesKey: 'kosher',
}
const kosher: CategoryField = { key: 'kosher', label: 'Kosher items', type: 'boolean', filterable: true }

// A Friday at 2 PM, local time.
const FRIDAY_2PM = new Date(2026, 9, 2, 14, 0)
const openFriday = (open: string, close: string) => ({ fri: { open, close } })
const texts = (facts: { text: string }[]) => facts.map((f) => f.text)

describe('listingRowFacts', () => {
  it('reads status, distance, kind of place, in that order', () => {
    const category = makeCategory({ detailFields: [hours, type, cert] })
    const item = makeListing({ hours: openFriday('09:00', '19:00'), milesFromAddress: 1.24, type: 'parve', cert: 'IKC' })
    expect(listingRowFacts(item, category, FRIDAY_2PM)).toEqual([
      { text: 'Open until 7 PM', tone: 'open' },
      { text: '1.2 mi', tone: 'plain' },
      { text: 'Parve', tone: 'plain' },
      { text: 'IKC', tone: 'plain' },
    ])
  })

  it('keeps the minutes when there are some, and says "closes soon" within the hour', () => {
    const category = makeCategory({ detailFields: [hours] })
    expect(texts(listingRowFacts(makeListing({ hours: openFriday('09:00', '18:30') }), category, FRIDAY_2PM))).toEqual(['Open until 6:30 PM'])
    const soon = listingRowFacts(makeListing({ hours: openFriday('09:00', '14:45') }), category, FRIDAY_2PM)
    expect(soon).toEqual([{ text: 'Closes soon · 2:45 PM', tone: 'caution' }])
  })

  it('says a place shuts before candles on a Friday, in the caution colour', () => {
    const category = makeCategory({ detailFields: [hours] })
    const candles = 18 * 60 + 10
    const at = (close: string) => listingRowFacts(makeListing({ hours: openFriday('09:00', close) }), category, FRIDAY_2PM, { candlesAt: candles })
    expect(at('16:00')).toEqual([{ text: 'Until 4 PM, before candles', tone: 'caution' }])
    // After candles: an ordinary afternoon.
    expect(at('22:00')).toEqual([{ text: 'Open until 10 PM', tone: 'open' }])
    // Within the hour, closing soon says more.
    expect(texts(at('14:45'))).toEqual(['Closes soon · 2:45 PM'])
    // Any other day there's no candle time to go by.
    expect(texts(listingRowFacts(makeListing({ hours: openFriday('09:00', '16:00') }), category, FRIDAY_2PM))).toEqual(['Open until 4 PM'])
  })

  it('says just "Open" for a place open till midnight, not "until 11:59 PM"', () => {
    const category = makeCategory({ detailFields: [hours] })
    expect(texts(listingRowFacts(makeListing({ hours: openFriday('09:00', '23:59') }), category, FRIDAY_2PM))).toEqual(['Open'])
  })

  it('says when a place that isn’t open opens next: later today, or the day', () => {
    const category = makeCategory({ detailFields: [hours] })
    expect(listingRowFacts(makeListing({ hours: openFriday('16:00', '20:00') }), category, FRIDAY_2PM)).toEqual([
      { text: 'Opens 4 PM', tone: 'opens' },
    ])
    const sunday = { fri: { open: '08:00', close: '12:00' }, sun: { open: '10:30', close: '17:00' } }
    expect(texts(listingRowFacts(makeListing({ hours: sunday }), category, FRIDAY_2PM))).toEqual(['Opens Sun 10:30 AM'])
  })

  it('says "No hours listed" for no hours, or hours closed every day, and nothing for hours it can’t read', () => {
    const category = makeCategory({ detailFields: [hours] })
    expect(listingRowFacts(makeListing(), category, FRIDAY_2PM)).toEqual([{ text: 'No hours listed', tone: 'quiet' }])
    const closedAllWeek = { sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null }
    expect(texts(listingRowFacts(makeListing({ hours: closedAllWeek }), category, FRIDAY_2PM))).toEqual(['No hours listed'])
    expect(listingRowFacts(makeListing({ hours: 'Mon–Thu 9–5' }), category, FRIDAY_2PM)).toEqual([])
    // A category without hours says nothing about them.
    expect(listingRowFacts(makeListing(), makeCategory({ detailFields: [] }), FRIDAY_2PM)).toEqual([])
  })

  // Before the page has hydrated there's no time (see useNow): a row built
  // on the server, days before it's read, used to say "Opens Wed 9 AM".
  it('says nothing about open or closed before the time is known, but still says a closure', () => {
    const category = makeCategory({ detailFields: [hours, type] })
    const open = makeListing({ hours: openFriday('09:00', '19:00'), type: 'meat' })
    expect(texts(listingRowFacts(open, category, null))).toEqual(['Meat'])
    expect(texts(listingRowFacts(makeListing(), category, null))).toEqual([])
    expect(texts(listingRowFacts(makeListing({ businessStatus: 'CLOSED_PERMANENTLY' }), category, null))).toEqual(['Permanently closed'])
    expect(listingRowNote(makeListing(), category, null, { flagUnconfirmed: true })).toBeNull()
    expect(candlesToday(null, null)).toBeNull()
  })

  it('puts a closure first, over any hours, red only when it’s permanent', () => {
    const category = makeCategory({ detailFields: [hours] })
    const open = { hours: openFriday('09:00', '19:00') }
    expect(listingRowFacts(makeListing({ ...open, businessStatus: 'CLOSED_TEMPORARILY' }), category, FRIDAY_2PM)).toEqual([
      { text: 'Temporarily closed', tone: 'caution' },
    ])
    expect(listingRowFacts(makeListing({ ...open, businessStatus: 'CLOSED_PERMANENTLY' }), category, FRIDAY_2PM)).toEqual([
      { text: 'Permanently closed', tone: 'closed' },
    ])
  })

  it('puts a shul’s next minyan after its status, before its distance', () => {
    const facts = listingRowFacts(makeListing({ milesFromAddress: 0.4 }), makeCategory(), FRIDAY_2PM, { shul: { text: 'Mincha 6:34 PM', tone: 'minyan' } })
    expect(facts).toEqual([
      { text: 'Mincha 6:34 PM', tone: 'minyan' },
      { text: '0.4 mi', tone: 'plain' },
    ])
  })

  it('says quietly when a shul has nothing soon', () => {
    const facts = listingRowFacts(makeListing({ milesFromAddress: 2.1 }), makeCategory(), FRIDAY_2PM, { shul: { text: 'Shabbos only', tone: 'quiet' } })
    expect(facts).toEqual([
      { text: 'Shabbos only', tone: 'quiet' },
      { text: '2.1 mi', tone: 'plain' },
    ])
  })

  it('says a hechsher plainly even with a caveat: the caveat is the third line', () => {
    const category = makeCategory({ detailFields: [cert] })
    const item = makeListing({ cert: 'IKC', partial: true, partialNote: 'Only the bakery case' })
    expect(listingRowFacts(item, category, FRIDAY_2PM)).toEqual([{ text: 'IKC', tone: 'plain' }])
  })

  it('leaves out the field the row’s group heading already says', () => {
    const category = makeCategory({ detailFields: [type, cert] })
    const item = makeListing({ type: 'meat', cert: 'IKC' })
    expect(texts(listingRowFacts(item, category, FRIDAY_2PM, { omitKey: 'type' }))).toEqual(['IKC'])
  })

  it('leaves out badge fields that aren’t tied to a filter', () => {
    const category = makeCategory({ detailFields: [{ ...type, filterable: false }] })
    expect(listingRowFacts(makeListing({ type: 'meat' }), category, FRIDAY_2PM)).toEqual([])
  })

  it('names the items instead of counting them, and drops a badge that says the same', () => {
    const category = makeCategory({ detailFields: [kosher, items] })
    const item = makeListing({ kosher: true, items: ['Milk', 'Challah'], items_sometimes: ['Brie'] })
    expect(texts(listingRowFacts(item, category, FRIDAY_2PM))).toEqual(['Milk, challah, brie (sometimes)'])
  })

  it('keeps the badge while there are no items to name', () => {
    const category = makeCategory({ detailFields: [kosher, items] })
    expect(texts(listingRowFacts(makeListing({ kosher: true, items: [] }), category, FRIDAY_2PM))).toEqual(['Kosher items'])
  })

  it('keeps "Kosher Store" beside the items: it says something they don’t', () => {
    const storeKind: CategoryField = {
      key: 'kosher',
      label: 'Kosher Store',
      type: 'select',
      renderAs: 'badge',
      filterable: true,
      options: [
        { value: 'Kosher Store', label: 'Kosher Store' },
        { value: 'Kosher Items', label: 'Kosher Items' },
      ],
    }
    const category = makeCategory({ detailFields: [storeKind, items] })
    expect(texts(listingRowFacts(makeListing({ kosher: 'Kosher Store', items: ['Premade Shabbat meals'] }), category, FRIDAY_2PM))).toEqual([
      'Kosher Store',
      'Premade Shabbat meals',
    ])
    expect(texts(listingRowFacts(makeListing({ kosher: 'Kosher Items', items: ['Challah'] }), category, FRIDAY_2PM))).toEqual(['Challah'])
  })
})

describe('a restaurant’s dishes on the row (agreed Oct 1)', () => {
  const dishes: CategoryField = { key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'dish' }
  const listing = makeListing({ type: 'meat', cert: 'OU', dishes: ['Shawarma', 'Falafel', 'Schnitzel', 'Kebabs', 'Hummus'] })

  it('after two facts of its own, on a line of their own', () => {
    const facts = listingRowFacts(listing, makeCategory({ detailFields: [type, cert, dishes] }), null)
    expect(facts.filter((f) => !f.ownLine).map((f) => f.text)).toEqual(['Meat', 'OU'])
    expect(facts.find((f) => f.ownLine)?.text).toBe('Shawarma, falafel, schnitzel +2')
  })

  it('with room on the line, beside the facts as a grocery’s are', () => {
    const facts = listingRowFacts(listing, makeCategory({ detailFields: [type, dishes] }), null)
    expect(facts.some((f) => f.ownLine)).toBe(false)
    expect(texts(facts)).toEqual(['Meat', 'Shawarma, falafel, schnitzel +2'])
  })
})

describe('rowItems', () => {
  it('names up to four, or three and how many more', () => {
    expect(rowItems(makeListing({ m: ['Wine', 'Challah', 'Deli', 'Cheese'] }), 'm')).toBe('Wine, challah, deli, cheese')
    expect(rowItems(makeListing({ m: ['Pretzel buns', 'Donuts', 'Brie', 'Milk', 'Eggs', 'Tofu'] }), 'm')).toBe('Pretzel buns, donuts, brie +3')
  })

  it('puts the sometimes items after, marked, and keeps a name’s capitals', () => {
    expect(rowItems(makeListing({ m: ['Prepared Shabbos food', 'Pas Yisroel bread'], m_sometimes: ['Challah'] }), 'm')).toBe(
      'Prepared Shabbos food, Pas Yisroel bread, challah (sometimes)',
    )
  })

  it('writes Title Case items as a list is written, keeping abbreviations', () => {
    expect(rowItems(makeListing({ m: ['Marshmallows', 'Cheddar Cheese', 'Stew Meat', 'OU Chicken'] }), 'm')).toBe(
      'Marshmallows, cheddar cheese, stew meat, OU chicken',
    )
    expect(rowItems(makeListing({ m: ['European Style Butter'] }), 'm')).toBe('European style butter')
  })

  it('is nothing with no items', () => {
    expect(rowItems(makeListing(), 'm')).toBeNull()
  })
})

describe('listingRowNote: a third line only for an exception', () => {
  const partial: CategoryField = { key: 'partial', label: 'Everything here is kosher', type: 'boolean', renderAs: 'hidden' }
  const minyanim: CategoryField = { key: 'minyanim', label: 'Minyanim', type: 'minyanim' }
  const notes: CategoryField = { key: 'notes', label: 'Notes', type: 'textarea', showInHeader: true }
  const tagline: CategoryField = { key: 's', label: 'Short description', type: 'text', showInHeader: true }
  const confirmed = { confirmedAt: '2026-09-01T00:00:00Z' }

  // Not the flag field's label, which is the form's question and may be
  // asked the other way round: that printed "⚠ Everything here is kosher".
  it('says a hechsher doesn’t cover everything, whatever the form calls the flag, with what isn’t on hover', () => {
    const category = makeCategory({ detailFields: [cert, partial] })
    const item = makeListing({ ...confirmed, cert: 'IKC', partial: true, partialNote: 'Only the bakery case' })
    expect(listingRowNote(item, category, FRIDAY_2PM)).toEqual({
      text: 'Not everything here is kosher',
      tone: 'caution',
      kind: 'exception',
      title: 'Only the bakery case',
    })
    expect(listingRowNote(makeListing({ ...confirmed, cert: 'IKC' }), category, FRIDAY_2PM)).toBeNull()
  })

  it('says nobody has confirmed a listing, only where the category flags it', () => {
    const category = makeCategory({ detailFields: [] })
    expect(listingRowNote(makeListing(), category, FRIDAY_2PM, { flagUnconfirmed: true })).toEqual({
      text: 'Not confirmed by anyone yet',
      tone: 'quiet',
      kind: 'exception',
    })
    expect(listingRowNote(makeListing(), category, FRIDAY_2PM, { flagUnconfirmed: false })).toBeNull()
    expect(listingRowNote(makeListing(confirmed), category, FRIDAY_2PM, { flagUnconfirmed: true })).toBeNull()
  })

  it('says a shul’s times aren’t confirmed, however recently Google synced it', () => {
    const category = makeCategory({ detailFields: [minyanim] })
    const shul = makeListing({ minyanim: [{ tefillah: 'mincha', time: '1:30pm', days: ['fri'] }], googleSyncedAt: '2026-10-02T06:00:00Z' })
    expect(listingRowNote(shul, category, FRIDAY_2PM)?.text).toBe('Times not confirmed by anyone yet')
    expect(listingRowNote({ ...shul, ...confirmed }, category, FRIDAY_2PM)).toBeNull()
  })

  it('gives a shul’s own note on its davening the line, after unconfirmed times', () => {
    const category = makeCategory({ detailFields: [minyanim] })
    const shul = makeListing({ ...confirmed, minyanim: [{ tefillah: 'mincha', time: 'Call to confirm', days: ['fri'] }] })
    expect(listingRowNote(shul, category, FRIDAY_2PM, { shulNote: 'Mincha today: call to confirm' })).toEqual({
      text: 'Mincha today: call to confirm',
      tone: 'quiet',
      kind: 'exception',
    })
    const unconfirmed = { ...shul, confirmedAt: undefined }
    expect(listingRowNote(unconfirmed, category, FRIDAY_2PM, { shulNote: 'Zoom' })?.text).toBe('Times not confirmed by anyone yet')
  })

  it('otherwise shows the admin’s note: a longer one quoted as someone’s report, a tagline as is', () => {
    const hotel = makeCategory({ detailFields: [notes] })
    expect(listingRowNote(makeListing({ ...confirmed, notes: 'Electronic keys, but reception will open the door' }), hotel, FRIDAY_2PM)).toEqual({
      text: '“Electronic keys, but reception will open the door”',
      tone: 'quote',
      kind: 'note',
    })
    const food = makeCategory({ detailFields: [tagline] })
    expect(listingRowNote(makeListing({ ...confirmed, s: 'Vegan pizzeria' }), food, FRIDAY_2PM)).toEqual({ text: 'Vegan pizzeria', tone: 'quiet', kind: 'note' })
  })

  it('puts the exception before the note: one line at most', () => {
    const category = makeCategory({ detailFields: [cert, partial, notes] })
    const item = makeListing({ ...confirmed, cert: 'IKC', partial: true, notes: 'Lovely' })
    expect(listingRowNote(item, category, FRIDAY_2PM)?.text).toBe('Not everything here is kosher')
  })
})

describe('candlesToday', () => {
  const zmanim = (over: Partial<ZmanimData>): ZmanimData =>
    ({ shabbos: { candleLighting: null, havdalah: null }, holidayPeriod: null, ...over }) as unknown as ZmanimData
  const friday = new Date(2026, 9, 2, 14, 0)
  const local = (h: number, m: number, day = 2) => new Date(2026, 9, day, h, m).toISOString()

  it('is tonight’s candle lighting on a Friday', () => {
    expect(candlesToday(zmanim({ shabbos: { candleLighting: { label: 'Friday', time: '6:10 PM', iso: local(18, 10) }, havdalah: null } }), friday)).toBe(18 * 60 + 10)
  })

  it('is erev Yom Tov’s, from the holiday’s own candle lightings', () => {
    const erev = new Date(2026, 9, 1, 14, 0)
    const yt = zmanim({
      shabbos: { candleLighting: { label: 'Friday', time: '6:10 PM', iso: local(18, 10) }, havdalah: null },
      holidayPeriod: {
        name: 'Sukkot',
        begins: { label: 'Thursday', time: '6:12 PM', iso: local(18, 12, 1) },
        candleLightings: [{ label: 'Thursday', time: '6:12 PM', iso: local(18, 12, 1) }],
        ends: { label: 'Saturday', time: '7:10 PM', iso: local(19, 10, 3) },
      },
    })
    expect(candlesToday(yt, erev)).toBe(18 * 60 + 12)
  })

  it('is nothing on another day, or before the zmanim arrive', () => {
    const thursday = new Date(2026, 9, 1, 14, 0)
    expect(candlesToday(zmanim({ shabbos: { candleLighting: { label: 'Friday', time: '6:10 PM', iso: local(18, 10) }, havdalah: null } }), thursday)).toBeNull()
    expect(candlesToday(null, friday)).toBeNull()
  })
})

describe('isVouchedFor', () => {
  it('is a person’s confirmation, or a Google refresh in the last two weeks', () => {
    expect(isVouchedFor(makeListing({ confirmedAt: '2025-01-01T00:00:00Z' }), FRIDAY_2PM)).toBe(true)
    expect(isVouchedFor(makeListing({ googleSyncedAt: '2026-09-25T06:00:00Z' }), FRIDAY_2PM)).toBe(true)
    // Google stopped refreshing it on Sep 10: it has lost the place.
    expect(isVouchedFor(makeListing({ googleSyncedAt: '2026-09-10T06:00:00Z' }), FRIDAY_2PM)).toBe(false)
    expect(isVouchedFor(makeListing(), FRIDAY_2PM)).toBe(false)
  })
})

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf("Shlomo's Fish Market")).toBe('SF')
    expect(initialsOf('Mekor Habracha')).toBe('MH')
  })

  it('skips a leading "The"', () => {
    expect(initialsOf('The Kosher Grill')).toBe('KG')
  })

  it('takes two letters of a one-word name', () => {
    expect(initialsOf('ALDI')).toBe('AL')
    expect(initialsOf('Goldie')).toBe('GO')
  })

  it('never comes back empty', () => {
    expect(initialsOf('—')).toBe('?')
  })
})
