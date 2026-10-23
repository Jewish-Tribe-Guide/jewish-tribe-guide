import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import { outOfSeason, seasonFor } from './seasonPairs'

// Production's, Oct 23. Mekor: Friday 7:00 PM in summer, at candle
// lighting in winter; weekdays 15 min before sunset in summer, Maariv
// 6:30 PM in winter. B'nai Abraham: Friday 7:00 PM, or 10 min before sunset.
const m = (over: Partial<Minyan>): Minyan => ({ id: Math.random().toString(36), tefillah: 'mincha_maariv', days: ['fri'], time: '', ...over })
const fri7 = m({ time: '7:00 PM', season: 'summer' })
const friCandles = m({ time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0, season: 'winter' })
const weekdaySunset = m({ days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '15 min before Sunset', anchor: 'sunset', offsetMinutes: -15, season: 'summer' })
const maariv630 = m({ tefillah: 'maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '6:30pm', season: 'winter' })
const mekor = [fri7, friCandles, weekdaySunset, maariv630]

const OCT_23 = { candleLightingIso: '2026-10-23T17:48:00-04:00', sunsetIso: '2026-10-23T18:06:00-04:00' }
const JULY_10 = { candleLightingIso: '2026-07-10T20:13:00-04:00', sunsetIso: '2026-07-10T20:31:00-04:00' }

describe('summer and winter, by the zman', () => {
  // The clocks go back Nov 1; candle lighting passed 7 PM in September.
  it('late October, clocks not yet back: the winter times, candle lighting before 7 PM', () => {
    expect(seasonFor(fri7, mekor, 'summer', OCT_23)).toBe('winter')
    expect(outOfSeason(fri7, mekor, 'summer', OCT_23)).toBe(true)
    expect(outOfSeason(friCandles, mekor, 'summer', OCT_23)).toBe(false)
    // Weekdays: sunset 6:06, so 5:51 PM, before Maariv's 6:30.
    expect(outOfSeason(weekdaySunset, mekor, 'summer', OCT_23)).toBe(true)
    expect(outOfSeason(maariv630, mekor, 'summer', OCT_23)).toBe(false)
  })

  it('July: the summer times, candle lighting after 7 PM', () => {
    expect(outOfSeason(fri7, mekor, 'summer', JULY_10)).toBe(false)
    expect(outOfSeason(friCandles, mekor, 'summer', JULY_10)).toBe(true)
    expect(outOfSeason(weekdaySunset, mekor, 'summer', JULY_10)).toBe(false)
  })

  it('a zman not known, or no pair, keeps the clock change’s season', () => {
    expect(seasonFor(fri7, mekor, 'summer', undefined)).toBe('summer')
    expect(seasonFor(fri7, mekor, 'summer', {})).toBe('summer')
    expect(seasonFor(fri7, [fri7], 'summer', OCT_23)).toBe('summer')
    // Both a zman, or both a clock time: nothing to compare.
    const satCandles = m({ days: ['sat'], time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0, season: 'summer' })
    const satWinter = { ...satCandles, id: 'w', season: 'winter' as const }
    expect(seasonFor(satCandles, [satCandles, satWinter], 'summer', OCT_23)).toBe('summer')
    // Not a day they share.
    const sun7 = m({ days: ['sun'], time: '7:00 PM', season: 'summer' })
    expect(seasonFor(sun7, [sun7, friCandles], 'summer', OCT_23)).toBe('summer')
    // An all-year minyan is never out of season.
    expect(outOfSeason(m({ time: '6:00 PM' }), mekor, 'winter', OCT_23)).toBe(false)
  })
})
