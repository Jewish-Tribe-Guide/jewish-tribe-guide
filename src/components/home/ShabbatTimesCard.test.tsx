// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ZmanimData } from '@/types'
import type { ZmanimStatus } from '@/lib/useZmanim'
import ShabbatTimesCard from './ShabbatTimesCard'

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
}

describe('ShabbatTimesCard', () => {
  it('renders as its own headed section', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByRole('heading', { name: 'Shabbat Times' })).toBeInTheDocument()
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

// Both rows show every day of the week — only the highlight moves. This
// used to give both rows the amber treatment regardless of the day, which
// claimed "this is happening imminently" on a Tuesday exactly as loudly as
// on the Friday it's actually true.
describe('ShabbatTimesCard — the highlight follows the day, not both rows always', () => {
  const rowFor = (label: string) => screen.getByText(label, { exact: false }).closest('div')!

  it('midweek: neither row is highlighted, and both still show', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' }) // isFriday/isShabbos both false
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(rowFor('Candles')).toHaveClass('bg-slate-50')
    expect(rowFor('Havdalah')).toHaveClass('bg-slate-50')
    expect(screen.getByText('7:09 PM')).toBeInTheDocument()
    expect(screen.getByText('8:07 PM')).toBeInTheDocument()
  })

  it('Friday: candle lighting is highlighted, havdalah is not', () => {
    mockUseZmanim.mockReturnValue({ data: { ...readyData, isFriday: true }, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(rowFor('Candles')).toHaveClass('bg-amber-50')
    expect(rowFor('Havdalah')).toHaveClass('bg-slate-50')
  })

  it('Shabbos: havdalah is highlighted, candle lighting is not', () => {
    mockUseZmanim.mockReturnValue({ data: { ...readyData, isShabbos: true }, status: 'ready' })
    render(<ShabbatTimesCard coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(rowFor('Candles')).toHaveClass('bg-slate-50')
    expect(rowFor('Havdalah')).toHaveClass('bg-amber-50')
  })
})
