import { describe, expect, it } from 'vitest'
import type { ZmanimData } from '@/types'
import { shabbosMoment } from './todayHome'
import { previewNow } from './previewDay'

// The admin's preview, asked for Friday or Shabbos on any day of the week,
// moves Right now's clock into that day of this week (the user, Nov 15).
const NY = 'America/New_York'
const week = {
  hebrewDate: '25 Tishrei 5787',
  dayOfWeek: 2,
  isFriday: false,
  isShabbos: false,
  dailyZmanim: [],
  parsha: 'Parashat Bereshit',
  shabbos: {
    candleLighting: { label: 'Friday', time: '6:12 PM', iso: '2026-10-09T18:12:00-04:00' },
    havdalah: { label: 'Saturday', time: '7:09 PM', iso: '2026-10-10T19:09:00-04:00' },
  },
} as unknown as ZmanimData
const t = (iso: string) => Date.parse(iso)
const tuesday = t('2026-10-06T11:00:00-04:00')
const shabbosDay = t('2026-10-10T12:00:00-04:00')

describe('previewNow', () => {
  it('on a Tuesday: Friday is that afternoon before candles, Shabbos the afternoon before havdalah', () => {
    const fri = previewNow('erev', week, tuesday, NY)
    expect(fri).toBe(t('2026-10-09T15:12:00-04:00'))
    expect(shabbosMoment(week, fri, NY).kind).toBe('erev')
    const sat = previewNow('shabbos', week, tuesday, NY)
    expect(sat).toBe(t('2026-10-10T16:09:00-04:00'))
    expect(shabbosMoment(week, sat, NY).kind).toBe('shabbos')
  })

  it('on Shabbos: a weekday is earlier in the week, Friday the day before', () => {
    const wk = previewNow('weekday', week, shabbosDay, NY)
    expect(shabbosMoment(week, wk, NY).kind).toBe('weekday')
    expect(shabbosMoment(week, previewNow('erev', week, shabbosDay, NY), NY).kind).toBe('erev')
  })

  it('leaves the clock alone when it is that day already, when none is asked, or with no times', () => {
    expect(previewNow('weekday', week, tuesday, NY)).toBe(tuesday)
    expect(previewNow(null, week, tuesday, NY)).toBe(tuesday)
    expect(previewNow('erev', null, tuesday, NY)).toBe(tuesday)
    expect(previewNow('erev', { ...week, shabbos: { candleLighting: null, havdalah: null } } as ZmanimData, tuesday, NY)).toBe(tuesday)
  })
})
