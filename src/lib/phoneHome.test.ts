import { describe, expect, it } from 'vitest'
import type { CategoryField } from './categories'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { Eruv } from './eruv'
import { eruvSummary, openNowRows, rightNowDay, sourcesRead, sourcesSentence, trustFacts, trustLine } from './phoneHome'

const NY = 'America/New_York'
const DAY = 24 * 60 * 60 * 1000

describe('the trust line', () => {
  const food = makeCategory({ id: 'food' })
  const shuls = makeCategory({ id: 'shuls' })
  const now = Date.parse('2026-10-13T16:30:00Z')
  const synced = (id: string, daysAgo: number | null, category = 'food') =>
    makeListing({ id, category, googleSyncedAt: daysAgo === null ? undefined : new Date(now - daysAgo * DAY).toISOString() })

  it('counts the places, and those Google checked this week', () => {
    const facts = trustFacts([synced('a', 0.5), synced('b', 3), synced('c', 9), synced('d', null, 'shuls')], [food, shuls], now)
    expect(facts).toEqual({ places: 4, googleChecked: 3, checkedThisWeek: 2, dated: 3, checked: [] })
    expect(trustLine(facts)).toBe('4 places · checked with Google')
  })

  it('only places in a category the guide shows', () => {
    expect(trustFacts([synced('a', 1), synced('b', 1, 'hidden')], [food], now).places).toBe(1)
  })

  // A community that doesn't sync with Google, and one whose nightly check
  // has stopped: neither may say "every night".
  it('says nothing about Google where nothing is checked, or nothing this week', () => {
    expect(trustLine(trustFacts([synced('a', null), synced('b', null)], [food], now))).toBe('2 places')
    expect(trustLine(trustFacts([synced('a', 12), synced('b', null)], [food], now))).toBe('2 places')
  })

  // The user, Oct 17. A date is a person's confirmation or Google's update;
  // a place with neither says "Not confirmed by anyone yet", so the claim
  // waits for the last one (23 of 155 on the live site, Oct 17).
  it('“every listing dated” once every place has a date, and not before', () => {
    const confirmed = (id: string) => makeListing({ id, category: 'food', confirmedAt: new Date(now - 30 * DAY).toISOString() })
    expect(trustLine(trustFacts([synced('a', 1), confirmed('b')], [food], now))).toBe('2 places · every listing dated')
    expect(trustLine(trustFacts([synced('a', 1), confirmed('b'), synced('c', null)], [food], now))).toBe('3 places · checked with Google')
    expect(trustLine(trustFacts([], [food], now))).toBe('0 places')
  })

  // The server render has no clock: it says what the data says, and the
  // week is counted once the page knows what day it is.
  it('before there’s a clock, says Google if anything was ever checked', () => {
    const facts = trustFacts([synced('a', 12), synced('b', null)], [food], null)
    expect(facts.checkedThisWeek).toBeNull()
    expect(trustLine(facts)).toBe('2 places · checked with Google')
  })
})

