import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyOffsetMinutes, getZmanimData, lookaheadDays, type ZmanimCoords } from './zmanim'

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

// Empty by default — an ordinary week has no Yom Tov in the lookahead
// window, and that's the common case most tests below want.
const holidayCalendarResponse = { items: [] }

/** Routes each Hebcal endpoint to its canned response and records the URLs.
 *  `/hebcal` (holiday-period detection) is checked before `/shabbat` and
 *  `/zmanim`, neither of which is a substring match for it, but ordering
 *  defensively matters less than being explicit about which comes first. */
function mockHebcal(overrides: { zmanim?: unknown; shabbat?: unknown; converter?: unknown; holidayCalendar?: unknown } = {}) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (url: string | URL) => {
    const href = String(url)
    calls.push(href)
    const body = href.includes('/hebcal')
      ? (overrides.holidayCalendar ?? holidayCalendarResponse)
      : href.includes('/zmanim')
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

  describe('holidayPeriod', () => {
    it('asks /hebcal for an explicit date range, padded past the real lookahead window, not the /shabbat "next cycle" the regular candle/havdalah fields use', async () => {
      // Wednesday 2026-06-24, dayOfWeek 3 → lookaheadDays = max(6-3, 3) = 3,
      // so the real window ends 2026-06-27 — but the query itself reaches 3
      // days further (HOLIDAY_QUERY_PAD_DAYS), to 2026-06-30, so a period
      // starting right at the window's edge still has room to show its own
      // close-out havdalah. See the next test for why that padding matters.
      const { calls } = mockHebcal()
      await getZmanimData(PHILADELPHIA)

      const holidayUrl = calls.find((c) => c.includes('/hebcal'))!
      expect(holidayUrl).toContain('start=2026-06-24')
      expect(holidayUrl).toContain('end=2026-06-30')
    })

    it('is null on an ordinary week with no Yom Tov in the window', async () => {
      mockHebcal() // holidayCalendarResponse default: no items
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.holidayPeriod).toBeNull()
    })

    it('groups a multi-day Yom Tov (candles → candles → havdalah) into one period, named from its non-Erev title', async () => {
      // Sunday 2026-09-06 → lookaheadDays(0) = 6 → window ends 2026-09-12.
      // Rosh Hashana begins 9/11 (inside the window) but its own havdalah
      // isn't until 9/13 — one day PAST an unpadded window. This is the
      // real bug this shape caught: querying only through windowEnd would
      // return the two candle-lightings with no havdalah at all, and
      // findHolidayPeriod would (correctly, by its own rule) report no
      // period — an upcoming Yom Tov reported as absent for a reason that
      // has nothing to do with whether it's actually upcoming. The response
      // below is exactly what Hebcal returns once the query is padded far
      // enough to include that havdalah.
      vi.setSystemTime(new Date('2026-09-06T18:00:00Z'))
      mockHebcal({
        holidayCalendar: {
          items: [
            { category: 'holiday', title: 'Erev Rosh Hashana', date: '2026-09-11' },
            { category: 'candles', title: 'Candle lighting: 6:57pm', date: '2026-09-11T18:57:00-04:00' },
            { category: 'holiday', title: 'Rosh Hashana 5787', date: '2026-09-12' },
            { category: 'candles', title: 'Candle lighting: 7:55pm', date: '2026-09-12T19:55:00-04:00' },
            { category: 'holiday', title: 'Rosh Hashana II', date: '2026-09-13' },
            { category: 'havdalah', title: 'Havdalah: 7:53pm', date: '2026-09-13T19:53:00-04:00' },
          ],
        },
      })
      const data = await getZmanimData(PHILADELPHIA)

      expect(data.holidayPeriod).toEqual({
        name: 'Rosh Hashana',
        begins: { label: 'Fri, Sep 11', time: '6:57 PM', iso: '2026-09-11T18:57:00-04:00' },
        ends: { label: 'Sun, Sep 13', time: '7:53 PM', iso: '2026-09-13T19:53:00-04:00' },
      })
    })

    it('strips a chol hamoed / day-number suffix down to the plain holiday name', async () => {
      // 2026-09-22 (Tuesday) → lookaheadDays(2) = 4 → window ends 9/26,
      // comfortably covering Sukkot's 9/25 start.
      vi.setSystemTime(new Date('2026-09-22T18:00:00Z'))
      mockHebcal({
        holidayCalendar: {
          items: [
            { category: 'holiday', title: 'Erev Sukkot', date: '2026-09-25' },
            { category: 'candles', title: 'Candle lighting: 6:34pm', date: '2026-09-25T18:34:00-04:00' },
            { category: 'holiday', title: 'Sukkot I', date: '2026-09-26' },
            { category: 'candles', title: 'Candle lighting: 7:31pm', date: '2026-09-26T19:31:00-04:00' },
            { category: 'holiday', title: 'Sukkot II', date: '2026-09-27' },
            { category: 'havdalah', title: 'Havdalah: 7:29pm', date: '2026-09-27T19:29:00-04:00' },
            // Chol hamoed — genuinely no candles/havdalah item at all. Present
            // here to prove it doesn't get pulled into the period above.
            { category: 'holiday', title: 'Sukkot III (CH’’M)', date: '2026-09-28' },
          ],
        },
      })
      const data = await getZmanimData(PHILADELPHIA)

      expect(data.holidayPeriod?.name).toBe('Sukkot')
      expect(data.holidayPeriod?.ends.iso).toBe('2026-09-27T19:29:00-04:00')
    })

    it('is null when a candle-lighting starts a period whose havdalah never appears, even in the padded response', async () => {
      // The response ran out with no havdalah at all — nothing honest to
      // put in "ends", so no period rather than a half-true one.
      mockHebcal({
        holidayCalendar: {
          items: [
            { category: 'holiday', title: 'Erev Yom Kippur', date: '2026-06-25' },
            { category: 'candles', title: 'Candle lighting: 6:42pm', date: '2026-06-25T18:42:00-04:00' },
          ],
        },
      })
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.holidayPeriod).toBeNull()
    })

    it('does not treat an ordinary holiday-less Friday/Saturday as a period', async () => {
      // Same shape the regular shabbos.candleLighting/havdalah fields
      // already parse from /shabbat — no `holiday` item anywhere in the
      // span, so this isn't a Yom Tov, and the regular fields already cover
      // it; a redundant identical holidayPeriod would just duplicate them.
      mockHebcal({
        holidayCalendar: {
          items: [
            { category: 'candles', title: 'Candle lighting: 8:14pm', date: '2026-06-26T20:14:00-04:00' },
            { category: 'havdalah', title: 'Havdalah: 9:23pm', date: '2026-06-27T21:23:00-04:00' },
          ],
        },
      })
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.holidayPeriod).toBeNull()
    })

    it('is null when the only candle-lighting in the padded response starts after the real window — a real period, just not upcoming yet', async () => {
      // Wednesday 2026-06-24 → window ends 2026-06-27, but the query itself
      // reaches to 2026-06-30 (the padding). A period starting on 6/29 is
      // inside the PADDED response but past the window a visitor was
      // actually promised — this is exactly the case the padding could
      // wrongly surface if nothing checked the start against windowEnd.
      mockHebcal({
        holidayCalendar: {
          items: [
            { category: 'holiday', title: 'Erev Shavuot', date: '2026-06-29' },
            { category: 'candles', title: 'Candle lighting: 8:15pm', date: '2026-06-29T20:15:00-04:00' },
            { category: 'holiday', title: 'Shavuot I', date: '2026-06-30' },
            { category: 'havdalah', title: 'Havdalah: 9:20pm', date: '2026-06-30T21:20:00-04:00' },
          ],
        },
      })
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.holidayPeriod).toBeNull()
    })
  })

  describe('fastPeriod', () => {
    it('is null on an ordinary week with no fast in the window', async () => {
      mockHebcal() // holidayCalendarResponse default: no items
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.fastPeriod).toBeNull()
    })

    it('asks Hebcal for minor fasts (mf=on), not just major holidays', async () => {
      const { calls } = mockHebcal()
      await getZmanimData(PHILADELPHIA)
      const holidayUrl = calls.find((c) => c.includes('/hebcal'))!
      expect(holidayUrl).toContain('mf=on')
    })

    it('finds a plain fast — begins/ends share one name', async () => {
      // Real Hebcal shape for Tzom Gedaliah, the day after Rosh Hashana.
      vi.setSystemTime(new Date('2026-09-14T12:00:00Z'))
      mockHebcal({
        holidayCalendar: {
          items: [
            { category: 'zmanim', subcat: 'fast', title: 'Fast begins', date: '2026-09-14T05:19:00-04:00', memo: 'Tzom Gedaliah' },
            { category: 'holiday', subcat: 'fast', title: 'Tzom Gedaliah', date: '2026-09-14' },
            { category: 'zmanim', subcat: 'fast', title: 'Fast ends', date: '2026-09-14T19:44:00-04:00', memo: 'Tzom Gedaliah' },
          ],
        },
      })
      const data = await getZmanimData(PHILADELPHIA)

      expect(data.fastPeriod).toEqual({
        name: 'Tzom Gedaliah',
        begins: { label: 'Mon, Sep 14', time: '5:19 AM', iso: '2026-09-14T05:19:00-04:00' },
        ends: { label: 'Mon, Sep 14', time: '7:44 PM', iso: '2026-09-14T19:44:00-04:00' },
      })
    })

    it('names Tisha B’Av from the ends item, not the "Erev "-prefixed begins item', async () => {
      // Real Hebcal shape — the fast starts the evening before, so "Fast
      // begins" is memo'd "Erev Tish'a B'Av" while "Fast ends" is the plain
      // "Tish'a B'Av". This is the one fast whose begins/ends names differ.
      // 2 days before the fast begins — inside the window regardless of
      // weekday, since lookaheadDays's floor is always at least 3.
      vi.setSystemTime(new Date('2027-08-09T12:00:00Z'))
      mockHebcal({
        holidayCalendar: {
          items: [
            { category: 'zmanim', subcat: 'fast', title: 'Fast begins', date: '2027-08-11T20:03:00-04:00', memo: 'Erev Tish’a B’Av' },
            { category: 'holiday', subcat: 'major', title: 'Erev Tish’a B’Av', date: '2027-08-11' },
            { category: 'holiday', subcat: 'major', title: 'Tish’a B’Av', date: '2027-08-12' },
            { category: 'zmanim', subcat: 'fast', title: 'Fast ends', date: '2027-08-12T20:33:00-04:00', memo: 'Tish’a B’Av' },
          ],
        },
      })
      const data = await getZmanimData(PHILADELPHIA)

      expect(data.fastPeriod?.name).toBe('Tish’a B’Av')
      expect(data.fastPeriod?.begins.time).toBe('8:03 PM')
      expect(data.fastPeriod?.ends?.time).toBe('8:33 PM')
    })

    it('has a begins with no ends for Ta’anit Bechorot, named from the stripped begins memo', async () => {
      // Real Hebcal shape: no "Fast ends" item at all — traditionally ended
      // early by a siyum, not a published zman. Other, unrelated zmanim
      // items (erev-Pesach chametz deadlines) can legitimately sit between
      // "Fast begins" and the next actual fast — this fixture proves those
      // don't get mistaken for this fast's own end.
      vi.setSystemTime(new Date('2027-04-19T12:00:00Z'))
      mockHebcal({
        holidayCalendar: {
          items: [
            { category: 'zmanim', subcat: 'fast', title: 'Fast begins', date: '2027-04-21T04:47:00-04:00', memo: 'Ta’anit Bechorot' },
            { category: 'holiday', subcat: 'fast', title: 'Ta’anit Bechorot', date: '2027-04-21' },
            { category: 'zmanim', title: 'Finish eating chametz', date: '2027-04-21T10:45:00-04:00' },
            { category: 'zmanim', title: 'Biur Chametz', date: '2027-04-21T11:52:00-04:00' },
          ],
        },
      })
      const data = await getZmanimData(PHILADELPHIA)

      expect(data.fastPeriod?.name).toBe('Ta’anit Bechorot')
      expect(data.fastPeriod?.begins.time).toBe('4:47 AM')
      expect(data.fastPeriod?.ends).toBeNull()
    })

    it('does not mistake Yom Kippur’s candles/havdalah for a fast — Hebcal never pairs it with Fast begins/ends', async () => {
      mockHebcal({
        holidayCalendar: {
          items: [
            { category: 'holiday', subcat: 'major', title: 'Erev Yom Kippur', date: '2026-09-20' },
            { category: 'candles', title: 'Candle lighting: 6:42pm', date: '2026-09-20T18:42:00-04:00' },
            { category: 'holiday', subcat: 'major', title: 'Yom Kippur', date: '2026-09-21' },
            { category: 'havdalah', title: 'Havdalah: 7:39pm', date: '2026-09-21T19:39:00-04:00' },
          ],
        },
      })
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.fastPeriod).toBeNull()
    })

    it('is null when the fast starts after the real window, even though the padded query reaches it', async () => {
      // Wednesday 2026-06-24 → window ends 2026-06-27, query reaches 2026-06-30.
      mockHebcal({
        holidayCalendar: {
          items: [
            { category: 'zmanim', subcat: 'fast', title: 'Fast begins', date: '2026-06-29T04:00:00-04:00', memo: 'Some Fast' },
            { category: 'zmanim', subcat: 'fast', title: 'Fast ends', date: '2026-06-29T21:00:00-04:00', memo: 'Some Fast' },
          ],
        },
      })
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.fastPeriod).toBeNull()
    })
  })

  describe('isYomTov', () => {
    it('is true on a full Yom Tov day', async () => {
      mockHebcal({ converter: { ...converterResponse, events: ['Sukkot I'] } })
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.isYomTov).toBe(true)
    })

    it('is false on Erev Yom Tov — the lead-up, not the day itself', async () => {
      mockHebcal({ converter: { ...converterResponse, events: ['Erev Sukkot'] } })
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.isYomTov).toBe(false)
    })

    it('is false on Chol HaMoed — a shul’s regular weekday schedule still applies', async () => {
      mockHebcal({ converter: { ...converterResponse, events: ['Sukkot III (CH’M)'] } })
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.isYomTov).toBe(false)
    })

    it('is false on a minor holiday, where work is permitted', async () => {
      mockHebcal({ converter: { ...converterResponse, events: ['Chanukah: 1 Candle'] } })
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.isYomTov).toBe(false)
    })

    it('is false on Rosh Chodesh alone — its own separate pseudo-day', async () => {
      mockHebcal({ converter: { ...converterResponse, events: ['Rosh Chodesh Elul'] } })
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.isYomTov).toBe(false)
    })

    it('is false on an ordinary day with no events', async () => {
      mockHebcal()
      const data = await getZmanimData(PHILADELPHIA)
      expect(data.isYomTov).toBe(false)
    })
  })
})

describe('lookaheadDays', () => {
  it('is the floor (3) on Thursday, Friday, and Saturday, when the week alone would give less notice', () => {
    expect(lookaheadDays(4)).toBe(3) // Thursday: 6-4=2, floor wins
    expect(lookaheadDays(5)).toBe(3) // Friday: 6-5=1, floor wins
    expect(lookaheadDays(6)).toBe(3) // Saturday: 6-6=0, floor wins
  })

  it('is the days left in the week on Sunday through Wednesday, when that stretches further than the floor', () => {
    expect(lookaheadDays(0)).toBe(6) // Sunday
    expect(lookaheadDays(1)).toBe(5) // Monday
    expect(lookaheadDays(2)).toBe(4) // Tuesday
    expect(lookaheadDays(3)).toBe(3) // Wednesday: 6-3=3, ties the floor
  })
})
