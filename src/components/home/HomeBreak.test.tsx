// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ZmanimData } from '@/types'
import type { ZmanimStatus } from '@/lib/useZmanim'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { ListingsProvider } from '@/lib/listingsContext'
import { distanceMiles } from '@/lib/geo'
import HomeBreak from './HomeBreak'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The transition between the two main sections (Browse everything, Explore
// the map) — a 2×2 grid of four cards: Davening Times, the "kept by the
// community" message, Stay in the loop, and Shabbat Times. The things worth
// locking down: every card renders as its own headed section, Shabbat Times
// shows only candle lighting and havdalah (not the old five-row daily
// grid), and the community message renders regardless of the zmanim
// fetch's own state. Davening Times has its own describe block below, since
// its content depends on real synagogue data rather than just settings.

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
  it('renders the community and Shabbat Times cards as their own headed sections', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} visitorCoords={null} locationLabel="Philadelphia" />)

    expect(screen.getByRole('heading', { name: 'Shabbat Times' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kept by the community' })).toBeInTheDocument()
  })

  it('renders the Stay in the loop signup as part of this grid, not a separate section', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} visitorCoords={null} locationLabel="Philadelphia" />)

    expect(screen.getByRole('heading', { name: 'Stay in the loop' })).toBeInTheDocument()
  })

  it('shows only candle lighting and havdalah — not the old five-row daily zmanim grid', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} visitorCoords={null} locationLabel="Philadelphia" />)

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
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} visitorCoords={null} locationLabel="Philadelphia" />)

    const link = screen.getByRole('link', { name: 'Hebcal.com' })
    expect(link).toHaveAttribute('href', 'https://www.hebcal.com')
  })

  it('shows the community-run line regardless of zmanim status', () => {
    mockUseZmanim.mockReturnValue({ data: null, status: 'loading' })
    renderWithProviders(<HomeBreak coords={null} visitorCoords={null} locationLabel="Philadelphia" />)

    expect(screen.getByRole('heading', { name: 'Kept by the community' })).toBeInTheDocument()
  })

  // Was a plain <a href="/feedback">, a real page navigation that left this
  // whole break (and everything else on the page) behind — clicking it
  // should open the same in-place modal SiteFooter's own FeedbackButton
  // does, not send the visitor to a bare page.
  it('opens the feedback form as an in-place modal, not a page navigation', async () => {
    const user = userEvent.setup()
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} visitorCoords={null} locationLabel="Philadelphia" />)

    expect(screen.queryByRole('heading', { name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Send a note/ }))

    // Shabbat Times is still in the document underneath the modal — a real
    // navigation would have unmounted it.
    expect(screen.getByRole('heading', { name: 'Shabbat Times' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).toBeInTheDocument()
  })

  it('hides the feedback link entirely when an admin has turned feedback off', () => {
    mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
    renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} visitorCoords={null} locationLabel="Philadelphia" />, {
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
  //
  // The accessible name stays the short word ("Add"/"Edit"/"Report")
  // regardless of the visible label — see ContributeButton's own doc — so
  // this test doesn't need to know or care which one CSS happens to show at
  // jsdom's default (unstyled) width.
  describe('Add / Edit / Report', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })

    it.each([
      ['Add', 'Add a listing'],
      ['Edit', 'Edit a listing'],
      ['Report', 'Report a listing'],
    ])('opens the right picker from the %s button', async (buttonName, pickerTitle) => {
      const user = userEvent.setup()
      mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
      renderWithProviders(<HomeBreak coords={{ lat: 1, lng: 2 }} visitorCoords={null} locationLabel="Philadelphia" />, {
        content: { categories: [grocery] },
      })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: new RegExp(`^${buttonName}$`) }))

      expect(screen.getByRole('dialog', { name: pickerTitle })).toBeInTheDocument()
    })
  })

  // The one-line "what's next, anywhere" card — see upcomingDavening.test.ts
  // for the aggregation/tie-collapse logic itself; these tests are about
  // this component actually wiring real listings/categories into it.
  describe('Davening Times card', () => {
    const synagogue = makeCategory({
      id: 'synagogue',
      pluralLabel: 'Synagogues',
      detailFields: [{ key: 'minyanim', label: 'Davening Times (Minyanim)', type: 'minyanim', renderAs: 'row' }],
    })

    it('does not render when no category has a minyanim field — a real "not set up", not a loading state', () => {
      mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
      renderWithProviders(
        <ListingsProvider listings={[]}>
          <HomeBreak coords={{ lat: 1, lng: 2 }} visitorCoords={null} locationLabel="Philadelphia" />
        </ListingsProvider>,
        { content: { categories: [makeCategory()] } }, // grocery only, no minyanim field
      )

      expect(screen.queryByRole('heading', { name: 'Davening Times' })).not.toBeInTheDocument()
    })

    it('shows the next upcoming minyan today, skipping one that already passed', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-09-08T13:00:00')) // a Tuesday, 1:00 PM
        mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
        const shul = makeListing({
          id: 'shul-1',
          category: 'synagogue',
          name: 'Kahal Kadosh Mikveh Israel',
          minyanim: [
            { id: 'm1', tefillah: 'shacharis', days: ['tue'], time: '7:15am' }, // already passed by 1pm
            { id: 'm2', tefillah: 'mincha', days: ['tue'], time: '2:00pm' },
          ],
        })

        renderWithProviders(
          <ListingsProvider listings={[shul]}>
            <HomeBreak coords={null} visitorCoords={null} locationLabel="Philadelphia" />
          </ListingsProvider>,
          { content: { categories: [synagogue] } },
        )

        expect(screen.getByRole('heading', { name: 'Davening Times' })).toBeInTheDocument()
        expect(screen.getByText('Mincha')).toBeInTheDocument()
        expect(screen.getByText('Kahal Kadosh Mikveh Israel')).toBeInTheDocument()
        expect(screen.getByText('2:00pm')).toBeInTheDocument()
        expect(screen.queryByText('7:15am')).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('collapses an identical time at two shuls into "at 2 nearby shuls" instead of naming one arbitrarily', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-09-08T13:00:00'))
        mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
        const shuls = [
          makeListing({ id: 's1', category: 'synagogue', name: 'Shul A', minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '2:00pm' }] }),
          makeListing({ id: 's2', category: 'synagogue', name: 'Shul B', minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '2:00pm' }] }),
        ]

        renderWithProviders(
          <ListingsProvider listings={shuls}>
            <HomeBreak coords={null} visitorCoords={null} locationLabel="Philadelphia" />
          </ListingsProvider>,
          { content: { categories: [synagogue] } },
        )

        expect(screen.getByText('at 2 nearby shuls')).toBeInTheDocument()
        expect(screen.queryByText('Shul A')).not.toBeInTheDocument()
        expect(screen.queryByText('Shul B')).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('shows distance to the shul once a location is set, and omits it when none is', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-09-08T13:00:00'))
        mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
        const shulGeo = { lat: 40.0, lng: -75.0 }
        const coords = { lat: 40.01, lng: -75.0 }
        const shul = makeListing({
          id: 'shul-1',
          category: 'synagogue',
          name: 'Kahal Kadosh Mikveh Israel',
          geo: shulGeo,
          minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '2:00pm' }],
        })

        const { rerenderWithProviders } = renderWithProviders(
          <ListingsProvider listings={[shul]}>
            <HomeBreak coords={null} visitorCoords={null} locationLabel="Philadelphia" />
          </ListingsProvider>,
          { content: { categories: [synagogue] } },
        )
        expect(screen.queryByText(/mi$/)).not.toBeInTheDocument()

        const expectedMiles = distanceMiles(coords, shulGeo)
        rerenderWithProviders(
          <ListingsProvider listings={[shul]}>
            <HomeBreak coords={null} visitorCoords={coords} locationLabel="Philadelphia" />
          </ListingsProvider>,
        )
        expect(screen.getByText(new RegExp(`${expectedMiles} mi$`))).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('links "All davening times" to the category page with the minyanim field', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-09-08T13:00:00'))
        mockUseZmanim.mockReturnValue({ data: readyData, status: 'ready' })
        const shul = makeListing({
          id: 'shul-1',
          category: 'synagogue',
          name: 'Kahal Kadosh Mikveh Israel',
          minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '2:00pm' }],
        })

        renderWithProviders(
          <ListingsProvider listings={[shul]}>
            <HomeBreak coords={null} visitorCoords={null} locationLabel="Philadelphia" />
          </ListingsProvider>,
          { content: { categories: [synagogue] } },
        )

        const link = screen.getByRole('link', { name: /All davening times/ })
        expect(link).toHaveAttribute('href', '/test-community/synagogue')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
