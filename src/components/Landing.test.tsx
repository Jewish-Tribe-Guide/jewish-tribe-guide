// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { LocationProvider } from '@/lib/locationContext'
import { resetMockIntersectionObserver, triggerAllIntersections } from '@/test/intersectionObserverMock'
import { mockRouter } from '@/test/nextNavigationMock'
import Landing from './Landing'

// Card tiles now render as real <Link>s (see sections.tsx's CardDef.href),
// which is what makes cmd/ctrl-click "open in new tab" work — that pulled
// useCommunitySlug() into Landing's own render for the first time, and that
// hook calls next/navigation's useRouter() unconditionally. See
// nextNavigationMock's own doc comment.
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// HomeMap and ZmanimStrip are mocked out — both pull in real network/SDK
// dependencies of their own (Google Maps, the uncached /api/zmanim fetch)
// that are their own components' concerns, not Landing's. What's under test
// here is Landing's own composition/filtering logic: which sections render,
// whether typing narrows the grid, and whether the map/zmanim bands appear
// only when the community actually has those pseudo-categories.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('@/components/home/HomeMap', () => ({
  default: () => <div data-testid="home-map-stub" />,
}))
vi.mock('@/components/home/ZmanimStrip', () => ({
  // Renders the real `title` prop (unlike coords/locationLabel, which pull
  // in the network dependency this mock exists to avoid) — Landing passes
  // the admin-renamed topic title through here, and a test needs to see it
  // to prove that wiring, not just that the stub is present.
  default: ({ title }: { title: string }) => <div data-testid="zmanim-strip-stub">{title}</div>,
}))

afterEach(() => {
  cleanup()
  resetMockIntersectionObserver()
})

const handlers = {
  onNavigate: vi.fn(),
  onOpenFlow: vi.fn(),
  onViewAllCategories: vi.fn(),
  coords: null,
  liveTracking: { tracking: false, error: null, start: vi.fn(), stop: vi.fn() },
  controls: {
    address: '',
    coords: null,
    onAddressChange: vi.fn(),
    onCoords: vi.fn(),
    tracking: false,
    geoError: null,
    geoErrorSilent: false,
    onStartTracking: vi.fn(),
    onStopTracking: vi.fn(),
  },
}

// Landing now reads useLocation() directly (for the zmanim location label —
// see zmanimLocationLabel), which throws outside a LocationProvider. Wraps
// renderWithProviders' own element instead of duplicating its provider
// stack/options handling.
function renderLanding(
  props: Partial<ComponentProps<typeof Landing>> = {},
  options?: Parameters<typeof renderWithProviders>[1],
): RenderResult {
  return renderWithProviders(
    <LocationProvider>
      <Landing {...handlers} {...props} />
    </LocationProvider>,
    options,
  )
}

