import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { businessClosure, effectiveBusinessStatus, fmt12, formatHoursSummary, formatTodayHours, formatWeekHours, getOpenStatus, hoursClosing, hoursOpenNow, isStructuredHours, placesApiHoursToStructured, syncedLabel, type StructuredHours } from './hours'

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

describe('syncedLabel', () => {
  beforeEach(() => {
    vi.setSystemTime(WEDNESDAY(12))
  })

  it('returns null when there is nothing to sync from', () => {
    expect(syncedLabel(undefined)).toBeNull()
  })

  it('returns null for an unparseable timestamp', () => {
    expect(syncedLabel('not a date')).toBeNull()
  })

  it('says "today" for anything synced today', () => {
    expect(syncedLabel(WEDNESDAY(9).toISOString())).toBe('Synced from Google · updated today')
  })

  it('says "1d ago" for yesterday', () => {
    const yesterday = new Date(2026, 5, 23, 12)
    expect(syncedLabel(yesterday.toISOString())).toBe('Synced from Google · updated 1d ago')
  })

  it('counts multiple days', () => {
    const fiveDaysAgo = new Date(2026, 5, 19, 12)
    expect(syncedLabel(fiveDaysAgo.toISOString())).toBe('Synced from Google · updated 5d ago')
  })
})

// Google marks a business CLOSED_TEMPORARILY (a shop shut for renovations, a
// restaurant closed for the season) while its posted hours stay exactly as they
// were. Reading hours alone therefore had every one of them showing a green
// "Open" badge, and passing the "Open now" filter, right through the closure.
describe('business closures outrank posted hours', () => {
  const openNow = { mon: { open: '00:00', close: '23:59' } }
  const item = (status?: string) => ({
    hours: openNow,
    ...(status ? { businessStatus: status } : {}),
  })
  // A Monday, midday — the hours above say open.
  const monday = new Date(2026, 7, 31, 12, 0)

  it('reports a trading business as open', () => {
    const status = getOpenStatus(item('OPERATIONAL'), ['hours'], monday)
    expect(status.isOpen).toBe(true)
    expect(status.closure).toBeNull()
  })

  it('never reports a temporarily closed business as open', () => {
    const status = getOpenStatus(item('CLOSED_TEMPORARILY'), ['hours'], monday)
    expect(status.isOpen).toBe(false)
    expect(status.closure).toBe('temporary')
    // No "Closes at …" either — there is nothing to close.
    expect(status.closing).toBeNull()
  })

  it('never reports a permanently closed business as open', () => {
    const status = getOpenStatus(item('CLOSED_PERMANENTLY'), ['hours'], monday)
    expect(status.isOpen).toBe(false)
    expect(status.closure).toBe('permanent')
  })

  // The sync rewrites businessStatus on every run and needs no admin action
  // either way, so the badge has to clear itself the day Google reopens the
  // place. Nothing is remembered between runs; this is that property.
  it('goes back to open the moment the status flips back', () => {
    expect(getOpenStatus(item('CLOSED_TEMPORARILY'), ['hours'], monday).isOpen).toBe(false)
    expect(getOpenStatus(item('OPERATIONAL'), ['hours'], monday).isOpen).toBe(true)
    // And for a listing Google never gave a status at all.
    expect(getOpenStatus(item(), ['hours'], monday).isOpen).toBe(true)
  })

  it('classifies closures for display', () => {
    expect(businessClosure({ businessStatus: 'CLOSED_TEMPORARILY' })).toBe('temporary')
    expect(businessClosure({ businessStatus: 'CLOSED_PERMANENTLY' })).toBe('permanent')
    expect(businessClosure({ businessStatus: 'OPERATIONAL' })).toBeNull()
    expect(businessClosure({})).toBeNull()
  })
})

// businessStatus is rewritten on every sync and sits outside
// OWNABLE_SYNC_FIELDS, which left three states with no way out: Google stops
// returning a status (the write is skipped, the old badge persists), the
// listing's sync starts failing, or its place id is cleared so it leaves the
// sync query entirely. In each, a wrong badge was frozen on a live listing
// with nothing able to clear it.
describe('an admin override outranks Google', () => {
  it('reopens a listing Google still calls closed', () => {
    const item = { businessStatus: 'CLOSED_TEMPORARILY', businessStatusOverride: 'OPERATIONAL' }
    expect(businessClosure(item)).toBeNull()
    expect(effectiveBusinessStatus(item)).toBe('OPERATIONAL')
  })

  it('can close a listing Google still calls open', () => {
    const item = { businessStatus: 'OPERATIONAL', businessStatusOverride: 'CLOSED_TEMPORARILY' }
    expect(businessClosure(item)).toBe('temporary')
  })

  // The override is stored on its own key rather than by writing over
  // businessStatus, so Google's answer keeps updating underneath it — that's
  // what lets the console show the disagreement, and what makes clearing the
  // override return the listing to reality rather than to a remembered guess.
  it('leaves Google’s own answer intact underneath', () => {
    const item = { businessStatus: 'CLOSED_PERMANENTLY', businessStatusOverride: 'OPERATIONAL' }
    expect(item.businessStatus).toBe('CLOSED_PERMANENTLY')
    expect(businessClosure(item)).toBeNull()
    // Clearing it hands the listing straight back to Google.
    expect(businessClosure({ businessStatus: 'CLOSED_PERMANENTLY' })).toBe('permanent')
  })

  it('does nothing when unset', () => {
    expect(businessClosure({ businessStatus: 'CLOSED_TEMPORARILY', businessStatusOverride: undefined }))
      .toBe('temporary')
  })

  it('keeps a closed-by-override listing out of Open', () => {
    const status = getOpenStatus(
      { hours: { mon: { open: '00:00', close: '23:59' } }, businessStatusOverride: 'CLOSED_TEMPORARILY' },
      ['hours'],
      new Date(2026, 7, 31, 12, 0),
    )
    expect(status.isOpen).toBe(false)
    expect(status.closure).toBe('temporary')
  })
})