describe('right now, on a weekday: what’s open', () => {
  const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours' }
  const meatDairy: CategoryField = {
    key: 't',
    label: 'Type',
    type: 'select',
    filterable: true,
    options: [
      { value: 'Meat', label: 'Meat' },
      { value: 'Dairy', label: 'Dairy' },
      { value: 'Parve', label: 'Parve' },
    ],
  }
  const kosherType: CategoryField = {
    key: 'isKosher',
    label: 'Kosher Store',
    type: 'select',
    filterable: true,
    options: [
      { value: 'Kosher Store', label: 'Kosher Store' },
      { value: 'Kosher Items', label: 'Kosher Items' },
      { value: 'Other', label: 'Other' },
    ],
  }
  const food = makeCategory({ id: 'food', label: 'Food', detailFields: [hours, meatDairy] })
  const grocery = makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [hours, kosherType] })
  const hotels = makeCategory({ id: 'hotels', label: 'Hotels', detailFields: [hours] })
  const shuls = makeCategory({ id: 'shuls', label: 'Synagogues', detailFields: [] })
  const eruv = makeCategory({ id: 'eruv', kind: 'eruv', detailFields: [hours] })
  // Open every day, 9 AM to 9 PM.
  const open = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '21:00' }]))
  const shut = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '06:00', close: '07:00' }]))
  const place = (id: string, category: string, h: unknown, extra: Record<string, unknown> = {}) => makeListing({ id, category, hours: h, ...extra })
  // Local time, as every hours test: open is read off the device's clock.
  const lunch = new Date(2026, 9, 13, 12, 30)

  it('the first two categories with hours, in the admin’s order, broken down by their first pick-list', () => {
    const listings = [
      place('a', 'food', open, { t: 'Meat' }),
      place('b', 'food', open, { t: 'Dairy' }),
      place('c', 'food', open, { t: 'Dairy' }),
      place('d', 'food', shut, { t: 'Parve' }),
      place('e', 'grocery', open, { isKosher: 'Kosher Store' }),
      place('f', 'grocery', open, { isKosher: 'Kosher Items' }),
      place('g', 'grocery', open, { isKosher: 'Kosher Items' }),
      place('h', 'hotels', open),
    ]
    const rows = openNowRows(listings, [shuls, eruv, food, grocery, hotels], lunch)
    expect(rows.map((r) => [r.category.id, r.open, r.parts])).toEqual([
      ['food', 3, ['1 meat', '2 dairy']],
      ['grocery', 3, ['1 kosher store', '2 kosher items']],
    ])
  })

  it('a category with nothing open says nothing, and doesn’t hand its place to the next', () => {
    const rows = openNowRows([place('a', 'food', shut), place('b', 'grocery', open), place('c', 'hotels', open)], [food, grocery, hotels], lunch)
    expect(rows.map((r) => r.category.id)).toEqual(['grocery'])
  })

  it('a category whose places say no hours is skipped; one without a pick-list has no breakdown', () => {
    const rows = openNowRows([place('a', 'food', undefined), place('b', 'grocery', open), place('c', 'hotels', open)], [food, grocery, hotels], lunch)
    expect(rows.map((r) => [r.category.id, r.parts])).toEqual([
      ['grocery', []],
      ['hotels', []],
    ])
  })

  // The user, Oct 17: that we know what's on the shelf is the point, and a
  // small honest number grows. Counted across every store, open or not,
  // each item once whatever its spelling, in the admin's word for one.
  it('a category that keeps a list of items says how many different ones it tracks instead', () => {
    const items: CategoryField = { key: 'm', label: 'Kosher items available', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' }
    const stores = makeCategory({ id: 'grocery', detailFields: [hours, kosherType, items] })
    const listings = [
      place('a', 'grocery', open, { isKosher: 'Kosher Store', m: ['Challah', 'Wine'] }),
      place('b', 'grocery', open, { isKosher: 'Kosher Items', m: ['challah ', 'Chicken'], m_sometimes: ['Brisket'] }),
      place('c', 'grocery', shut, { m: ['Deli'] }),
    ]
    expect(openNowRows(listings, [stores], lunch)[0].parts).toEqual(['5 kosher items tracked'])
    const dishes = makeCategory({ id: 'grocery', detailFields: [hours, { ...items, countLabel: 'dish' }] })
    expect(openNowRows([place('a', 'grocery', open, { m: ['Pizza'] }), place('b', 'grocery', open, { m: ['Falafel'] })], [dishes], lunch)[0].parts).toEqual(['2 dishes tracked'])
    // None listed yet: the pick-list's breakdown, as before.
    expect(openNowRows([place('a', 'grocery', open, { isKosher: 'Kosher Store' })], [stores], lunch)[0].parts).toEqual(['1 kosher store'])
  })

  it('at most three parts', () => {
    const four: CategoryField = { ...meatDairy, options: ['A', 'B', 'C', 'D'].map((v) => ({ value: v, label: v })) }
    const cat = makeCategory({ id: 'food', detailFields: [hours, four] })
    const rows = openNowRows(['A', 'B', 'C', 'D'].map((t, i) => place(`p${i}`, 'food', open, { t })), [cat], lunch)
    expect(rows[0].parts).toEqual(['1 a', '1 b', '1 c'])
  })
})

