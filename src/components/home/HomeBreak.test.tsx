// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import type { ZmanimData } from '@/types'
import type { ZmanimStatus } from '@/lib/useZmanim'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import HomeBreak from './HomeBreak'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// This is the quiet transition between the two main sections (Browse
// everything, Explore the map) — see its own doc. The thing worth locking
// down in a test is exactly what makes it "quiet": no <h2>, unlike every
// other block on the page, and it still carries the "kept by the
// community" line regardless of the zmanim fetch's own state.

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

describe('HomeBreak', () => {
  it('renders no heading — this is the quiet break, not a peer section', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('shows the Hebrew date, sunset, candle lighting, and havdalah once ready', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText(/22 Elul 5786/)).toBeInTheDocument()
    expect(screen.getByText(/Philadelphia/)).toBeInTheDocument()
    expect(screen.getByText('7:27 PM')).toBeInTheDocument()
    expect(screen.getByText('7:09 PM')).toBeInTheDocument()
    expect(screen.getByText('8:07 PM')).toBeInTheDocument()
  })

  it('shows the community-run line and a working "Suggest something" link regardless of zmanim status', () => {
    mockUseZmanim.mockReturnValue({ data: null, status: 'loading' })
    renderWithProviders(<HomeBreak coords={null} locationLabel="Philadelphia" />)

    expect(screen.getByText(/Kept current by the community/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Suggest something/ })
    expect(link).toHaveAttribute('href', expect.stringMatching(/\/feedback$/))
  })
})
