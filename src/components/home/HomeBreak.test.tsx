// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

// The break between the two main sections (Browse everything, Explore the
// map) — Davening Times and the "kept by the community" message. Shabbat
// Times and Stay in the loop used to live in this same grid; they moved to
// their own row below the map (see ShabbatTimesCard.test.tsx and
// SubscribeSection.test.tsx) and no longer share a component or a test
// file with this one.

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HomeBreak', () => {
  it('renders the community card as its own headed section', () => {
    renderWithProviders(<HomeBreak coords={null} />)

    expect(screen.getByRole('heading', { name: 'Kept by the community' })).toBeInTheDocument()
  })

  // Was a plain <a href="/feedback">, a real page navigation that left this
  // whole break (and everything else on the page) behind — clicking it
  // should open the same in-place modal SiteFooter's own FeedbackButton
  // does, not send the visitor to a bare page.
  it('opens the feedback form as an in-place modal, not a page navigation', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HomeBreak coords={null} />)

    expect(screen.queryByRole('heading', { name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Send a note/ }))

    // The community card is still in the document underneath the modal — a
    // real navigation would have unmounted it.
    expect(screen.getByRole('heading', { name: 'Kept by the community' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).toBeInTheDocument()
  })

  it('hides the feedback link entirely when an admin has turned feedback off', () => {
    renderWithProviders(<HomeBreak coords={null} />, {
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
      renderWithProviders(<HomeBreak coords={null} />, {
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
      renderWithProviders(
        <ListingsProvider listings={[]}>
          <HomeBreak coords={null} />
        </ListingsProvider>,
        { content: { categories: [makeCategory()] } }, // grocery only, no minyanim field
      )

      expect(screen.queryByRole('heading', { name: 'Upcoming Davening' })).not.toBeInTheDocument()
    })

    it('shows the next upcoming minyan today, skipping one that already passed', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-09-08T13:00:00')) // a Tuesday, 1:00 PM
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
            <HomeBreak coords={null} />
          </ListingsProvider>,
          { content: { categories: [synagogue] } },
        )

        expect(screen.getByRole('heading', { name: 'Upcoming Davening' })).toBeInTheDocument()
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
        const shuls = [
          makeListing({ id: 's1', category: 'synagogue', name: 'Shul A', minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '2:00pm' }] }),
          makeListing({ id: 's2', category: 'synagogue', name: 'Shul B', minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '2:00pm' }] }),
        ]

        renderWithProviders(
          <ListingsProvider listings={shuls}>
            <HomeBreak coords={null} />
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
            <HomeBreak coords={null} />
          </ListingsProvider>,
          { content: { categories: [synagogue] } },
        )
        expect(screen.queryByText(/mi$/)).not.toBeInTheDocument()

        const expectedMiles = distanceMiles(coords, shulGeo)
        rerenderWithProviders(
          <ListingsProvider listings={[shul]}>
            <HomeBreak coords={coords} />
          </ListingsProvider>,
        )
        expect(screen.getByText(new RegExp(`${expectedMiles} mi$`))).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('links "All davening times" to the category page with the minyanim field, opening the modal on arrival', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-09-08T13:00:00'))
        const shul = makeListing({
          id: 'shul-1',
          category: 'synagogue',
          name: 'Kahal Kadosh Mikveh Israel',
          minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '2:00pm' }],
        })

        renderWithProviders(
          <ListingsProvider listings={[shul]}>
            <HomeBreak coords={null} />
          </ListingsProvider>,
          { content: { categories: [synagogue] } },
        )

        // `?davening=1` is what makes this actually land on the sheet the
        // link names, rather than a bare category page the visitor then has
        // to find the same button on again — see GenericDirectory's own
        // `openDaveningModal` doc.
        const link = screen.getByRole('link', { name: /All davening times/ })
        expect(link).toHaveAttribute('href', '/test-community/synagogue?davening=1')
      } finally {
        vi.useRealTimers()
      }
    })

    // When every minyan today has already passed, nextUpcomingDavening rolls
    // over to tomorrow's earliest — "All davening times" needs `&day=` or it
    // lands the visitor on the modal's default "Today" filter, showing
    // nothing left and no visible reason why. See DaveningTimesCard's own
    // `seeAllHref` doc.
    it('adds &day= to "All davening times" when the shown minyan is tomorrow\'s', () => {
      vi.useFakeTimers()
      try {
        // Tuesday 11pm — every minyan today has passed, so the next one is
        // Wednesday's.
        vi.setSystemTime(new Date('2026-09-08T23:00:00'))
        const shul = makeListing({
          id: 'shul-1',
          category: 'synagogue',
          name: 'Kahal Kadosh Mikveh Israel',
          minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['wed'], time: '7:00am' }],
        })

        renderWithProviders(
          <ListingsProvider listings={[shul]}>
            <HomeBreak coords={null} />
          </ListingsProvider>,
          { content: { categories: [synagogue] } },
        )

        expect(screen.getByText('tmrw')).toBeInTheDocument()
        const link = screen.getByRole('link', { name: /All davening times/ })
        expect(link).toHaveAttribute('href', '/test-community/synagogue?davening=1&day=wed')
      } finally {
        vi.useRealTimers()
      }
    })

    // Root cause: this card used to read the day/hour off the VISITOR's own
    // device clock (new Date(now).getDay()/.getHours()), not the community's
    // configured timezone — so a visitor whose device timezone disagreed
    // with the community's (a phone that travelled, a hospital kiosk set to
    // UTC) could get handed tomorrow's minyan while it was still today, or
    // vice versa. Pin the machine's own TZ to something far from the
    // community's (America/New_York) and confirm the card still reads the
    // community's wall-clock day/time, not the machine's.
    it('reads the community\'s own timezone, not the visitor device clock, for "today"', () => {
      const originalTz = process.env.TZ
      process.env.TZ = 'Asia/Tokyo'
      vi.useFakeTimers()
      try {
        // 2026-09-08T23:00:00 UTC is Tuesday 7:00 PM in America/New_York
        // (the community's timezone) but already Wednesday 8:00 AM in
        // Asia/Tokyo (the machine's timezone under this test).
        vi.setSystemTime(new Date('2026-09-08T23:00:00Z'))
        const shul = makeListing({
          id: 'shul-1',
          category: 'synagogue',
          name: 'Kahal Kadosh Mikveh Israel',
          minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '7:30pm' }],
        })

        renderWithProviders(
          <ListingsProvider listings={[shul]}>
            <HomeBreak coords={null} />
          </ListingsProvider>,
          { content: { categories: [synagogue] } },
        )

        // A device-local read would see Wednesday morning and find no match
        // for Tuesday's minyan at all ("No davening times posted yet.").
        // Reading the community's timezone finds it, still today.
        expect(screen.getByText('7:30pm')).toBeInTheDocument()
        expect(screen.queryByText('tmrw')).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
        process.env.TZ = originalTz
      }
    })
  })
})
