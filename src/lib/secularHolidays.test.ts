import { describe, expect, it } from 'vitest'
import { secularHoliday } from './secularHolidays'

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