describe('Landing', () => {
  it('shows the configured hero title/mission and the category grid', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderLanding(undefined, {
      content: {
        categories: [grocery],
        settings: { ...SITE_SETTINGS_DEFAULTS, heroTitle: 'Welcome to the directory', mission: 'Everything nearby' },
      },
    })

    expect(screen.getByText('Welcome to the directory')).toBeInTheDocument()
    expect(screen.getByText('Everything nearby')).toBeInTheDocument()
    expect(screen.getAllByText('Grocery Stores').length).toBeGreaterThan(0)
  })

  it('narrows the grid to matching cards when typing, and hides the rest', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    renderLanding(undefined, { content: { categories: [grocery, synagogue] } })

    await user.type(screen.getByLabelText('Filter resources'), 'grocery')

    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.queryByText('Synagogues')).not.toBeInTheDocument()
  })

  it('shows a "nothing matches" message for a query with no hits', async () => {
    const user = userEvent.setup()
    renderLanding(undefined, { content: { categories: [makeCategory()] } })

    await user.type(screen.getByLabelText('Filter resources'), 'xyznotreal')

    expect(screen.getByText(/Nothing matches “xyznotreal”/)).toBeInTheDocument()
  })

  it('renders the map band only when the community has a Map pseudo-category, deferring HomeMap itself until scrolled near', () => {
    const withMap = makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' })
    const { unmount } = renderLanding(undefined, { content: { categories: [withMap] } })
    // The band exists (a placeholder of the same footprint), but HomeMap
    // itself — and the Google Maps SDK it pulls in — doesn't mount until
    // useInView says the band has actually scrolled near. See useInView's
    // own doc comment for why this matters most on mobile, where the band
    // is `hidden` outright and never intersects at all.
    expect(screen.queryByTestId('home-map-stub')).not.toBeInTheDocument()
    act(() => triggerAllIntersections())
    expect(screen.getByTestId('home-map-stub')).toBeInTheDocument()
    unmount()

    renderLanding(undefined, { content: { categories: [makeCategory()] } })
    act(() => triggerAllIntersections())
    expect(screen.queryByTestId('home-map-stub')).not.toBeInTheDocument()
  })

  it('renders the zmanim strip only when the community has a zmanim pseudo-category', () => {
    const withZmanim = makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' })
    const { unmount } = renderLanding(undefined, { content: { categories: [withZmanim] } })
    expect(screen.getByTestId('zmanim-strip-stub')).toBeInTheDocument()
    unmount()

    renderLanding(undefined, { content: { categories: [makeCategory()] } })
    expect(screen.queryByTestId('zmanim-strip-stub')).not.toBeInTheDocument()
  })

  describe('the gateway block order (Popular right now / Explore the map / Zmanim & Shabbos)', () => {
    const withMapAndZmanim = [
      makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' }),
      makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' }),
    ]

    it('defaults to map before zmanim when nothing is configured (no built-in rows at all)', () => {
      const { container } = renderLanding(undefined, {
        content: { categories: withMapAndZmanim, homeSections: [] },
      })
      // HomeMap itself doesn't mount until the band scrolls near (see
      // useInView) — irrelevant to this test, which only cares about DOM
      // order, so just force it in so home-map-stub is there to compare.
      act(() => triggerAllIntersections())

      const html = container.innerHTML
      expect(html.indexOf('data-testid="home-map-stub"')).toBeLessThan(html.indexOf('data-testid="zmanim-strip-stub"'))
    })

    it('follows the admin-configured order — zmanim before map', () => {
      const { container } = renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          homeSections: [
            { id: 'zmanim', kind: 'zmanim', title: 'Zmanim & Shabbos', sortOrder: 100, cardIds: [] },
            { id: 'map', kind: 'map', title: 'Explore the map', sortOrder: 200, cardIds: [] },
          ],
        },
      })
      act(() => triggerAllIntersections())

      const html = container.innerHTML
      expect(html.indexOf('data-testid="zmanim-strip-stub"')).toBeLessThan(html.indexOf('data-testid="home-map-stub"'))
    })

    it('renders an admin-renamed topic’s own title, not the built-in default', () => {
      renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          homeSections: [
            { id: 'map', kind: 'map', title: 'See it on the map', sortOrder: 100, cardIds: [] },
            { id: 'zmanim', kind: 'zmanim', title: 'Shabbos Times', sortOrder: 200, cardIds: [] },
          ],
        },
      })

      expect(screen.getByRole('heading', { name: 'See it on the map' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Explore the map' })).not.toBeInTheDocument()
      expect(screen.getByTestId('zmanim-strip-stub')).toHaveTextContent('Shabbos Times')
    })

    it('hides a built-in block that was configured out (removed), even though its category exists', () => {
      renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          homeSections: [{ id: 'zmanim', kind: 'zmanim', title: 'Zmanim & Shabbos', sortOrder: 100, cardIds: [] }],
        },
      })

      expect(screen.getByTestId('zmanim-strip-stub')).toBeInTheDocument()
      expect(screen.queryByTestId('home-map-stub')).not.toBeInTheDocument()
    })
  })

  it('calls onViewAllCategories when "Browse all categories" is clicked', async () => {
    const user = userEvent.setup()
    const onViewAllCategories = vi.fn()
    renderLanding(
      { onViewAllCategories },
      { content: { categories: [makeCategory()] } },
    )

    await user.click(screen.getByRole('button', { name: /Browse all categories/ }))

    expect(onViewAllCategories).toHaveBeenCalledTimes(1)
  })
})
