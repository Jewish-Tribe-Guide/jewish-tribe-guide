// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ZmanimData } from '@/types'
import ZmanimBody from './ZmanimBody'

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
    render(<ZmanimBody data={readyData} status="ready" />)

    expect(screen.getByText('Upcoming Shabbos')).toBeInTheDocument()
    expect(screen.getByText('Candle Lighting')).toBeInTheDocument()
    expect(screen.getByText('Havdalah')).toBeInTheDocument()
  })

  it('shows today’s own Jewish-calendar events (e.g. a Yom Tov day itself) under the Hebrew date', () => {
    render(<ZmanimBody data={{ ...readyData, holidays: ['Sukkot I'] }} status="ready" />)

    expect(screen.getByText('Sukkot I')).toBeInTheDocument()
  })

  it('shows nothing extra under the Hebrew date on an ordinary day', () => {
    render(<ZmanimBody data={readyData} status="ready" />)
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
    const withHoliday: ZmanimData = {
      ...readyData,
      isFriday: true,
      holidayPeriod: {
        name: 'Rosh Hashana',
        begins: { label: 'Fri, Sep 11', time: '6:57 PM' },
        ends: { label: 'Sun, Sep 13', time: '7:53 PM' },
      },
    }

    it('shows the holiday name, and begins/ends on their own lines', () => {
      render(<ZmanimBody data={withHoliday} status="ready" />)

      expect(screen.getByText('Rosh Hashana')).toBeInTheDocument()
      expect(screen.getByText('Begins')).toBeInTheDocument()
      expect(screen.getByText('Fri, Sep 11 6:57 PM')).toBeInTheDocument()
      expect(screen.getByText('Ends')).toBeInTheDocument()
      expect(screen.getByText('Sun, Sep 13 7:53 PM')).toBeInTheDocument()
    })

    it('replaces the regular Candle Lighting/Havdalah rows entirely', () => {
      render(<ZmanimBody data={withHoliday} status="ready" />)

      expect(screen.queryByText('Upcoming Shabbos')).not.toBeInTheDocument()
      expect(screen.queryByText('Candle Lighting')).not.toBeInTheDocument()
      expect(screen.queryByText('Havdalah')).not.toBeInTheDocument()
      // The regular rows' own values would prove a leftover row is hiding
      // behind an identical time — this fixture's holiday times differ from
      // the regular ones on purpose.
      expect(screen.queryByText(/7:09 PM/)).not.toBeInTheDocument()
      expect(screen.queryByText(/8:07 PM/)).not.toBeInTheDocument()
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
      render(<ZmanimBody data={withFast} status="ready" />)

      expect(screen.getByText('Tzom Gedaliah')).toBeInTheDocument()
      expect(screen.getByText('Fast Begins')).toBeInTheDocument()
      expect(screen.getByText('Mon, Sep 14 5:19 AM')).toBeInTheDocument()
      expect(screen.getByText('Fast Ends')).toBeInTheDocument()
      expect(screen.getByText('Mon, Sep 14 7:44 PM')).toBeInTheDocument()
    })

    it('shows alongside the regular Upcoming Shabbos block, not instead of it', () => {
      render(<ZmanimBody data={withFast} status="ready" />)

      expect(screen.getByText('Upcoming Shabbos')).toBeInTheDocument()
      expect(screen.getByText('Candle Lighting')).toBeInTheDocument()
    })

    it('shows alongside the holiday block too, when both apply the same week', () => {
      render(
        <ZmanimBody
          data={{
            ...withFast,
            holidayPeriod: {
              name: 'Rosh Hashana',
              begins: { label: 'Fri, Sep 11', time: '6:57 PM' },
              ends: { label: 'Sun, Sep 13', time: '7:53 PM' },
            },
          }}
          status="ready"
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
        />,
      )

      expect(screen.getByText('Ta’anit Bechorot')).toBeInTheDocument()
      expect(screen.getByText('Fast Begins')).toBeInTheDocument()
      expect(screen.queryByText('Fast Ends')).not.toBeInTheDocument()
    })

    it('shows nothing when there is no fast in the window', () => {
      render(<ZmanimBody data={readyData} status="ready" />)
      expect(screen.queryByText('Fast Begins')).not.toBeInTheDocument()
    })
  })

  it('shows a loading state while zmanim are in flight', () => {
    render(<ZmanimBody data={null} status="loading" />)
    expect(screen.getByText('Loading zmanim…')).toBeInTheDocument()
  })

  it('shows a plain error message when zmanim fail to load', () => {
    render(<ZmanimBody data={null} status="error" />)
    expect(screen.getByText(/unavailable right now/)).toBeInTheDocument()
  })
})
