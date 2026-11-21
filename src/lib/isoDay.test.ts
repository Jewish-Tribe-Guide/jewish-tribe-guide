import { describe, expect, it } from 'vitest'
import { addDays, dayInTimezone } from './isoDay'

describe('addDays', () => {
  it('walks across a month, a year and a leap day, both ways', () => {
    expect(addDays('2026-11-20', 1)).toBe('2026-11-21')
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-11-20', 0)).toBe('2026-11-20')
    expect(addDays('2026-11-20', 400)).toBe('2027-12-25')
  })

  it('is calendar days, whatever the clocks do (the nights they change)', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
  })
})

describe('dayInTimezone', () => {
  it('is the date on that clock, not the server’s', () => {
    // 3:30am in London on Nov 20 is still Nov 19 in New York.
    const at = Date.parse('2026-11-20T03:30:00Z')
    expect(dayInTimezone('America/New_York', at)).toBe('2026-11-19')
    expect(dayInTimezone('Europe/London', at)).toBe('2026-11-20')
    // Asked again, from the formatter it keeps for each zone.
    expect(dayInTimezone('America/New_York', at)).toBe('2026-11-19')
  })

  it('takes a time in ms, a Date or an ISO string', () => {
    const iso = '2026-11-20T17:00:00Z'
    expect(dayInTimezone('America/New_York', iso)).toBe('2026-11-20')
    expect(dayInTimezone('America/New_York', new Date(iso))).toBe('2026-11-20')
    expect(dayInTimezone('America/New_York', Date.parse(iso))).toBe('2026-11-20')
  })

  it('says a time that isn’t one, rather than throwing', () => {
    expect(dayInTimezone('America/New_York', 'not a time')).toBe('Invalid Date')
  })
})
