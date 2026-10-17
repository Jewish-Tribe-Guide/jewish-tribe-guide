import { describe, expect, it } from 'vitest'
import type { ZmanimData } from '@/types'
import type { CategoryField } from './categories'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { openNowRows, rightNowDay, trustFacts, trustLine } from './phoneHome'

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
    expect(facts).toEqual({ places: 4, googleChecked: 3, checkedThisWeek: 2 })
    expect(trustLine(facts)).toBe('4 places · hours checked with Google every night')
  })

  it('only places in a category the guide shows', () => {
    expect(trustFacts([synced('a', 1), synced('b', 1, 'hidden')], [food], now).places).toBe(1)
  })

  // A community that doesn't sync with Google, and one whose nightly check
  // has stopped: neither may say "every night".
  it('says nothing about Google where nothing is checked, or nothing this week', () => {
    expect(trustLine(trustFacts([synced('a', null), synced('b', null)], [food], now))).toBe('2 places')
    expect(trustLine(trustFacts([synced('a', 12)], [food], now))).toBe('1 place')
  })

  // The server render has no clock: it says what the data says, and the
  // week is counted once the page knows what day it is.
  it('before there’s a clock, says Google if anything was ever checked', () => {
    const facts = trustFacts([synced('a', 12)], [food], null)
    expect(facts.checkedThisWeek).toBeNull()
    expect(trustLine(facts)).toBe('1 place · hours checked with Google every night')
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

  it('at most three parts', () => {
    const four: CategoryField = { ...meatDairy, options: ['A', 'B', 'C', 'D'].map((v) => ({ value: v, label: v })) }
    const cat = makeCategory({ id: 'food', detailFields: [hours, four] })
    const rows = openNowRows(['A', 'B', 'C', 'D'].map((t, i) => place(`p${i}`, 'food', open, { t })), [cat], lunch)
    expect(rows[0].parts).toEqual(['1 a', '1 b', '1 c'])
  })
})

describe('the label over Right now', () => {
  const zmanim = (hebrewDate: string, dayOfWeek: number) => ({ hebrewDate, dayOfWeek }) as ZmanimData

  it('the weekday and the Hebrew date without its year', () => {
    expect(rightNowDay(Date.parse('2026-10-13T16:30:00Z'), NY, zmanim('2 Cheshvan 5787', 2))).toBe('Tuesday · 2 Cheshvan')
  })

  it('Saturday is Shabbos; yesterday’s zmanim give no Hebrew date', () => {
    expect(rightNowDay(Date.parse('2026-10-17T15:00:00Z'), NY, zmanim('5 Cheshvan 5787', 5))).toBe('Shabbos')
  })

  it('nothing before there’s a clock', () => {
    expect(rightNowDay(null, NY, null)).toBeNull()
  })
})
