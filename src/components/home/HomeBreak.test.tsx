// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ZmanimData } from '@/types'
import type { ZmanimStatus } from '@/lib/useZmanim'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
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

  it('shows the community-run line regardless of zmanim status', () => {
    mockUseZmanim.mockReturnValue({ data: null, status: 'loading' })
    renderWithProviders(<HomeBreak coords={null} locationLabel="Philadelphia" />)

    expect(screen.getByRole('heading', { name: 'Kept current by people like you' })).toBeInTheDocument()
  })

  // Was a plain <a href="/feedback">, a real page navigation that left this
  // whole break (and everything else on the page) behind — clicking it
  // should open the same in-place modal SiteFooter's own FeedbackButton
  // does, not send the visitor to a bare page.
  it('opens the feedback form as an in-place modal, not a page navigation', async () => {
    const user = userEvent.setup()
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />)

    expect(screen.queryByRole('heading', { name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Send a note/ }))

    // The Zmanim card is still in the document underneath the modal — a
    // real navigation would have unmounted it.
    expect(screen.getByRole('heading', { name: 'Zmanim & Shabbos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).toBeInTheDocument()
  })

  it('hides the feedback link entirely when an admin has turned feedback off', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />, {
      content: { settings: { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled: false } },
    })

    expect(screen.queryByRole('button', { name: /Send a note/ })).not.toBeInTheDocument()
  })

  // Add/Edit/Report replaced the old single "Suggest something" button —
  // a real, named action beats a paragraph pointing at capabilities that
  // live elsewhere, and stays true even unclicked (it's what teaches a
  // visitor who's never opened a category page that the site works this
  // way at all). Add opens ContributePicker (a category search); Edit and
  // Report open EditReportPicker instead (a listing search) — see each
  // component's own tests for what happens after something is picked.
  describe('Add / Edit / Report', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })

    it.each([
      ['Add', 'Add a listing'],
      ['Edit', 'Edit a listing'],
      ['Report', 'Report a listing'],
    ])('opens the right picker from the %s button', async (buttonName, pickerTitle) => {
      const user = userEvent.setup()
      mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
      renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />, {
        content: { categories: [grocery] },
      })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: new RegExp(`^${buttonName}$`) }))

      expect(screen.getByRole('dialog', { name: pickerTitle })).toBeInTheDocument()
    })

    // The picker used to be a real backdrop modal, which closed itself on a
    // backdrop click. It's an anchored dropdown now (see HomeBreak's own
    // doc on why — a dark-backdrop dialog dissolving straight into an
    // unrelated full-page form read as two different interaction models
    // stitched together), so HomeBreak owns closing it instead.
    it('closes the open picker on Escape', async () => {
      const user = userEvent.setup()
      mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
      renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />, {
        content: { categories: [grocery] },
      })

      await user.click(screen.getByRole('button', { name: 'Add' }))
      expect(screen.getByRole('dialog', { name: 'Add a listing' })).toBeInTheDocument()

      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes the open picker on a click outside it', async () => {
      const user = userEvent.setup()
      mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
      renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />, {
        content: { categories: [grocery] },
      })

      await user.click(screen.getByRole('button', { name: 'Add' }))
      expect(screen.getByRole('dialog', { name: 'Add a listing' })).toBeInTheDocument()

      await user.click(screen.getByRole('heading', { name: 'Zmanim & Shabbos' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('switches straight from one picker to another without both flashing open', async () => {
      const user = userEvent.setup()
      mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
      renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} locationLabel="Philadelphia" />, {
        content: { categories: [grocery] },
      })

      await user.click(screen.getByRole('button', { name: 'Add' }))
      expect(screen.getByRole('dialog', { name: 'Add a listing' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Edit' }))
      expect(screen.queryByRole('dialog', { name: 'Add a listing' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Edit a listing' })).toBeInTheDocument()
    })
  })
})
