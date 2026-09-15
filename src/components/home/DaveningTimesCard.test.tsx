// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { ListingsProvider } from '@/lib/listingsContext'
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

// Photo-card redesign (matching a reference image the user supplied): fixed
// "Upcoming"/"Davening Times"/"See minyanim near you." copy and a "View
// Times" button — no specific next-minyan time/shul/countdown on the card
// face any more (see upcomingDavening.test.ts for that aggregation logic,
// still exercised here only through the seeAllHref `&day=` routing below).
// This card's own remaining job is gating on whether the community has a
// minyanim category at all, and linking to the right place.
describe('DaveningTimesCard', () => {
  const synagogue = makeCategory({
    id: 'synagogue',
    pluralLabel: 'Synagogues',
    detailFields: [{ key: 'minyanim', label: 'Davening Times (Minyanim)', type: 'minyanim', renderAs: 'row' }],
  })

  it('renders its fixed copy', () => {
    const shul = makeListing({
      id: 'shul-1',
      category: 'synagogue',
      name: 'Kahal Kadosh Mikveh Israel',
      minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '2:00pm' }],
    })
    renderWithProviders(
      <ListingsProvider listings={[shul]}>
        <DaveningTimesCard coords={null} />
      </ListingsProvider>,
      { content: { categories: [synagogue] } },
    )

    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Davening Times' })).toBeInTheDocument()
    expect(screen.getByText('See minyanim near you.')).toBeInTheDocument()
  })

  it('does not render when no category has a minyanim field — a real "not set up", not a loading state', () => {
    renderWithProviders(
      <ListingsProvider listings={[]}>
        <DaveningTimesCard coords={null} />
      </ListingsProvider>,
      { content: { categories: [makeCategory()] } }, // grocery only, no minyanim field
    )

    expect(screen.queryByRole('heading', { name: 'Davening Times' })).not.toBeInTheDocument()
  })

  it('links "View Times" to the category page with the minyanim field, opening the modal on arrival', () => {
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
          <DaveningTimesCard coords={null} />
        </ListingsProvider>,
        { content: { categories: [synagogue] } },
      )

      // `?davening=1` is what makes this actually land on the sheet the
      // button names, rather than a bare category page the visitor then has
      // to find the same button on again — see GenericDirectory's own
      // `openDaveningModal` doc.
      const link = screen.getByRole('link', { name: /View Times/ })
      expect(link).toHaveAttribute('href', '/test-community/synagogue?davening=1')
    } finally {
      vi.useRealTimers()
    }
  })

  // When every minyan today has already passed, nextUpcomingDavening rolls
  // over to tomorrow's earliest — "View Times" needs `&day=` or it lands
  // the visitor on the modal's default "Today" filter, showing nothing left
  // and no visible reason why. See this component's own `seeAllHref` doc.
  // The card face itself no longer shows which day that is, but the link
  // still has to route there correctly.
  it('adds &day= to "View Times" when the next minyan is tomorrow\'s', () => {
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
          <DaveningTimesCard coords={null} />
        </ListingsProvider>,
        { content: { categories: [synagogue] } },
      )

      const link = screen.getByRole('link', { name: /View Times/ })
      expect(link).toHaveAttribute('href', '/test-community/synagogue?davening=1&day=wed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('has no photo placeholder overlapping the text column', () => {
    const shul = makeListing({
      id: 'shul-1',
      category: 'synagogue',
      name: 'Kahal Kadosh Mikveh Israel',
      minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '2:00pm' }],
    })
    const { container } = renderWithProviders(
      <ListingsProvider listings={[shul]}>
        <DaveningTimesCard coords={null} />
      </ListingsProvider>,
      { content: { categories: [synagogue] } },
    )

    const textColumn = screen.getByRole('heading', { name: 'Davening Times' }).closest('div')!
    expect(textColumn.className).toMatch(/max-w-\[58%\]/)
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
