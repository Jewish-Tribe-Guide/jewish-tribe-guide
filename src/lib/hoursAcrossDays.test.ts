import { describe, expect, it } from 'vitest'
import { formatTodayHours, getOpenStatus, hoursClosing, hoursNextOpening, hoursOpenNow } from './hours'

// Nov 18 public review, items 9 and 10. Open/Closed read the visitor's own
// clock while the shul times beside it read Philly's; a place open until
// 2 AM said "11:59 PM" and Closed after midnight; a lunch break read Open.

const at = (iso: string) => new Date(iso)

describe('hours read in the place’s own time', () => {
  const nineToFive = { wed: { open: '09:00', close: '17:00' } }
  // 10:00 in Philadelphia on a Wednesday; 7:00 in Los Angeles.
  const tenEastern = at('2026-06-24T14:00:00Z')

  it('says open by the community’s clock, whatever the device says', () => {
    expect(hoursOpenNow(nineToFive, tenEastern, 'America/New_York')).toBe(true)
    expect(hoursOpenNow(nineToFive, tenEastern, 'America/Los_Angeles')).toBe(false)
    expect(hoursNextOpening(nineToFive, tenEastern, 'America/Los_Angeles')).toBe('9 AM')
  })

  it('getOpenStatus takes the timezone too', () => {
    expect(getOpenStatus({ hours: nineToFive }, ['hours'], tenEastern, 'America/Los_Angeles').isOpen).toBe(false)
  })
})

describe('a close past midnight', () => {
  const lateFriday = { fri: { open: '18:00', close: '02:00' }, sat: null }
  // Saturday 1:00 AM and 3:00 AM in Philadelphia (EDT).
  const oneAm = at('2026-06-27T05:00:00Z')
  const threeAm = at('2026-06-27T07:00:00Z')
  const fridayEleven = at('2026-06-27T03:00:00Z')

  it('is still open at 1 AM, closing at 2 AM, and closed at 3', () => {
    expect(hoursOpenNow(lateFriday, oneAm, 'America/New_York')).toBe(true)
    expect(hoursClosing(lateFriday, 60, oneAm, 'America/New_York')).toEqual({ closesSoon: true, closeLabel: '2:00 AM' })
    expect(hoursOpenNow(lateFriday, threeAm, 'America/New_York')).toBe(false)
  })

  it('is open late Friday, and not closing soon three hours out', () => {
    expect(hoursClosing(lateFriday, 60, fridayEleven, 'America/New_York')).toEqual({ closesSoon: false, closeLabel: '2:00 AM' })
  })
})

describe('a day with a break', () => {
  const lunchAndDinner = {
    tue: { open: '11:30', close: '22:00', periods: [{ open: '11:30', close: '14:30' }, { open: '17:00', close: '22:00' }] },
  }
  // Tuesday 3:30 PM and 12:00 PM in Philadelphia (EDT).
  const afternoon = at('2026-06-23T19:30:00Z')
  const noon = at('2026-06-23T16:00:00Z')

  it('is closed over the break and opens again at 5', () => {
    expect(hoursOpenNow(lunchAndDinner, afternoon, 'America/New_York')).toBe(false)
    expect(hoursNextOpening(lunchAndDinner, afternoon, 'America/New_York')).toBe('5 PM')
  })

  it('closes at the end of lunch, not dinner, when open at noon', () => {
    expect(hoursClosing(lunchAndDinner, 60, noon, 'America/New_York')?.closeLabel).toBe('2:30 PM')
  })

  it('says both ranges for today', () => {
    expect(formatTodayHours(lunchAndDinner, noon, 'America/New_York')).toBe('Today: 11:30 AM – 2:30 PM, 5:00 PM – 10:00 PM')
  })
})