describe('the label over Right now', () => {
  // No Hebrew date (the user, Oct 18: the phone home read as too Jewish for
  // everyone it serves).
  it('just the weekday', () => {
    expect(rightNowDay(Date.parse('2026-10-13T16:30:00Z'), NY)).toBe('Tuesday')
  })

  it('Saturday is Shabbos', () => {
    expect(rightNowDay(Date.parse('2026-10-17T15:00:00Z'), NY)).toBe('Shabbos')
  })

  it('nothing before there’s a clock', () => {
    expect(rightNowDay(null, NY)).toBeNull()
  })
})

describe('the eruvim, on the Friday card, for someone who hasn’t said where they are', () => {
  // Friday Oct 16, 2026, 1:30 PM in New York; candles 6:01 PM.
  const now = new Date('2026-10-16T13:30:00-04:00')
  const candles = Date.parse('2026-10-16T18:01:00-04:00')
  const checked = '2026-10-16T13:25:00-04:00'
  const eruv = (name: string, over: Partial<Eruv> = {}): Eruv => ({
    id: name.toLowerCase(),
    name: `${name} Eruv`,
    covers: null,
    website: null,
    hotline: null,
    alertsUrl: null,
    statusUrl: `https://${name.toLowerCase()}.example/`,
    statusDated: false,
    status: 'up',
    statusWords: 'Up',
    statusPostedOn: null,
    statusCheckedAt: checked,
    statusErrorAt: null,
    statusError: null,
    ...over,
  })
  const phoneOnly = (name: string) => eruv(name, { statusUrl: null, status: null, statusCheckedAt: null, hotline: '(215) 333-ERUV' })

  it('counts them by what each status honestly is: a hotline-only eruv is “by phone”', () => {
    const all = [eruv('Center City'), eruv('University City'), eruv('Lower Merion', { statusDated: true, statusPostedOn: '2026-10-16' }), phoneOnly('Northeast'), phoneOnly('Elkins Park')]
    expect(eruvSummary(all, now, NY, candles)).toEqual({
      down: null,
      parts: [
        { tone: 'green', text: '3 up' },
        { tone: 'grey', text: '2 by phone' },
      ],
    })
  })

  it('one that’s down is named first, not counted', () => {
    const all = [eruv('Center City'), eruv('Lower Merion', { status: 'down' }), phoneOnly('Northeast')]
    expect(eruvSummary(all, now, NY, candles)).toEqual({
      down: 'Lower Merion Eruv is down',
      parts: [
        { tone: 'green', text: '1 up' },
        { tone: 'grey', text: '1 by phone' },
      ],
    })
    expect(eruvSummary([eruv('A', { status: 'down' }), eruv('B', { status: 'down' })], now, NY, candles)?.down).toBe('A Eruv and B Eruv are down')
  })

  // Friday morning, before an eruv that dates its post has posted; and one
  // whose page couldn't be read.
  it('not posted yet this week, and couldn’t be read, are said as such', () => {
    const all = [eruv('Lower Merion', { statusDated: true, statusPostedOn: '2026-10-09' }), eruv('Center City', { statusErrorAt: '2026-10-16T13:26:00-04:00', statusError: '404' })]
    expect(eruvSummary(all, now, NY, candles)?.parts).toEqual([
      { tone: 'amber', text: '1 not posted yet' },
      { tone: 'amber', text: '1 couldn’t be read' },
    ])
  })

  it('nothing without eruvim', () => {
    expect(eruvSummary([], now, NY, candles)).toBeNull()
  })
})

