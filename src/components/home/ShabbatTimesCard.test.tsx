// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders as render } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { ZmanimData } from '@/types'
import type { ZmanimStatus } from '@/lib/useZmanim'
import { makeCategory } from '@/test/providerFixtures'
import ShabbatTimesCard from './ShabbatTimesCard'

// Needed by useCommunitySlug() (communityContext.tsx), which this card now
// calls to link out to the full Zmanim page — see nextNavigationMock's own doc.
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// Candle lighting and havdalah, nothing else — this used to be the full
// daily Zmanim (sunrise, latest Shema, latest Shacharis, sunset, nightfall)
// plus these two, five rows nobody asked about next to the two anyone
// actually checks this card for. The thing worth locking down: those five
// rows never render, even though the mocked data below still carries them
// (a real /api/zmanim response would too) — trimming happens in this
// component, not by the data happening to omit them.

const mockUseZmanim = vi.fn<(coords: unknown) => { data: ZmanimData | null; status: ZmanimStatus }>()
vi.mock('@/lib/useZmanim', () => ({
  useZmanim: (coords: unknown) => mockUseZmanim(coords),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

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

describe('ShabbatTimesCard', () => {
  it('renders as its own headed section', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByRole('heading', { name: 'Shabbat & Holiday Times' })).toBeInTheDocument()
  })

  it('renders a custom heading when given one — admin-editable (Desktop tab)', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" heading="Zmanim & Holidays" />)

    expect(screen.getByRole('heading', { name: 'Zmanim & Holidays' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Shabbat & Holiday Times' })).not.toBeInTheDocument()
  })

  it('shows only candle lighting and havdalah — not the old five-row daily zmanim grid', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText(/22 Elul 5786/)).toBeInTheDocument()
    expect(screen.getByText(/Philadelphia/)).toBeInTheDocument()
    expect(screen.getByText('7:09 PM')).toBeInTheDocument()
    expect(screen.getByText('8:07 PM')).toBeInTheDocument()
    // The five daily rows nobody asked about — gone.
    expect(screen.queryByText('Sunrise')).not.toBeInTheDocument()
    expect(screen.queryByText('6:31 AM')).not.toBeInTheDocument()
    expect(screen.queryByText('7:27 PM')).not.toBeInTheDocument()
  })

  it('credits Hebcal.com, same as the real Zmanim & Shabbos page, once ready', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    const link = screen.getByRole('link', { name: 'Hebcal.com' })
    expect(link).toHaveAttribute('href', 'https://www.hebcal.com')
  })

  it('links out to the full Zmanim & Shabbos page', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    const link = screen.getByRole('link', { name: 'All zmanim' })
    expect(link).toHaveAttribute('href', '/test-community/zmanim')
  })

  it('links to the minyanim and the eruv only when the community has those pages', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    const shuls = makeCategory({ id: 'synagogue', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const eruv = makeCategory({ id: 'eruv-info', kind: 'eruv' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />, { content: { categories: [shuls, eruv] } })

    expect(screen.getByRole('link', { name: 'Minyanim' })).toHaveAttribute('href', '/test-community/synagogue?davening=1')
    expect(screen.getByRole('link', { name: 'Eruv' })).toHaveAttribute('href', '/test-community/eruv-info')
    cleanup()

    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />, { content: { categories: [makeCategory({ id: 'grocery' })] } })
    expect(screen.queryByRole('link', { name: 'Minyanim' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Eruv' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All zmanim' })).toBeInTheDocument()
  })

  it('shows a loading state while zmanim are in flight', () => {
    mockUseZmanim.mockReturnValue({ data: null, status: 'loading' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText('Loading zmanim…')).toBeInTheDocument()
  })

  it('shows a plain error message when zmanim fail to load', () => {
    mockUseZmanim.mockReturnValue({ data: null, status: 'error' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText(/unavailable right now/)).toBeInTheDocument()
  })
})

// One big time: the next thing to happen. The logic has its own tests
// (lib/shabbosCard.test.ts); these check the card shows what it picks.
// Fixtures carry `iso` offsets from the real clock, since useNow reads
// Date.now().
const HOUR_MS = 60 * 60 * 1000
const isoOffset = (ms: number) => new Date(Date.now() + ms).toISOString()
const next = () => screen.getByTestId('shabbos-next')

describe('ShabbatTimesCard — the big time', () => {
  const friday: ZmanimData = {
    ...readyData,
    shabbos: {
      candleLighting: { label: 'Friday', time: '7:09 PM', iso: isoOffset(2 * HOUR_MS + 54 * 60_000) },
      havdalah: { label: 'Saturday', time: '8:07 PM', iso: isoOffset(27 * HOUR_MS) },
    },
  }

  it('before candle lighting: candles big, how soon, havdalah under it', () => {
    mockUseZmanim.mockReturnValue({ data: friday, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText('Shabbos')).toBeInTheDocument()
    expect(next()).toHaveTextContent('Candles 7:09 PM')
    expect(screen.getByText('in 2 h 54 min · Friday')).toBeInTheDocument()
    expect(screen.getByText('Havdalah Saturday')).toBeInTheDocument()
    expect(screen.getByText('8:07 PM')).toBeInTheDocument()
  })

  it('once candles are lit: havdalah big, and the past candle lighting gone', () => {
    mockUseZmanim.mockReturnValue({
      data: { ...friday, shabbos: { ...friday.shabbos, candleLighting: { label: 'Friday', time: '7:09 PM', iso: isoOffset(-HOUR_MS) } } },
      status: 'ready',
    })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(next()).toHaveTextContent('Havdalah 8:07 PM')
    expect(screen.queryByText('7:09 PM')).not.toBeInTheDocument()
  })

  it('a day or more off: the day, no countdown', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' }) // no instants
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(next()).toHaveTextContent('Candles 7:09 PM')
    expect(screen.getByText('Friday')).toBeInTheDocument()
    expect(screen.queryByText(/^in /)).not.toBeInTheDocument()
  })
})

// The holiday block replaces the Shabbos times, rather than sitting beside
// them — see ShabbatTimesCard's own doc on why: on a week like Rosh
// Hashana, the holiday's own candle lighting IS the regular Friday one, so
// showing both would repeat the identical fact in identical words.
describe('ShabbatTimesCard — the holiday block', () => {
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

  it('shows the holiday name, its candle lighting big and its end under it', () => {
    mockUseZmanim.mockReturnValue({ data: withHoliday, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText('Rosh Hashana')).toBeInTheDocument()
    expect(next()).toHaveTextContent('Candles 6:57 PM')
    expect(screen.getByText('Fri, Sep 11')).toBeInTheDocument()
    expect(screen.getByText('Ends Sun, Sep 13')).toBeInTheDocument()
    expect(screen.getByText('7:53 PM')).toBeInTheDocument()
  })

  it('replaces the Shabbos times entirely, never shows both', () => {
    mockUseZmanim.mockReturnValue({ data: withHoliday, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.queryByText('Shabbos')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Havdalah/)).not.toBeInTheDocument()
    // The regular times are a different value from the holiday's on purpose,
    // so a leftover Shabbos row can't hide behind an identical one.
    expect(screen.queryByText('7:09 PM')).not.toBeInTheDocument()
    expect(screen.queryByText('8:07 PM')).not.toBeInTheDocument()
  })

  it('falls back to the Shabbos times when there is no holiday in the window', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' }) // holidayPeriod: null
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText('Shabbos')).toBeInTheDocument()
    expect(screen.getByText('Havdalah Saturday')).toBeInTheDocument()
  })

  // A holiday within the lookahead window used to replace the Shabbos
  // times unconditionally, even mid-Shabbos before that week's own
  // Havdalah — reading exactly like Shabbos had already ended.
  it('keeps showing tonight’s Havdalah instead of jumping to an upcoming holiday while Shabbos is still in progress', () => {
    mockUseZmanim.mockReturnValue({
      data: {
        ...readyData,
        isShabbos: true,
        shabbos: {
          candleLighting: { label: 'Friday', time: '7:09 PM', iso: isoOffset(-20 * HOUR_MS) },
          havdalah: { label: 'Saturday', time: '8:07 PM', iso: isoOffset(HOUR_MS) },
        },
        holidayPeriod: {
          name: 'Rosh Hashana',
          begins: { label: 'Sun, Sep 13', time: '6:57 PM', iso: isoOffset(25 * HOUR_MS) },
          candleLightings: [{ label: 'Sun, Sep 13', time: '6:57 PM', iso: isoOffset(25 * HOUR_MS) }],
          ends: { label: 'Tue, Sep 15', time: '7:53 PM', iso: isoOffset(73 * HOUR_MS) },
        },
      },
      status: 'ready',
    })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(next()).toHaveTextContent('Havdalah 8:07 PM')
    expect(screen.queryByText('Rosh Hashana')).not.toBeInTheDocument()
  })
})

// The fast competes with the holiday-or-Shabbos block for the card's one
// slot, rather than always sitting alongside it — see
// resolvePrimaryZmanimBlock in lib/zmanim.ts and the component's own doc.
describe('ShabbatTimesCard — the fast block', () => {
  const fastWith = (beginsMs: number, endsMs: number | null): ZmanimData => ({
    ...readyData,
    fastPeriod: {
      name: 'Tzom Gedaliah',
      begins: { label: 'Mon, Sep 14', time: '5:19 AM', iso: isoOffset(beginsMs) },
      ends: endsMs === null ? null : { label: 'Mon, Sep 14', time: '7:44 PM', iso: isoOffset(endsMs) },
    },
  })

  it('before it begins: the start big, the end under it', () => {
    mockUseZmanim.mockReturnValue({ data: fastWith(HOUR_MS, 15 * HOUR_MS), status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText('Tzom Gedaliah')).toBeInTheDocument()
    expect(next()).toHaveTextContent('Fast begins 5:19 AM')
    expect(screen.getByText('Fast ends Mon, Sep 14')).toBeInTheDocument()
    expect(screen.getByText('7:44 PM')).toBeInTheDocument()
  })

  it('under way: the end big, and it replaces the Shabbos times', () => {
    mockUseZmanim.mockReturnValue({ data: fastWith(-2 * HOUR_MS, 2 * HOUR_MS), status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(next()).toHaveTextContent('Fast ends 7:44 PM')
    expect(screen.queryByText('Shabbos')).not.toBeInTheDocument()
    expect(screen.queryByText('7:09 PM')).not.toBeInTheDocument()
  })

  it('keeps the start when Hebcal has no end time (Ta’anit Bechorot)', () => {
    mockUseZmanim.mockReturnValue({
      data: {
        ...readyData,
        fastPeriod: { name: 'Ta’anit Bechorot', begins: { label: 'Wed, Apr 21', time: '4:47 AM', iso: isoOffset(-HOUR_MS) }, ends: null },
      },
      status: 'ready',
    })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText('Ta’anit Bechorot')).toBeInTheDocument()
    expect(next()).toHaveTextContent('Fast began 4:47 AM')
    expect(screen.queryByText(/^Fast ends/)).not.toBeInTheDocument()
  })

  it('shows nothing about a fast when there is none in the window', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.queryByText(/^Fast /)).not.toBeInTheDocument()
  })

  it('keeps showing the fast for 90 minutes after it ends', () => {
    mockUseZmanim.mockReturnValue({ data: fastWith(-14 * HOUR_MS, -HOUR_MS), status: 'ready' }) // ended 60 min ago
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText('Tzom Gedaliah')).toBeInTheDocument()
    expect(screen.queryByText('Shabbos')).not.toBeInTheDocument()
  })

  it('falls back to the Shabbos times once the fast has ended', () => {
    mockUseZmanim.mockReturnValue({ data: fastWith(-30 * HOUR_MS, -6 * HOUR_MS), status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText('Shabbos')).toBeInTheDocument()
    expect(next()).toHaveTextContent('Candles 7:09 PM')
    expect(screen.queryByText('Tzom Gedaliah')).not.toBeInTheDocument()
  })

  it('shows the holiday block instead when a holiday is also upcoming, once the fast has ended', () => {
    mockUseZmanim.mockReturnValue({
      data: {
        ...fastWith(-30 * HOUR_MS, -6 * HOUR_MS),
        holidayPeriod: {
          name: 'Sukkot',
          begins: { label: 'Fri, Sep 18', time: '6:40 PM', iso: isoOffset(4 * 24 * HOUR_MS) },
          candleLightings: [{ label: 'Fri, Sep 18', time: '6:40 PM', iso: isoOffset(4 * 24 * HOUR_MS) }],
          ends: { label: 'Sat, Sep 19', time: '7:38 PM', iso: isoOffset(5 * 24 * HOUR_MS) },
        },
      },
      status: 'ready',
    })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText('Sukkot')).toBeInTheDocument()
    expect(screen.queryByText('Tzom Gedaliah')).not.toBeInTheDocument()
  })
})
