import { describe, expect, it } from 'vitest'
import { dayKeysFor } from './useMinyanSchedule'
import { factsFor, withRoshChodesh } from './schedules'
import { nextUpcomingDavening, type ShulMinyanim } from './upcomingDavening'
import type { Minyan } from './davening'

// A shul's "also on public holidays" and "Rosh Chodesh" minyanim only count
// when the day's keys say so. Before Nov 18 dayKeysFor gave the weekday, the
// date and Yom Tov only, so on Thanksgiving B'nai Abraham said "Next:
// Shacharis 7 AM tomorrow" right above "8:30 AM also on public holidays".
const day = (date: string, extra: Partial<ReturnType<typeof factsFor>> = {}) => ({ ...factsFor(date, [], '2099-12-31'), ...extra })

describe('dayKeysFor', () => {
  it('counts a public holiday', () => {
    expect(dayKeysFor(day('2026-11-26'))).toContain('holiday')
    expect(dayKeysFor(day('2026-11-25'))).not.toContain('holiday')
  })

  it('counts Rosh Chodesh when the calendar says so, and only then', () => {
    expect(dayKeysFor(day('2026-12-10', { roshChodesh: true }))).toContain('rosh_chodesh')
    expect(dayKeysFor(day('2026-12-10'))).not.toContain('rosh_chodesh')
  })

  it("puts a shul's holiday minyan in Next: on Thanksgiving morning", () => {
    const minyanim = [
      { type: 'shacharis', time: '8:30 AM', days: ['holiday'] },
      { type: 'shacharis', time: '7:00 AM', days: ['fri'] },
    ] as unknown as Minyan[]
    const shuls = [{ id: 's', name: "B'nai Abraham", geo: null, minyanim }] as unknown as ShulMinyanim[]
    const next = nextUpcomingDavening(shuls, {
      today: dayKeysFor(day('2026-11-26')),
      tomorrow: dayKeysFor(day('2026-11-27')),
      nowMinutes: 7 * 60 + 30,
      season: null,
      anchors: {},
    })
    expect(next).toMatchObject({ isTomorrow: false, time: "8:30 AM" })
  })
})

// Rosh Chodesh tomorrow: until Nov 19 only today's was known (the
// converter's), so a shul's Rosh Chodesh shacharis tomorrow never showed
// as "Next" after tonight's maariv; the weekday one did instead.
describe('Rosh Chodesh on the days ahead', () => {
  const week = ['2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11'].map((d) => day(d))

  it('is marked where the calendar says so, today by the converter', () => {
    const marked = withRoshChodesh(week, false, ['2026-12-09', '2026-12-10'])
    expect(marked.map((d) => !!d.roshChodesh)).toEqual([false, true, true, false])
    expect(withRoshChodesh(week, true, undefined).map((d) => !!d.roshChodesh)).toEqual([true, false, false, false])
  })

  it('is never guessed when the calendar has not said', () => {
    expect(withRoshChodesh(week, undefined, undefined).some((d) => d.roshChodesh)).toBe(false)
  })

  it("puts tomorrow's Rosh Chodesh shacharis in Next: tonight", () => {
    const minyanim = [
      { type: 'shacharis', time: '6:30 AM', days: ['rosh_chodesh'] },
      { type: 'shacharis', time: '7:00 AM', days: ['wed'] },
    ] as unknown as Minyan[]
    const shuls = [{ id: 's', name: 'Beth Am', geo: null, minyanim }] as unknown as ShulMinyanim[]
    const [today, tomorrow] = withRoshChodesh(week, false, ['2026-12-09', '2026-12-10'])
    const next = nextUpcomingDavening(shuls, {
      today: dayKeysFor(today),
      tomorrow: dayKeysFor(tomorrow),
      nowMinutes: 21 * 60,
      season: null,
      anchors: {},
    })
    expect(next).toMatchObject({ isTomorrow: true, time: '6:30 AM' })
  })
})
