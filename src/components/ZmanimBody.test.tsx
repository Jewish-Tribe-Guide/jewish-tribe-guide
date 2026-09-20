// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ZmanimData } from '@/types'
import ZmanimBody from './ZmanimBody'

const NOW = Date.now()

afterEach(() => cleanup())

const readyData: ZmanimData = {
  hebrewDate: '22 Elul 5786',
  dayOfWeek: 3,
  isFriday: false,
  isShabbos: false,
  dailyZmanim: [
    { label: 'Sunrise', time: '6:31 AM' },
    { label: 'Sunset', time: '7:27 PM' },
  ],
  shabbos: {
    candleLighting: { label: 'Friday', time: '7:09 PM' },
    havdalah: { label: 'Saturday', time: '8:07 PM' },
  },
  holidayPeriod: null,
}

describe('ZmanimBody — the "Prayer & Shabbat Times" page/strip content', () => {
  it('falls back to the regular Candle Lighting/Havdalah rows when there is no holiday in the window', () => {
    render(<ZmanimBody data={readyData} status="ready" now={NOW} />)

    expect(screen.getByText('Upcoming Shabbos')).toBeInTheDocument()
    // The date/weekday sits next to the row's own label — matching
    // ShabbatTimesCard, the home screen's version of this same content.
    expect(screen.getByText('Candle Lighting Friday')).toBeInTheDocument()
    expect(screen.getByText('Havdalah Saturday')).toBeInTheDocument()
  })

  it('shows today’s own Jewish-calendar events (e.g. a Yom Tov day itself) under the Hebrew date', () => {
    render(<ZmanimBody data={{ ...readyData, holidays: ['Sukkot I'] }} status="ready" now={NOW} />)

    expect(screen.getByText('Sukkot I')).toBeInTheDocument()
  })

  it('shows nothing extra under the Hebrew date on an ordinary day', () => {
    render(<ZmanimBody data={readyData} status="ready" now={NOW} />)
    // hebrewDate itself still renders; just nothing beneath it.
    expect(screen.getByText('22 Elul 5786')).toBeInTheDocument()
  })

  // The holiday block replaces the regular rows entirely, same reasoning as
  // ShabbatTimesCard's own doc: on a week like Rosh Hashana, the holiday's
  // own candle lighting IS the regular Friday one, so showing both would
  // repeat the identical fact in identical words. Before this test existed,
  // this page never rendered `holidayPeriod` at all — a visitor on Sukkot
  // saw an ordinary "Upcoming Shabbos" row and nothing telling them it was
  // Sukkot.
  describe('the holiday block', () => {
    // Real Hebcal shape: Rosh Hashana lights again the second night, from an
    // existing flame, at its own later time.
    const withHoliday: ZmanimData = {
      ...readyData,
      isFriday: true,
      holidayPeriod: {
        name: 'Rosh Hashana',
        begins: { label: 'Fri, Sep 11', time: '6:57 PM' },
        candleLightings: [
          { label: 'Fri, Sep 11', time: '6:57 PM' },
          { label: 'Sat, Sep 12', time: '7:55 PM' },
        ],
        ends: { label: 'Sun, Sep 13', time: '7:53 PM' },
      },
    }

    it('shows the holiday name, and begins/ends on their own lines', () => {
      render(<ZmanimBody data={withHoliday} status="ready" now={NOW} />)

      expect(screen.getByText('Rosh Hashana')).toBeInTheDocument()
      expect(screen.getByText('Candles Fri, Sep 11')).toBeInTheDocument()
      expect(screen.getByText('6:57 PM')).toBeInTheDocument()
      expect(screen.getByText('Ends Sun, Sep 13')).toBeInTheDocument()
      expect(screen.getByText('7:53 PM')).toBeInTheDocument()
    })

    // Before this existed, only `holidayPeriod.begins` (the first night)
    // rendered — a visitor lighting candles the second night of Rosh Hashana
    // saw nothing telling them a second, later time even applied.
    it('shows every candle lighting, not just the first night', () => {
      render(<ZmanimBody data={withHoliday} status="ready" now={NOW} />)

      expect(screen.getByText('Candles Fri, Sep 11')).toBeInTheDocument()
      expect(screen.getByText('6:57 PM')).toBeInTheDocument()
      expect(screen.getByText('Candles Sat, Sep 12')).toBeInTheDocument()
      expect(screen.getByText('7:55 PM')).toBeInTheDocument()
    })

    it('shows a single Candles row for a one-day Yom Tov (Yom Kippur)', () => {
      render(
        <ZmanimBody
          data={{
            ...readyData,
            holidayPeriod: {
              name: 'Yom Kippur',
              begins: { label: 'Sun, Sep 20', time: '6:42 PM' },
              candleLightings: [{ label: 'Sun, Sep 20', time: '6:42 PM' }],
              ends: { label: 'Mon, Sep 21', time: '7:39 PM' },
            },
          }}
          status="ready"
          now={NOW}
        />,
      )

      expect(screen.getByText('Candles Sun, Sep 20')).toBeInTheDocument()
      expect(screen.getAllByText(/^Candles /)).toHaveLength(1)
    })

    it('replaces the regular Candle Lighting/Havdalah rows entirely', () => {
      render(<ZmanimBody data={withHoliday} status="ready" now={NOW} />)

      expect(screen.queryByText('Upcoming Shabbos')).not.toBeInTheDocument()
      expect(screen.queryByText('Candle Lighting Friday')).not.toBeInTheDocument()
      expect(screen.queryByText(/^Havdalah/)).not.toBeInTheDocument()
      // The regular rows' own values would prove a leftover row is hiding
      // behind an identical time — this fixture's holiday times differ from
      // the regular ones on purpose.
      expect(screen.queryByText(/7:09 PM/)).not.toBeInTheDocument()
      expect(screen.queryByText(/8:07 PM/)).not.toBeInTheDocument()
    })

    // A holiday landing within the lookahead window used to replace the
    // regular block unconditionally, even mid-Shabbos before that week's own
    // Havdalah — e.g. checking Saturday afternoon with a Yom Tov starting
    // Sunday or Monday night already inside the window. That read as
    // Shabbos having ended early. Fixtures here carry `iso`, unlike the rest
    // of this file, specifically so "currently in progress" has a real
    // instant to compare against `now`.
    const HOUR_MS = 60 * 60 * 1000
    it('keeps showing tonight’s Havdalah instead of jumping to an upcoming holiday while Shabbos is still in progress', () => {
      render(
        <ZmanimBody
          data={{
            ...readyData,
            isShabbos: true,
            shabbos: {
              candleLighting: { label: 'Friday', time: '7:09 PM', iso: new Date(NOW - 20 * HOUR_MS).toISOString() },
              havdalah: { label: 'Saturday', time: '8:07 PM', iso: new Date(NOW + HOUR_MS).toISOString() },
            },
            holidayPeriod: {
              name: 'Rosh Hashana',
              begins: { label: 'Sun, Sep 13', time: '6:57 PM', iso: new Date(NOW + 25 * HOUR_MS).toISOString() },
              candleLightings: [{ label: 'Sun, Sep 13', time: '6:57 PM', iso: new Date(NOW + 25 * HOUR_MS).toISOString() }],
              ends: { label: 'Tue, Sep 15', time: '7:53 PM', iso: new Date(NOW + 73 * HOUR_MS).toISOString() },
            },
          }}
          status="ready"
          now={NOW}
        />,
      )

      expect(screen.getByText('Upcoming Shabbos')).toBeInTheDocument()
      expect(screen.getByText('Havdalah Saturday')).toBeInTheDocument()
      expect(screen.queryByText('Rosh Hashana')).not.toBeInTheDocument()
      expect(screen.queryByText(/^Begins /)).not.toBeInTheDocument()
    })

    it('shows the upcoming holiday once this week’s own Havdalah has passed', () => {
      render(
        <ZmanimBody
          data={{
            ...readyData,
            shabbos: {
              candleLighting: { label: 'Friday', time: '7:09 PM', iso: new Date(NOW - 26 * HOUR_MS).toISOString() },
              havdalah: { label: 'Saturday', time: '8:07 PM', iso: new Date(NOW - HOUR_MS).toISOString() },
            },
            holidayPeriod: {
              name: 'Rosh Hashana',
              begins: { label: 'Sun, Sep 13', time: '6:57 PM', iso: new Date(NOW + 4 * HOUR_MS).toISOString() },
              candleLightings: [{ label: 'Sun, Sep 13', time: '6:57 PM', iso: new Date(NOW + 4 * HOUR_MS).toISOString() }],
              ends: { label: 'Tue, Sep 15', time: '7:53 PM', iso: new Date(NOW + 52 * HOUR_MS).toISOString() },
            },
          }}
          status="ready"
          now={NOW}
        />,
      )

      expect(screen.getByText('Rosh Hashana')).toBeInTheDocument()
      expect(screen.queryByText('Upcoming Shabbos')).not.toBeInTheDocument()
    })
  })

  // A fast is a separate section from the holiday block above, not a
  // replacement for it — see the component's own doc. Before this test
  // existed, `fastPeriod` was fetched but never rendered anywhere: a
  // visitor on Tzom Gedaliah or Tisha B'Av saw nothing telling them so.
  describe('the fast block', () => {
    const withFast: ZmanimData = {
      ...readyData,
      fastPeriod: {
        name: 'Tzom Gedaliah',
        begins: { label: 'Mon, Sep 14', time: '5:19 AM' },
        ends: { label: 'Mon, Sep 14', time: '7:44 PM' },
      },
    }

    it('shows the fast name, and begins/ends on their own lines', () => {
      render(<ZmanimBody data={withFast} status="ready" now={NOW} />)

      expect(screen.getByText('Tzom Gedaliah')).toBeInTheDocument()
      expect(screen.getByText('Fast Begins Mon, Sep 14')).toBeInTheDocument()
      expect(screen.getByText('5:19 AM')).toBeInTheDocument()
      expect(screen.getByText('Fast Ends Mon, Sep 14')).toBeInTheDocument()
      expect(screen.getByText('7:44 PM')).toBeInTheDocument()
    })

    it('shows alongside the regular Upcoming Shabbos block, not instead of it', () => {
      render(<ZmanimBody data={withFast} status="ready" now={NOW} />)

      expect(screen.getByText('Upcoming Shabbos')).toBeInTheDocument()
      expect(screen.getByText('Candle Lighting Friday')).toBeInTheDocument()
    })

    it('shows alongside the holiday block too, when both apply the same week', () => {
      render(
        <ZmanimBody
          data={{
            ...withFast,
            holidayPeriod: {
              name: 'Rosh Hashana',
              begins: { label: 'Fri, Sep 11', time: '6:57 PM' },
              candleLightings: [{ label: 'Fri, Sep 11', time: '6:57 PM' }],
              ends: { label: 'Sun, Sep 13', time: '7:53 PM' },
            },
          }}
          status="ready"
          now={NOW}
        />,
      )

      expect(screen.getByText('Rosh Hashana')).toBeInTheDocument()
      expect(screen.getByText('Tzom Gedaliah')).toBeInTheDocument()
    })

    it('omits the "Fast Ends" row when Hebcal has no end time (Ta’anit Bechorot)', () => {
      render(
        <ZmanimBody
          data={{ ...readyData, fastPeriod: { name: 'Ta’anit Bechorot', begins: { label: 'Wed, Apr 21', time: '4:47 AM' }, ends: null } }}
          status="ready"
          now={NOW}
        />,
      )

      expect(screen.getByText('Ta’anit Bechorot')).toBeInTheDocument()
      expect(screen.getByText('Fast Begins Wed, Apr 21')).toBeInTheDocument()
      expect(screen.queryByText(/^Fast Ends/)).not.toBeInTheDocument()
    })

    it('shows nothing when there is no fast in the window', () => {
      render(<ZmanimBody data={readyData} status="ready" now={NOW} />)
      expect(screen.queryByText(/^Fast Begins/)).not.toBeInTheDocument()
    })
  })

  it('shows a loading state while zmanim are in flight', () => {
    render(<ZmanimBody data={null} status="loading" now={NOW} />)
    expect(screen.getByText('Loading zmanim…')).toBeInTheDocument()
  })

  it('shows a plain error message when zmanim fail to load', () => {
    render(<ZmanimBody data={null} status="error" now={NOW} />)
    expect(screen.getByText(/unavailable right now/)).toBeInTheDocument()
  })
})
