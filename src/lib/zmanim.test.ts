import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyOffsetMinutes, getZmanimData, type ZmanimCoords } from './zmanim'

const PHILADELPHIA: ZmanimCoords = {
  latitude: 39.9526,
  longitude: -75.1652,
  timezone: 'America/New_York',
}

// A Wednesday: 2026-06-24 14:00 EDT (18:00 UTC).
const WEDNESDAY_AFTERNOON = new Date('2026-06-24T18:00:00Z')

const zmanimResponse = {
  times: {
    sunrise: '2026-06-24T05:32:00-04:00',
    sofZmanShma: '2026-06-24T09:12:00-04:00',
    sofZmanTfilla: '2026-06-24T10:24:00-04:00',
    sunset: '2026-06-24T20:33:00-04:00',
    tzeit7083deg: '2026-06-24T21:14:00-04:00',
  },
}

const shabbatResponse = {
  items: [
    { category: 'parashat', title: 'Parashat Korach', date: '2026-06-27' },
    { category: 'candles', title: 'Candle lighting: 8:14pm', date: '2026-06-26T20:14:00-04:00' },
    { category: 'havdalah', title: 'Havdalah: 9:23pm', date: '2026-06-27T21:23:00-04:00' },
  ],
}

const converterResponse = { hy: 5786, hm: 'Tamuz', hd: 9 }

