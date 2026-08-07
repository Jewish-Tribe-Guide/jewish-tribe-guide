import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fmt12,
  formatHoursSummary,
  formatTodayHours,
  formatWeekHours,
  getOpenStatus,
  hoursClosing,
  hoursOpenNow,
  isStructuredHours,
  placesApiHoursToStructured,
  type StructuredHours,
} from './hours'

// Everything here reads `new Date()`, so each test pins the clock. The local
// timezone matters: hoursOpenNow uses getDay()/getHours(), i.e. the *viewer's*
// clock, which is the intended behavior (a visitor standing outside the store
// cares about their own wall time). Tests set a fixed instant and assert
// against what that instant is locally.
//
// 2026-06-24 is a Wednesday. Times below are constructed with the local-time
// `new Date(y, m, d, h, m)` form so they don't drift with the machine's zone.
const WEDNESDAY = (h: number, m = 0) => new Date(2026, 5, 24, h, m, 0)
const SUNDAY = (h: number, m = 0) => new Date(2026, 5, 28, h, m, 0)

const WEEKDAY_9_TO_5: StructuredHours = {
  sun: null,
  mon: { open: '09:00', close: '17:00' },
  tue: { open: '09:00', close: '17:00' },
  wed: { open: '09:00', close: '17:00' },
  thu: { open: '09:00', close: '17:00' },
  fri: { open: '09:00', close: '14:00' },
  sat: null,
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('isStructuredHours', () => {
  it('accepts an hours object', () => {
    expect(isStructuredHours({ mon: { open: '09:00', close: '17:00' } })).toBe(true)
  })

  it('rejects a legacy free-text value', () => {
    expect(isStructuredHours('Mon-Fri 9-5')).toBe(false)
  })

  it('rejects arrays and nullish values', () => {
    expect(isStructuredHours([])).toBe(false)
    expect(isStructuredHours(null)).toBe(false)
    expect(isStructuredHours(undefined)).toBe(false)
  })
})

describe('fmt12', () => {
  it('formats midnight and noon without a zero or 24 hour', () => {
    expect(fmt12('00:00')).toBe('12:00 AM')
    expect(fmt12('12:00')).toBe('12:00 PM')
  })

  it('formats morning and evening times', () => {
    expect(fmt12('09:05')).toBe('9:05 AM')
    expect(fmt12('17:30')).toBe('5:30 PM')
    expect(fmt12('23:59')).toBe('11:59 PM')
  })
})

describe('hoursOpenNow', () => {
  it('is open during the day’s window', () => {
    vi.setSystemTime(WEDNESDAY(12))
    expect(hoursOpenNow(WEEKDAY_9_TO_5)).toBe(true)
  })

  it('is closed before opening and after closing', () => {
    vi.setSystemTime(WEDNESDAY(8, 59))
    expect(hoursOpenNow(WEEKDAY_9_TO_5)).toBe(false)
    vi.setSystemTime(WEDNESDAY(17, 1))
    expect(hoursOpenNow(WEEKDAY_9_TO_5)).toBe(false)
  })

  it('treats an explicitly null day as closed', () => {
    vi.setSystemTime(SUNDAY(12))
    expect(hoursOpenNow(WEEKDAY_9_TO_5)).toBe(false)
  })

  it('treats an absent day as closed', () => {
    vi.setSystemTime(SUNDAY(12))
    expect(hoursOpenNow({ mon: { open: '09:00', close: '17:00' } })).toBe(false)
  })

  it('returns null — "can’t tell" — for a legacy text value', () => {
    vi.setSystemTime(WEDNESDAY(12))
    expect(hoursOpenNow('Mon-Fri 9-5')).toBeNull()
    expect(hoursOpenNow(undefined)).toBeNull()
  })

  it('returns null when the day exists but its times are blank', () => {
    vi.setSystemTime(WEDNESDAY(12))
    expect(hoursOpenNow({ wed: { open: '', close: '' } })).toBeNull()
  })

  // Documents the 23:59 sentinel described in the module comment: hours that
  // roll past midnight are stored as closing at 23:59 rather than as a wrapping
  // window, because the comparison here is a simple range check.
  it('treats a 23:59 close as open through the end of the day', () => {
    vi.setSystemTime(WEDNESDAY(23, 30))
    expect(hoursOpenNow({ wed: { open: '18:00', close: '23:59' } })).toBe(true)
  })
})

describe('hoursClosing', () => {
  it('flags a place inside the closing-soon window', () => {
    vi.setSystemTime(WEDNESDAY(16, 30))
    expect(hoursClosing(WEEKDAY_9_TO_5)).toEqual({ closesSoon: true, closeLabel: '5:00 PM' })
  })

  it('does not flag a place that is open but not closing soon', () => {
    vi.setSystemTime(WEDNESDAY(12))
    expect(hoursClosing(WEEKDAY_9_TO_5)).toEqual({ closesSoon: false, closeLabel: '5:00 PM' })
  })

  it('honours a custom window', () => {
    vi.setSystemTime(WEDNESDAY(15, 30))
    expect(hoursClosing(WEEKDAY_9_TO_5, 30)?.closesSoon).toBe(false)
    expect(hoursClosing(WEEKDAY_9_TO_5, 120)?.closesSoon).toBe(true)
  })

  it('returns null when the place is not open right now', () => {
    vi.setSystemTime(WEDNESDAY(20))
    expect(hoursClosing(WEEKDAY_9_TO_5)).toBeNull()
  })

  it('never calls a 23:59 close "closing soon"', () => {
    vi.setSystemTime(WEDNESDAY(23, 30))
    expect(hoursClosing({ wed: { open: '18:00', close: '23:59' } })).toEqual({
      closesSoon: false,
      closeLabel: '11:59 PM',
    })
  })
})

describe('getOpenStatus', () => {
  const MENS: StructuredHours = { wed: { open: '20:00', close: '22:00' } }
  const WOMENS: StructuredHours = { wed: { open: '09:00', close: '11:00' } }

  it('reports open when any one of several hours fields is open', () => {
    vi.setSystemTime(WEDNESDAY(20, 30))
    const status = getOpenStatus({ mensHours: MENS, womensHours: WOMENS }, ['mensHours', 'womensHours'])
    expect(status.isOpen).toBe(true)
    expect(status.closing).toEqual({ closesSoon: false, closeLabel: '10:00 PM' })
  })

  it('carries the closing-soon flag through from the field that is open', () => {
    // 60 minutes out is inside the default window, inclusive.
    vi.setSystemTime(WEDNESDAY(21))
    const status = getOpenStatus({ mensHours: MENS }, ['mensHours'])
    expect(status.closing).toEqual({ closesSoon: true, closeLabel: '10:00 PM' })
  })

  it('reports closed when every hours field is outside its window', () => {
    vi.setSystemTime(WEDNESDAY(15))
    const status = getOpenStatus({ mensHours: MENS, womensHours: WOMENS }, ['mensHours', 'womensHours'])
    expect(status.isOpen).toBe(false)
    expect(status.closing).toBeNull()
  })

  it('ignores fields that are missing or legacy text', () => {
    vi.setSystemTime(WEDNESDAY(21))
    const status = getOpenStatus({ mensHours: MENS, womensHours: 'call ahead' }, [
      'mensHours',
      'womensHours',
      'keilimHours',
    ])
    expect(status.isOpen).toBe(true)
  })
})

describe('formatTodayHours', () => {
  it('formats today’s window', () => {
    vi.setSystemTime(WEDNESDAY(12))
    expect(formatTodayHours(WEEKDAY_9_TO_5)).toBe('Today: 9:00 AM – 5:00 PM')
  })

  it('says closed today for a null day', () => {
    vi.setSystemTime(SUNDAY(12))
    expect(formatTodayHours(WEEKDAY_9_TO_5)).toBe('Closed today')
  })

  it('passes a legacy text value through unchanged', () => {
    vi.setSystemTime(WEDNESDAY(12))
    expect(formatTodayHours('Mon-Fri 9-5, call ahead')).toBe('Mon-Fri 9-5, call ahead')
  })

  it('returns null for an empty value', () => {
    vi.setSystemTime(WEDNESDAY(12))
    expect(formatTodayHours('')).toBeNull()
    expect(formatTodayHours(null)).toBeNull()
    expect(formatTodayHours(undefined)).toBeNull()
  })
})

describe('formatWeekHours', () => {
  it('returns all seven days in order and flags today', () => {
    vi.setSystemTime(WEDNESDAY(12))
    const week = formatWeekHours(WEEKDAY_9_TO_5)
    expect(week?.map((d) => d.key)).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
    expect(week?.find((d) => d.isToday)?.key).toBe('wed')
    expect(week?.find((d) => d.key === 'sun')?.text).toBe('Closed')
    expect(week?.find((d) => d.key === 'fri')?.text).toBe('9:00 AM – 2:00 PM')
  })

  it('returns null for a legacy text value', () => {
    vi.setSystemTime(WEDNESDAY(12))
    expect(formatWeekHours('Mon-Fri 9-5')).toBeNull()
  })
})

describe('formatHoursSummary', () => {
  it('collapses consecutive identical days into a range', () => {
    expect(formatHoursSummary(WEEKDAY_9_TO_5)).toBe(
      'Sun Closed · Mon–Thu 9:00 AM–5:00 PM · Fri 9:00 AM–2:00 PM · Sat Closed',
    )
  })

  it('collapses a full week of identical hours into one range', () => {
    const allWeek: StructuredHours = {
      sun: { open: '08:00', close: '20:00' },
      mon: { open: '08:00', close: '20:00' },
      tue: { open: '08:00', close: '20:00' },
      wed: { open: '08:00', close: '20:00' },
      thu: { open: '08:00', close: '20:00' },
      fri: { open: '08:00', close: '20:00' },
      sat: { open: '08:00', close: '20:00' },
    }
    expect(formatHoursSummary(allWeek)).toBe('Sun–Sat 8:00 AM–8:00 PM')
  })

  it('renders an em dash for an empty value and passes legacy text through', () => {
    expect(formatHoursSummary(null)).toBe('—')
    expect(formatHoursSummary('')).toBe('—')
    expect(formatHoursSummary('by appointment')).toBe('by appointment')
  })
})

describe('placesApiHoursToStructured', () => {
  it('returns null for empty periods so existing hours are left alone', () => {
    expect(placesApiHoursToStructured([])).toBeNull()
  })

  it('expands a 24/7 place to every day', () => {
    const result = placesApiHoursToStructured([{ open: { day: 0, hour: 0, minute: 0 } }])
    expect(result?.mon).toEqual({ open: '00:00', close: '23:59' })
    expect(result?.sat).toEqual({ open: '00:00', close: '23:59' })
  })

  it('maps day indices to keys and zero-pads times', () => {
    const result = placesApiHoursToStructured([
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
    ])
    expect(result?.mon).toEqual({ open: '09:00', close: '17:30' })
    expect(result?.tue).toBeNull()
  })

  it('closes at 23:59 when the period runs past midnight into the next day', () => {
    const result = placesApiHoursToStructured([
      { open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
    ])
    expect(result?.fri).toEqual({ open: '20:00', close: '23:59' })
  })

  it('ignores an out-of-range day index', () => {
    expect(placesApiHoursToStructured([{ open: { day: 9, hour: 9, minute: 0 } }])).toEqual({
      sun: null,
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
    })
  })

  // Google returns split periods for a place that shuts for lunch. The mapper
  // widens to the outer bounds rather than storing both windows, so the break
  // is not represented and the place reads as open through it. Locking in the
  // current behavior — StructuredHours has no way to express two windows in a
  // day, so changing this would mean changing the stored shape.
  it('merges split periods in one day into a single outer window', () => {
    const result = placesApiHoursToStructured([
      { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 12, minute: 0 } },
      { open: { day: 2, hour: 14, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } },
    ])
    expect(result?.tue).toEqual({ open: '09:00', close: '18:00' })
  })
})
