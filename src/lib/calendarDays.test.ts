import { describe, expect, it } from 'vitest'
import type { ZmanimData } from '@/types'
import { calendarDaysFor } from './calendarDays'

function zmanim(overrides: Partial<ZmanimData> = {}): ZmanimData {
  return {
    hebrewDate: '16 Elul 5786',
    dayOfWeek: 6,
    isFriday: false,
    isShabbos: true,
    dailyZmanim: [],
    shabbos: { candleLighting: null, havdalah: null },
    ...overrides,
  }
}

// Saturday 2026-08-29, an ordinary day. Thursday 2026-11-26 is Thanksgiving.
const ORDINARY_SATURDAY = new Date(2026, 7, 29, 9, 0).getTime()
const THANKSGIVING = new Date(2026, 10, 26, 9, 0).getTime()

describe('calendarDaysFor', () => {
  it('always includes the weekday', () => {
    expect(calendarDaysFor(ORDINARY_SATURDAY, zmanim({ isRoshChodesh: false })).dayKeys).toEqual(['sat'])
  })

  it('adds the holiday key, and names it, only on a real secular holiday', () => {
    const plain = calendarDaysFor(ORDINARY_SATURDAY, zmanim({ isRoshChodesh: false }))
    expect(plain.dayKeys).not.toContain('holiday')
    expect(plain.labels).toEqual([])

    const feast = calendarDaysFor(THANKSGIVING, zmanim({ isRoshChodesh: false }))
    expect(feast.dayKeys).toContain('holiday')
    expect(feast.labels).toContain('Thanksgiving')
  })

  it('adds Rosh Chodesh when Hebcal says so, under Hebcal’s own name', () => {
    const rc = calendarDaysFor(
      ORDINARY_SATURDAY,
      zmanim({ isRoshChodesh: true, holidays: ['Rosh Chodesh Elul'] }),
    )
    expect(rc.dayKeys).toContain('rosh_chodesh')
    expect(rc.labels).toContain('Rosh Chodesh Elul')
  })

  it('drops Rosh Chodesh when Hebcal says it is not', () => {
    const result = calendarDaysFor(ORDINARY_SATURDAY, zmanim({ isRoshChodesh: false }))
    expect(result.dayKeys).not.toContain('rosh_chodesh')
    expect(result.roshChodeshKnown).toBe(true)
  })

  // The rule the whole module is built around: a wrong "yes" shows a minyan
  // the reader can discount from its heading; a wrong "no" hides one with
  // nothing on screen to discount.
  it('keeps Rosh Chodesh when the answer is unknown, and says so', () => {
    for (const unknown of [null, undefined, zmanim()]) {
      const result = calendarDaysFor(ORDINARY_SATURDAY, unknown)
      expect(result.dayKeys).toContain('rosh_chodesh')
      expect(result.roshChodeshKnown).toBe(false)
      // Nothing is claimed in the UI on a guess.
      expect(result.labels).toEqual([])
    }
  })
})
