import { describe, expect, it } from 'vitest'
import type { ZmanimData } from '@/types'
import { dayLine } from './todayHome'

const NY = 'America/New_York'
const zmanim = (over: Partial<ZmanimData> = {}) =>
  ({
    hebrewDate: '25 Tishrei 5787',
    dayOfWeek: 2,
    isFriday: false,
    isShabbos: false,
    dailyZmanim: [{ label: 'Sunset', time: '6:35 PM' }],
    shabbos: { candleLighting: null, havdalah: null },
    ...over,
  }) as ZmanimData

describe('the day line', () => {
  it('a weekday: the date, the Hebrew date without the year, and sunset', () => {
    expect(dayLine(Date.parse('2026-10-06T16:30:00Z'), NY, zmanim())).toBe('Tuesday, Oct 6 · 25 Tishrei · sunset 6:35 PM')
  })

  it('Friday leaves sunset to the candles card', () => {
    expect(dayLine(Date.parse('2026-10-09T17:30:00Z'), NY, zmanim({ hebrewDate: '28 Tishrei 5787', dayOfWeek: 5, isFriday: true }))).toBe('Friday, Oct 9 · 28 Tishrei')
  })

  it('Saturday is Shabbos', () => {
    expect(dayLine(Date.parse('2026-10-10T15:00:00Z'), NY, zmanim({ hebrewDate: '29 Tishrei 5787', dayOfWeek: 6, isShabbos: true }))).toBe('Shabbos, Oct 10 · 29 Tishrei')
  })

  it('Yom Tov leaves sunset out too', () => {
    expect(dayLine(Date.parse('2026-10-06T16:30:00Z'), NY, zmanim({ isYomTov: true }))).toBe('Tuesday, Oct 6 · 25 Tishrei')
  })

  it('the community’s day, not the device’s: 12:30 AM Tuesday in New York is Monday in Los Angeles', () => {
    const at = Date.parse('2026-10-06T04:30:00Z')
    expect(dayLine(at, NY, null)).toBe('Tuesday, Oct 6')
    expect(dayLine(at, 'America/Los_Angeles', null)).toBe('Monday, Oct 5')
  })

  it('before the zmanim arrive, the date alone; yesterday’s zmanim are not used', () => {
    expect(dayLine(Date.parse('2026-10-06T16:30:00Z'), NY, null)).toBe('Tuesday, Oct 6')
    expect(dayLine(Date.parse('2026-10-07T16:30:00Z'), NY, zmanim())).toBe('Wednesday, Oct 7')
  })

  it('nothing before there’s a clock', () => {
    expect(dayLine(null, NY, zmanim())).toBeNull()
  })
})
