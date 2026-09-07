import { afterEach, describe, expect, it } from 'vitest'
import { secularHoliday, secularHolidayTomorrow } from './secularHolidays'

// Dates checked against a calendar, not derived from the implementation.
describe('secularHoliday', () => {
  it('matches fixed-date holidays', () => {
    expect(secularHoliday(new Date(2026, 0, 1))).toBe("New Year's Day")
    expect(secularHoliday(new Date(2026, 6, 4))).toBe('Independence Day')
    expect(secularHoliday(new Date(2026, 5, 19))).toBe('Juneteenth')
    expect(secularHoliday(new Date(2026, 10, 11))).toBe('Veterans Day')
    expect(secularHoliday(new Date(2026, 11, 25))).toBe('Christmas Day')
  })

  it('matches nth-weekday holidays', () => {
    // 3rd Monday of January 2026 is the 19th.
    expect(secularHoliday(new Date(2026, 0, 19))).toBe('Martin Luther King Jr. Day')
    // 3rd Monday of February 2026 is the 16th.
    expect(secularHoliday(new Date(2026, 1, 16))).toBe("Presidents' Day")
    // 1st Monday of September 2026 is the 7th.
    expect(secularHoliday(new Date(2026, 8, 7))).toBe('Labor Day')
    // 2nd Monday of October 2026 is the 12th.
    expect(secularHoliday(new Date(2026, 9, 12))).toBe('Columbus Day')
    // 4th Thursday of November 2026 is the 26th.
    expect(secularHoliday(new Date(2026, 10, 26))).toBe('Thanksgiving')
  })

  it('handles "last weekday of month" for Memorial Day', () => {
    // May 2026 ends on a Sunday the 31st, so the last Monday is the 25th —
    // the case a naive "4th Monday" rule gets wrong in five-Monday months.
    expect(secularHoliday(new Date(2026, 4, 25))).toBe('Memorial Day')
    expect(secularHoliday(new Date(2026, 4, 18))).toBeNull()
    // 2027's May has its last Monday on the 31st itself.
    expect(secularHoliday(new Date(2027, 4, 31))).toBe('Memorial Day')
  })

  it('returns null on ordinary days, including near-misses', () => {
    expect(secularHoliday(new Date(2026, 6, 3))).toBeNull()
    expect(secularHoliday(new Date(2026, 6, 5))).toBeNull()
    expect(secularHoliday(new Date(2026, 10, 19))).toBeNull() // Thu, but the 3rd
    expect(secularHoliday(new Date(2026, 7, 29))).toBeNull()
  })
})

describe('secularHolidayTomorrow', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('names the holiday when the calendar day after `now` is one', () => {
    // Sep 6 2026, noon UTC — tomorrow (community timezone) is Sep 7, Labor
    // Day (1st Monday of September 2026, per the fixed-holiday tests above).
    const now = new Date('2026-09-06T12:00:00Z').getTime()
    expect(secularHolidayTomorrow(now, 'America/New_York')).toBe('Labor Day')
  })

  it('returns null when tomorrow is an ordinary day', () => {
    const now = new Date('2026-09-05T12:00:00Z').getTime()
    expect(secularHolidayTomorrow(now, 'America/New_York')).toBeNull()
  })

  // Same class of bug this module's sibling helpers (dayAndMinutesInTimezone)
  // already guard against: reading Date getters directly uses the MACHINE's
  // own timezone, not the one passed in. Picked so the two disagree on which
  // calendar day "tomorrow" even is: 11:30pm Sep 6 in New York is 3:30am Sep
  // 7 UTC, so "+24h, then read in Tokyo (UTC+9)" lands on Sep 8 — a wrong
  // answer (not a holiday) a naive `new Date(now + 24h).getDate()` would
  // give, distinct from the correct one (Sep 7, Labor Day) this asserts.
  it('uses the given timezone, not the machine\'s own', () => {
    process.env.TZ = 'Asia/Tokyo'
    const now = new Date('2026-09-06T23:30:00-04:00').getTime()
    expect(secularHolidayTomorrow(now, 'America/New_York')).toBe('Labor Day')
  })
})