/** Routes each Hebcal endpoint to its canned response and records the URLs. */
function mockHebcal(overrides: { zmanim?: unknown; shabbat?: unknown; converter?: unknown } = {}) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (url: string | URL) => {
    const href = String(url)
    calls.push(href)
    const body = href.includes('/zmanim')
      ? (overrides.zmanim ?? zmanimResponse)
      : href.includes('/shabbat')
        ? (overrides.shabbat ?? shabbatResponse)
        : (overrides.converter ?? converterResponse)
    return { ok: true, status: 200, json: async () => body } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(WEDNESDAY_AFTERNOON)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('applyOffsetMinutes', () => {
  it('shifts back from an anchor and formats in the target timezone', () => {
    // Sunset 8:33 PM, less 20 minutes.
    expect(applyOffsetMinutes('2026-06-24T20:33:00-04:00', -20, 'America/New_York')).toBe('8:13 PM')
  })

  it('shifts forward from an anchor', () => {
    expect(applyOffsetMinutes('2026-06-27T21:23:00-04:00', 10, 'America/New_York')).toBe('9:33 PM')
  })

  it('returns the anchor itself for a zero offset', () => {
    expect(applyOffsetMinutes('2026-06-24T20:33:00-04:00', 0, 'America/New_York')).toBe('8:33 PM')
  })

  it('rolls correctly across an hour boundary', () => {
    expect(applyOffsetMinutes('2026-06-24T20:05:00-04:00', -10, 'America/New_York')).toBe('7:55 PM')
  })

  it('formats in the requested timezone, not the machine’s', () => {
    // The same instant, expressed in Jerusalem time.
    expect(applyOffsetMinutes('2026-06-24T20:33:00-04:00', 0, 'Asia/Jerusalem')).toBe('3:33 AM')
  })
})

describe('getZmanimData', () => {
  it('asks Hebcal for the Shabbos relative to today using gy/gm/gd', async () => {
    // A `date=` param is silently ignored by /shabbat, which then falls back to
    // Hebcal's own clock and can return last week's Shabbos. gy/gm/gd is the
    // param set it actually reads.
    const { calls } = mockHebcal()
    await getZmanimData(PHILADELPHIA)

    const shabbatUrl = calls.find((c) => c.includes('/shabbat'))!
    expect(shabbatUrl).toContain('gy=2026')
    expect(shabbatUrl).toContain('gm=6')
    expect(shabbatUrl).toContain('gd=24')
    expect(shabbatUrl).not.toMatch(/[?&]date=/)
  })

  it('sends integer month/day without leading zeros', async () => {
    // 2026-01-07 — both parts would be zero-padded in the date string.
    vi.setSystemTime(new Date('2026-01-07T17:00:00Z'))
    const { calls } = mockHebcal()
    await getZmanimData(PHILADELPHIA)

    const shabbatUrl = calls.find((c) => c.includes('/shabbat'))!
    expect(shabbatUrl).toContain('gm=1')
    expect(shabbatUrl).toContain('gd=7')
    expect(shabbatUrl).not.toContain('gm=01')
  })

  it('requests the zmanim and converter for today’s civil date in the target timezone', async () => {
    const { calls } = mockHebcal()
    await getZmanimData(PHILADELPHIA)

    expect(calls.find((c) => c.includes('/zmanim'))).toContain('date=2026-06-24')
    expect(calls.find((c) => c.includes('/converter'))).toContain('date=2026-06-24')
  })

  it('uses the community timezone, not the machine’s, to decide what "today" is', async () => {
    // 2026-06-25 01:00 UTC is still 2026-06-24 in New York.
    vi.setSystemTime(new Date('2026-06-25T01:00:00Z'))
    const { calls } = mockHebcal()
    await getZmanimData(PHILADELPHIA)

    expect(calls.find((c) => c.includes('/zmanim'))).toContain('date=2026-06-24')
  })

  it('formats the daily zmanim in the community timezone', async () => {
    mockHebcal()
    const data = await getZmanimData(PHILADELPHIA)

    expect(data.dailyZmanim).toEqual([
      { label: 'Sunrise', time: '5:32 AM' },
      { label: 'Latest Shema', time: '9:12 AM' },
      { label: 'Latest Shacharis', time: '10:24 AM' },
      { label: 'Sunset', time: '8:33 PM', iso: '2026-06-24T20:33:00-04:00' },
      { label: 'Nightfall', time: '9:14 PM' },
    ])
  })

  it('keeps the sunset ISO instant so anchor-based minyanim can be calculated from it', async () => {
    mockHebcal()
    const data = await getZmanimData(PHILADELPHIA)
    const sunset = data.dailyZmanim.find((z) => z.label === 'Sunset')!
    expect(applyOffsetMinutes(sunset.iso!, -20, PHILADELPHIA.timezone)).toBe('8:13 PM')
  })

  it('picks candle lighting and havdalah out of the Shabbos items by category', async () => {
    mockHebcal()
    const data = await getZmanimData(PHILADELPHIA)

    expect(data.shabbos.candleLighting).toEqual({
      label: 'Friday',
      time: '8:14 PM',
      iso: '2026-06-26T20:14:00-04:00',
    })
    expect(data.shabbos.havdalah).toEqual({
      label: 'Saturday',
      time: '9:23 PM',
      iso: '2026-06-27T21:23:00-04:00',
    })
    expect(data.parsha).toBe('Parashat Korach')
  })

  it('returns nulls rather than throwing when Hebcal omits the Shabbos items', async () => {
    mockHebcal({ shabbat: {} })
    const data = await getZmanimData(PHILADELPHIA)

    expect(data.shabbos.candleLighting).toBeNull()
    expect(data.shabbos.havdalah).toBeNull()
    expect(data.parsha).toBeUndefined()
  })

  it('reports the Hebrew date', async () => {
    mockHebcal()
    const data = await getZmanimData(PHILADELPHIA)
    expect(data.hebrewDate).toBe('9 Tamuz 5786')
  })

  it('flags the weekday, Friday and Shabbos correctly', async () => {
    mockHebcal()
    const wed = await getZmanimData(PHILADELPHIA)
    expect(wed.dayOfWeek).toBe(3)
    expect(wed.isFriday).toBe(false)
    expect(wed.isShabbos).toBe(false)

    vi.setSystemTime(new Date('2026-06-26T18:00:00Z')) // Friday
    mockHebcal()
    const fri = await getZmanimData(PHILADELPHIA)
    expect(fri.dayOfWeek).toBe(5)
    expect(fri.isFriday).toBe(true)
    expect(fri.isShabbos).toBe(false)

    vi.setSystemTime(new Date('2026-06-27T18:00:00Z')) // Saturday
    mockHebcal()
    const sat = await getZmanimData(PHILADELPHIA)
    expect(sat.dayOfWeek).toBe(6)
    expect(sat.isFriday).toBe(false)
    expect(sat.isShabbos).toBe(true)
  })

  it('throws when a Hebcal request fails, so the caller can surface it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response),
    )
    await expect(getZmanimData(PHILADELPHIA)).rejects.toThrow(/Hebcal request failed \(503\)/)
  })
})
