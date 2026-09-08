// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { ListingsProvider } from '@/lib/listingsContext'
import { distanceMiles } from '@/lib/geo'
import DaveningTimesCard from './DaveningTimesCard'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// The one-line "what's next, anywhere" card — see upcomingDavening.test.ts
// for the aggregation/tie-collapse logic itself; these tests are about this
// component actually wiring real listings/categories into it. Used to
// render only inside HomeBreak, paired with the community card — now a
// fully standalone card (see homeSections.ts's own doc on why the pair
// split), so these tests render it directly instead.
describe('DaveningTimesCard', () => {
  const synagogue = makeCategory({
    id: 'synagogue',
    pluralLabel: 'Synagogues',
    detailFields: [{ key: 'minyanim', label: 'Davening Times (Minyanim)', type: 'minyanim', renderAs: 'row' }],
  })

  it('renders the admin-editable eyebrow/heading', () => {
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
          <DaveningTimesCard coords={null} eyebrow="Right now" heading="Next Minyan" />
        </ListingsProvider>,
        { content: { categories: [synagogue] } },
      )

      expect(screen.getByText('Right now')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Next Minyan' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not render when no category has a minyanim field — a real "not set up", not a loading state', () => {
    renderWithProviders(
      <ListingsProvider listings={[]}>
        <DaveningTimesCard coords={null} eyebrow="Today" heading="Upcoming Davening" />
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
          <DaveningTimesCard coords={null} eyebrow="Today" heading="Upcoming Davening" />
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
          <DaveningTimesCard coords={null} eyebrow="Today" heading="Upcoming Davening" />
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
          <DaveningTimesCard coords={null} eyebrow="Today" heading="Upcoming Davening" />
        </ListingsProvider>,
        { content: { categories: [synagogue] } },
      )
      expect(screen.queryByText(/mi$/)).not.toBeInTheDocument()

      const expectedMiles = distanceMiles(coords, shulGeo)
      rerenderWithProviders(
        <ListingsProvider listings={[shul]}>
          <DaveningTimesCard coords={coords} eyebrow="Today" heading="Upcoming Davening" />
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
          <DaveningTimesCard coords={null} eyebrow="Today" heading="Upcoming Davening" />
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
  // nothing left and no visible reason why. See this component's own
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
          <DaveningTimesCard coords={null} eyebrow="Today" heading="Upcoming Davening" />
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
          <DaveningTimesCard coords={null} eyebrow="Today" heading="Upcoming Davening" />
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
