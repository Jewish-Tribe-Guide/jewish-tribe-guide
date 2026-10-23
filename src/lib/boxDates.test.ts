import { describe, expect, it } from 'vitest'
import { makeListing } from '@/test/providerFixtures'
import { boxDate, confirmedAnywhere, confirmedByFor, hasAnyDate, sectionConfirmedAt, sectionSource, timesConfirmedAt } from './boxDates'

// The user, Oct 23: "We're dating what we're checking. We're not dating a
// whole listing." Each box shows the date of what it shows.
const OCT = (d: number) => `2026-10-${String(d).padStart(2, '0')}T12:00:00.000Z`

describe('a box’s date', () => {
  // Sweet Box, Oct 23: Mekor Habracha read its hechsher and its description
  // said "Confirmed by Mekor Habracha, Oct 23".
  it('a date a check gave the whole listing (before Oct 23) is no box’s', () => {
    const bakery = makeListing({ confirmedAt: OCT(23), confirmedFrom: { from: 'Mekor Habracha', at: OCT(23) } })
    expect(sectionConfirmedAt(bakery, 'description')).toBeUndefined()
    expect(boxDate(bakery, 'description')).toEqual({ confirmedAt: undefined, source: undefined, by: undefined })
  })

  it('a check’s date is its box’s alone, said by name', () => {
    const shul = makeListing({ sectionConfirmed: { weekday: OCT(23) }, sectionFrom: { weekday: { from: 'Lower Merion Synagogue', at: OCT(23) } } })
    expect(boxDate(shul, 'weekday')).toEqual({ confirmedAt: OCT(23), source: { from: 'Lower Merion Synagogue', at: OCT(23) }, by: undefined })
    expect(sectionConfirmedAt(shul, 'contact')).toBeUndefined()
  })

  it('a visitor’s Yes after the check is the visitor’s', () => {
    const shul = makeListing({ sectionConfirmed: { weekday: OCT(23) }, sectionFrom: { weekday: { from: 'A shul', at: OCT(20) } } })
    expect(sectionSource(shul, 'weekday')).toBeUndefined()
    expect(confirmedByFor(shul, 'weekday')).toEqual({ by: 'visitor', at: OCT(23) })
  })

  it('a person’s date for the whole place still stands for any box with none later', () => {
    const by = { by: 'edit' as const, at: OCT(16) }
    const place = makeListing({ confirmedAt: OCT(16), confirmedBy: by, sectionConfirmed: { weekday: OCT(10) } })
    expect(boxDate(place, 'about')).toEqual({ confirmedAt: OCT(16), source: undefined, by })
    expect(boxDate(place, 'weekday')).toEqual({ confirmedAt: OCT(16), source: undefined, by })
  })
})

describe('a shul’s times', () => {
  it('the later of its weekday and Shabbos boxes, never another box’s', () => {
    expect(timesConfirmedAt(makeListing({ sectionConfirmed: { weekday: OCT(3), shabbos: OCT(9), about: OCT(20) } }))).toBe(OCT(9))
    expect(timesConfirmedAt(makeListing({ sectionConfirmed: { about: OCT(20) } }))).toBeUndefined()
    expect(timesConfirmedAt(makeListing({ confirmedAt: OCT(20), confirmedFrom: { from: 'A shul', at: OCT(20) } }))).toBeUndefined()
  })
})

describe('whether a place carries a date at all', () => {
  it('a box’s, a dish’s, a person’s, or Google’s', () => {
    expect(confirmedAnywhere(makeListing({ sectionConfirmed: { kosher: OCT(1) } }))).toBe(true)
    expect(confirmedAnywhere(makeListing({ itemMenu: { dishes: { Kugel: OCT(1) } } }))).toBe(true)
    expect(confirmedAnywhere(makeListing({ confirmedAt: OCT(1) }))).toBe(true)
    expect(confirmedAnywhere(makeListing({ googleSyncedAt: OCT(1) }))).toBe(false)
    expect(hasAnyDate(makeListing({ googleSyncedAt: OCT(1) }))).toBe(true)
    expect(hasAnyDate(makeListing({}))).toBe(false)
  })
})
