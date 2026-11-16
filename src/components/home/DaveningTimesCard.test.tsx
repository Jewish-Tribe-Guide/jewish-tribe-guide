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

// Board G5b (Nov 11): an answer card. The next minyan big ("Mincha 2:00 PM"),
// where under it, and the whole card one link to that day's minyanim. The
// time logic has its own tests (upcomingDavening.test.ts); these check the
// card shows what it picks and links where it should.
const answer = () => screen.getByTestId('home-next-minyan-answer')
const detail = () => screen.getByTestId('home-next-minyan-detail')

describe('DaveningTimesCard', () => {
  const synagogue = makeCategory({
    id: 'synagogue',
    pluralLabel: 'Synagogues',
    detailFields: [{ key: 'minyanim', label: 'Davening Times (Minyanim)', type: 'minyanim', renderAs: 'row' }],
  })

  it('answers with the next minyan, its shul under it, and no photo or heading', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-08T13:00:00'))
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

      expect(screen.getByTestId('home-next-minyan-eyebrow')).toHaveTextContent('Next minyan')
      expect(answer()).toHaveTextContent(/^Mincha 2 PM$/)
      expect(detail()).toHaveTextContent('Kahal Kadosh Mikveh Israel')
      expect(container.querySelector('img')).toBeNull()
      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
      expect(screen.getAllByRole('link')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not render when no category has a minyanim field — a real "not set up", not a loading state', () => {
    renderWithProviders(
      <ListingsProvider listings={[]}>
        <DaveningTimesCard coords={null} />
      </ListingsProvider>,
      { content: { categories: [makeCategory()] } }, // grocery only, no minyanim field
    )

    expect(screen.queryByTestId('home-next-minyan')).not.toBeInTheDocument()
  })

  it('links the card to the category page with the minyanim field, opening the Minyanim view on arrival', () => {
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

      // `?davening=1` is what makes this actually land on the view the
      // button names, rather than a bare category page the visitor then has
      // to find the same button on again — see GenericDirectory's own
      // `openMinyanimView` doc.
      const link = screen.getByTestId('home-next-minyan')
      expect(link).toHaveAttribute('href', '/test-community/synagogue?davening=1')
    } finally {
      vi.useRealTimers()
    }
  })

  // When every minyan today has already passed, nextUpcomingDavening rolls
  // over to tomorrow's earliest — the card's link needs `&day=` or it lands
  // the visitor on the Minyanim view's Today, showing nothing left
  // and no visible reason why. See this component's own `seeAllHref` doc.
  // The card says "tomorrow" under the time, and the link routes there.
  it('adds &day= to the card link when the next minyan is tomorrow’s', () => {
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

      const link = screen.getByTestId('home-next-minyan')
      expect(link).toHaveAttribute('href', '/test-community/synagogue?davening=1&day=wed')
      expect(detail()).toHaveTextContent(/tomorrow$/)
    } finally {
      vi.useRealTimers()
    }
  })

  // Seen on dev (Nov 11): Food also had a minyanim field and came first, so
  // the card linked to Food and drew its fork and knife. It goes where the
  // shuls are, the same page the schedule reads.
  it('links to the category that holds the shuls, not the first with a minyanim field', () => {
    const food = makeCategory({
      id: 'restaurant',
      pluralLabel: 'Food',
      detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim', renderAs: 'row' }],
    })
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
      { content: { categories: [food, synagogue] } },
    )

    expect(screen.getByTestId('home-next-minyan').getAttribute('href')).toMatch(/^\/test-community\/synagogue\?davening=1/)
  })
})
