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

// The transition between the two main sections (Browse everything, Explore
// the map) — two cards, full daily Zmanim on the left and the "kept by the
// community" message on the right. The thing worth locking down in a test:
// both cards render as their own headed sections, the full daily zmanim
// list shows (not just a trimmed few), and the community message renders
// regardless of the zmanim fetch's own state.

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
  it('renders both cards as their own headed sections', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByRole('heading', { name: 'Zmanim & Shabbos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kept current by people like you' })).toBeInTheDocument()
  })

  it('shows the full daily zmanim list, not a trimmed few, plus candle lighting and havdalah', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.getByText(/22 Elul 5786/)).toBeInTheDocument()
    expect(screen.getByText(/Philadelphia/)).toBeInTheDocument()
    // Every entry in dailyZmanim, not just Sunset — this card is the "full"
    // Zmanim treatment, unlike the earlier trimmed strip it replaced.
    expect(screen.getByText('Sunrise')).toBeInTheDocument()
    expect(screen.getByText('6:31 AM')).toBeInTheDocument()
    expect(screen.getByText('7:27 PM')).toBeInTheDocument()
    expect(screen.getByText('7:09 PM')).toBeInTheDocument()
    expect(screen.getByText('8:07 PM')).toBeInTheDocument()
  })

  it('credits Hebcal.com, same as the real Zmanim & Shabbos page, once ready', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    const link = screen.getByRole('link', { name: 'Hebcal.com' })
    expect(link).toHaveAttribute('href', 'https://www.hebcal.com')
  })

  it('shows the community-run line and a working "Suggest something" link regardless of zmanim status', () => {
    mockUseZmanim.mockReturnValue({ data: null, status: 'loading' })
    renderWithProviders(<HomeBreak coords={null} locationLabel="Philadelphia" />)

    expect(screen.getByRole('heading', { name: 'Kept current by people like you' })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Suggest something/ })
    expect(link).toHaveAttribute('href', expect.stringMatching(/\/feedback$/))
  })
})
