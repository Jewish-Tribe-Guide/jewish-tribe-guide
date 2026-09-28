import { describe, expect, it } from 'vitest'
import type { ZmanimData } from '@/types'
import { countdown, shabbosCardView } from './shabbosCard'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-10-02T15:00:00-04:00') // a Friday afternoon
const iso = (hoursFromNow: number) => new Date(NOW + hoursFromNow * HOUR).toISOString()

const week: ZmanimData = {
  hebrewDate: '20 Tishrei 5787',
  dayOfWeek: 5,
  isFriday: true,
  isShabbos: false,
  dailyZmanim: [],
  shabbos: {
    candleLighting: { label: 'Friday', time: '6:23 PM', iso: iso(3.4) },
    havdalah: { label: 'Saturday', time: '7:21 PM', iso: iso(28.4) },
  },
  holidayPeriod: null,
}

describe('shabbosCardView — Shabbos', () => {
  it('leads with candle lighting until it’s lit, havdalah under it', () => {
    expect(shabbosCardView(week, NOW)).toEqual({
      kind: 'shabbos',
      name: 'Shabbos',
      next: { label: 'Candles', when: 'Friday', time: '6:23 PM', iso: iso(3.4) },
      also: [{ label: 'Havdalah', when: 'Saturday', time: '7:21 PM', iso: iso(28.4) }],
    })
  })

  it('leads with havdalah once candles are lit, and drops the past candle lighting', () => {
    const view = shabbosCardView(week, NOW + 4 * HOUR)
    expect(view.next).toMatchObject({ label: 'Havdalah', time: '7:21 PM' })
    expect(view.also).toEqual([])
  })

  it('keeps candle lighting first when the times carry no instant to compare', () => {
    const plain: ZmanimData = { ...week, shabbos: { candleLighting: { label: 'Friday', time: '6:23 PM' }, havdalah: { label: 'Saturday', time: '7:21 PM' } } }
    expect(shabbosCardView(plain, NOW).next).toMatchObject({ label: 'Candles' })
  })
})

describe('shabbosCardView — Yom Tov', () => {
  // Two days of Yom Tov: first night tonight, second night tomorrow, over
  // the night after. Shabbos is a week off here: while a Shabbos is under
  // way the card shows Shabbos (resolvePrimaryZmanimBlock).
  const yomTov: ZmanimData = {
    ...week,
    shabbos: {
      candleLighting: { label: 'Friday', time: '6:13 PM', iso: iso(7 * 24) },
      havdalah: { label: 'Saturday', time: '7:11 PM', iso: iso(8 * 24) },
    },
    holidayPeriod: {
      name: 'Shmini Atzeret',
      begins: { label: 'Fri, Oct 2', time: '6:23 PM', iso: iso(3.4) },
      candleLightings: [
        { label: 'Fri, Oct 2', time: '6:23 PM', iso: iso(3.4) },
        { label: 'Sat, Oct 3', time: '7:21 PM', iso: iso(28.4) },
      ],
      ends: { label: 'Sun, Oct 4', time: '7:18 PM', iso: iso(52.3) },
    },
  }

  it('leads with its first candle lighting, and its end under it', () => {
    const view = shabbosCardView(yomTov, NOW)
    expect(view).toMatchObject({ kind: 'holiday', name: 'Shmini Atzeret' })
    expect(view.next).toMatchObject({ label: 'Candles', when: 'Fri, Oct 2', time: '6:23 PM' })
    expect(view.also).toEqual([{ label: 'Ends', when: 'Sun, Oct 4', time: '7:18 PM', iso: iso(52.3) }])
  })

  it('once under way, leads with the second night’s candle lighting', () => {
    const view = shabbosCardView(yomTov, NOW + 4 * HOUR)
    expect(view.next).toMatchObject({ label: 'Candles', when: 'Sat, Oct 3' })
  })

  it('leads with its end once every candle lighting has passed', () => {
    const view = shabbosCardView(yomTov, NOW + 30 * HOUR)
    expect(view.next).toMatchObject({ label: 'Ends', when: 'Sun, Oct 4', time: '7:18 PM' })
    expect(view.also).toEqual([])
  })
})

describe('shabbosCardView — a fast', () => {
  const fast = (begins: number, ends: number | null): ZmanimData => ({
    ...week,
    fastPeriod: {
      name: 'Tzom Gedaliah',
      begins: { label: 'Mon, Sep 14', time: '5:19 AM', iso: iso(begins) },
      ends: ends === null ? null : { label: 'Mon, Sep 14', time: '7:44 PM', iso: iso(ends) },
    },
  })

  it('leads with the start before it begins, the end under it', () => {
    const view = shabbosCardView(fast(1, 15), NOW)
    expect(view).toMatchObject({ kind: 'fast', name: 'Tzom Gedaliah' })
    expect(view.next).toMatchObject({ label: 'Fast begins', time: '5:19 AM' })
    expect(view.also).toMatchObject([{ label: 'Fast ends', time: '7:44 PM' }])
  })

  it('leads with the end once it has begun', () => {
    const view = shabbosCardView(fast(-2, 2), NOW)
    expect(view.next).toMatchObject({ label: 'Fast ends', time: '7:44 PM' })
    expect(view.also).toEqual([])
  })

  it('keeps the start when there’s no published end (Ta’anit Bechorot)', () => {
    expect(shabbosCardView(fast(-1, null), NOW).next).toMatchObject({ label: 'Fast began', time: '5:19 AM' })
  })
})

describe('countdown', () => {
  it('says how soon, under 12 hours off', () => {
    expect(countdown(iso(2 + 54 / 60), NOW)).toBe('in 2 h 54 min')
    expect(countdown(iso(0.5), NOW)).toBe('in 30 min')
    expect(countdown(iso(3), NOW)).toBe('in 3 h')
  })

  it('says nothing further off, past, or without an instant', () => {
    expect(countdown(iso(13), NOW)).toBeNull()
    expect(countdown(iso(-1), NOW)).toBeNull()
    expect(countdown(undefined, NOW)).toBeNull()
  })
})