describe('how this guide stays right: what it checked this week', () => {
  const now = Date.parse('2026-10-16T17:30:00Z')
  const ago = (days: number) => new Date(now - days * DAY).toISOString()
  const facts = { places: 155, googleChecked: 135, checkedThisWeek: 129, dated: 132, checked: [] }
  const from = (days: number) => ({ from: 'A source', at: ago(days) })
  const shuls = makeCategory({ id: 'shuls' })
  const mikvahs = makeCategory({ id: 'mikvahs', detailFields: [{ key: 'women', label: 'Women', type: 'boolean' }, { key: 'womenHours', label: 'Hours', type: 'hours', audienceKey: 'women' }] })
  const hospitals = makeCategory({ id: 'hospitals', detailFields: [{ key: 'call', label: 'Who to call', type: 'contacts' }] })
  const food = makeCategory({ id: 'food' })
  const cats = [shuls, mikvahs, hospitals, food]

  // The user, Oct 23: everything the checks read, each by the dates it left
  // on the places (boxDates.ts), and only this week's.
  it('reads off the places what each check dated this week', () => {
    const listings = [
      makeListing({ id: 's', category: 'shuls', sectionFrom: { weekday: from(0.5), contact: from(0.5) } }),
      makeListing({ id: 'm', category: 'mikvahs', sectionFrom: { women: from(1) } }),
      makeListing({ id: 'h', category: 'hospitals', sectionFrom: { call: from(9) } }),
      makeListing({ id: 'k', category: 'food', sectionFrom: { kosher: from(2) }, itemMenu: { dishes: { Kugel: ago(3) } } }),
    ]
    expect(trustFacts(listings, cats, now).checked).toEqual(['times', 'mikvah', 'kosher', 'menus'])
    expect(trustFacts(listings, cats, null).checked).toEqual([])
  })

  it('a place dated by a check counts as dated', () => {
    expect(trustFacts([makeListing({ id: 'k', category: 'food', sectionConfirmed: { kosher: ago(1) }, sectionFrom: { kosher: from(1) } })], cats, now).dated).toBe(1)
  })

  it('names everything checked, no source, then Google', () => {
    const read = sourcesRead({ ...facts, checked: ['times', 'mikvah', 'kosher', 'menus', 'hospitals'] }, [ago(0.01), null], now)
    expect(read).toEqual({ google: true, checks: ['times', 'mikvah', 'kosher', 'menus', 'hospitals', 'eruv'] })
    expect(sourcesSentence(read)).toBe('Minyan times, mikvah hours, kosher certifications, menus, hospitals and eruv status. Places on Google Maps are checked against Google.')
  })

  it('a check that stopped over a week ago claims nothing', () => {
    const read = sourcesRead(facts, [null, ago(8)], now)
    expect(read).toEqual({ google: true, checks: [] })
    expect(sourcesSentence(read)).toBe('Places on Google Maps are checked against Google.')
  })

  // The user, Oct 23: the sheet said "Menus and eruv status" while every
  // shul's and mikvah's page, Refuah and both kosher lists were read each
  // morning. A read that found a difference dates no box, so the checks
  // that ran say it themselves.
  it('names a check that read its pages this week, though it dated no box', () => {
    const ran = [
      { kind: 'times' as const, at: ago(0.2) },
      { kind: 'mikvah' as const, at: ago(1) },
      { kind: 'hospitals' as const, at: ago(0.2) },
      { kind: 'kosher' as const, at: ago(6) },
      { kind: 'eruv' as const, at: ago(9) },
    ]
    const read = sourcesRead({ ...facts, checked: ['menus'] }, [], now, ran)
    expect(read.checks).toEqual(['times', 'mikvah', 'kosher', 'menus', 'hospitals'])
    expect(sourcesSentence(read)).toBe('Minyan times, mikvah hours, kosher certifications, menus and hospitals. Places on Google Maps are checked against Google.')
  })

  it('without Google, just what was checked', () => {
    expect(sourcesSentence({ google: false, checks: ['kosher'] })).toBe('Kosher certifications.')
    expect(sourcesSentence({ google: false, checks: ['times', 'eruv'] })).toBe('Minyan times and eruv status.')
  })

  it('nothing read at all: no sentence, and Google only when it checked this week', () => {
    expect(sourcesRead({ ...facts, checkedThisWeek: 0 }, [], now).google).toBe(false)
    expect(sourcesSentence({ google: false, checks: [] })).toBeNull()
  })

  // A phone a few minutes slow sees a check made just now as still to come.
  it('a check a few minutes ahead of the phone’s clock still counts; a day ahead doesn’t', () => {
    expect(sourcesRead(facts, [new Date(now + 3 * 60_000).toISOString()], now).checks).toEqual(['eruv'])
    expect(sourcesRead(facts, [new Date(now + DAY).toISOString()], now).checks).toEqual([])
  })
})
