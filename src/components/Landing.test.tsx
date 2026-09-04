// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { track } from '@vercel/analytics'
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

// HomeMap and HomeBreak are mocked out — both pull in real network/SDK
// dependencies of their own (Google Maps, the uncached /api/zmanim fetch)
// that are their own components' concerns, not Landing's. What's under test
// here is Landing's own composition/filtering logic: which sections render,
// whether typing narrows the grid, and whether the map/zmanim bands appear
// only when the community actually has those pseudo-categories.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('@/components/home/HomeMap', () => ({
  default: () => <div data-testid="home-map-stub" />,
}))
vi.mock('@/components/home/HomeBreak', () => ({
  // HomeBreak dropped the admin-renamed `title` prop entirely (it's the
  // quiet, unheaded break now — see its own doc on why showing a topic
  // title there would undo the point), so unlike the old ZmanimStrip mock
  // this stub has nothing to prove beyond "it rendered".
  default: () => <div data-testid="home-break-stub" />,
}))

afterEach(() => {
  cleanup()
  resetMockIntersectionObserver()
})

const handlers = {
  onNavigate: vi.fn(),
  onOpenFlow: vi.fn(),
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

    // getAllByText, not getByText: HeroHeading renders both its mobile and
    // desktop layouts in the DOM at once (toggled by CSS, not JS — see that
    // component's own doc), so the heading/mission text exists twice.
    expect(screen.getAllByText('Welcome to the directory').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Everything nearby').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Grocery Stores').length).toBeGreaterThan(0)
  })

  it('narrows the grid to matching cards when typing, and hides the rest', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    renderLanding(undefined, { content: { categories: [grocery, synagogue] } })

    // getAllByLabelText, not getByLabelText: HeroHeading now renders the
    // search box twice in the DOM (mobile's plain block and desktop's warm
    // band), toggled with `desktop:hidden`/`hidden desktop:` classes rather
    // than a JS branch — see that component's own doc on why. jsdom doesn't
    // apply CSS, so both are genuinely present; either one drives the same
    // Landing state, so the first is as good as any for a test.
    await user.type(screen.getAllByLabelText('Search resources')[0]!, 'grocery')

    // getAllByText, not getByText: the same result set now renders twice in
    // the DOM once there's a query — mobile's own permanent grid section,
    // and desktop's copy inside SearchSection's white box (see Landing's
    // resultsNode doc on why: a single mount can't live in two different
    // places in the tree, so this is genuine, deliberate duplication, not a
    // bug). jsdom doesn't apply CSS, so both are visible to a query here.
    expect(screen.getAllByText('Grocery Stores').length).toBeGreaterThan(0)
    expect(screen.queryByText('Synagogues')).not.toBeInTheDocument()
  })

  it('shows a "nothing matches" message for a query with no hits', async () => {
    const user = userEvent.setup()
    renderLanding(undefined, { content: { categories: [makeCategory()] } })

    await user.type(screen.getAllByLabelText('Search resources')[0]!, 'xyznotreal')

    expect(screen.getAllByText(/Nothing matches “xyznotreal”/).length).toBeGreaterThan(0)
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

  it('renders the zmanim break only when the community has a zmanim pseudo-category', () => {
    const withZmanim = makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' })
    const { unmount } = renderLanding(undefined, { content: { categories: [withZmanim] } })
    expect(screen.getByTestId('home-break-stub')).toBeInTheDocument()
    unmount()

    renderLanding(undefined, { content: { categories: [makeCategory()] } })
    expect(screen.queryByTestId('home-break-stub')).not.toBeInTheDocument()
  })

  describe('the gateway block order (Explore the map / Zmanim & Shabbos)', () => {
    const withMapAndZmanim = [
      makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' }),
      makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' }),
    ]

    it('defaults to zmanim before map when nothing is configured (no built-in rows at all)', () => {
      const { container } = renderLanding(undefined, {
        content: { categories: withMapAndZmanim, homeSections: [] },
      })
      // HomeMap itself doesn't mount until the band scrolls near (see
      // useInView) — irrelevant to this test, which only cares about DOM
      // order, so just force it in so home-map-stub is there to compare.
      act(() => triggerAllIntersections())

      const html = container.innerHTML
      expect(html.indexOf('data-testid="home-break-stub"')).toBeLessThan(html.indexOf('data-testid="home-map-stub"'))
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
      expect(html.indexOf('data-testid="home-break-stub"')).toBeLessThan(html.indexOf('data-testid="home-map-stub"'))
    })

    // Only the map half of this is still meaningful — HomeBreak dropped the
    // admin-renamed title entirely (it's the quiet, unheaded break now), so
    // an admin renaming that block has nothing left to prove on screen.
    it('renders the map’s admin-renamed title, not the built-in default', () => {
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
    })

    it('hides a built-in block that was configured out (removed), even though its category exists', () => {
      renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          homeSections: [{ id: 'zmanim', kind: 'zmanim', title: 'Zmanim & Shabbos', sortOrder: 100, cardIds: [] }],
        },
      })

      expect(screen.getByTestId('home-break-stub')).toBeInTheDocument()
      expect(screen.queryByTestId('home-map-stub')).not.toBeInTheDocument()
    })
  })

  describe('the "Browse everything" flat grid (desktop)', () => {
    // The tab nav above already lists every category too, grouped under
    // invented umbrella labels and hidden until hover — this grid exists
    // specifically so nothing is grouped and nothing needs hovering. Its own
    // describe block, not folded into the "narrows the grid" test above,
    // because that test's assertions are about the mobile/search grid one
    // section down, not this one.
    it('shows every card flat, not grouped under a section heading', () => {
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
      renderLanding(undefined, { content: { categories: [grocery, synagogue] } })

      const heading = screen.getByRole('heading', { name: 'Browse everything' })
      // Both cards render as siblings under the ONE "Browse everything"
      // heading — not under their own admin-configured section titles
      // ("Food and Hospitality", etc.), which is what "flat" means here.
      const grid = heading.parentElement!
      expect(within(grid).getByText('Grocery Stores')).toBeInTheDocument()
      expect(within(grid).getByText('Synagogues')).toBeInTheDocument()
    })

    // A list meant to hold every card at once (13+ real categories, growing)
    // reads as "too many different things crammed together" the moment each
    // row gets its own bordered box — that's the exact complaint that moved
    // this section from CardGrid's photo tiles to CompactCardGrid in the
    // first place. A border re-added later, even a subtle one, quietly
    // reintroduces the same crowding at scale.
    it('rows have no border/background at rest — only on hover, like the tab nav\'s own menu items', () => {
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      renderLanding(undefined, { content: { categories: [grocery] } })

      const heading = screen.getByRole('heading', { name: 'Browse everything' })
      const row = within(heading.parentElement!).getByText('Grocery Stores').closest('a')!
      expect(row.className).not.toMatch(/\bborder\b/)
      expect(row.className).not.toMatch(/\bbg-white\b/)
      expect(row.className).toMatch(/hover:bg-slate-50/)
    })

    it('hides while actively searching — the grouped grid below already serves as results', async () => {
      const user = userEvent.setup()
      renderLanding(undefined, { content: { categories: [makeCategory({ pluralLabel: 'Grocery Stores' })] } })

      expect(screen.getByRole('heading', { name: 'Browse everything' })).toBeInTheDocument()
      await user.type(screen.getAllByLabelText('Search resources')[0]!, 'grocery')
      expect(screen.queryByRole('heading', { name: 'Browse everything' })).not.toBeInTheDocument()
    })

    it('tracks category_opened with source "grid" on a card click', async () => {
      const user = userEvent.setup()
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      renderLanding(undefined, { content: { categories: [grocery] } })

      const heading = screen.getByRole('heading', { name: 'Browse everything' })
      await user.click(within(heading.parentElement!).getByText('Grocery Stores'))

      expect(vi.mocked(track)).toHaveBeenCalledWith('category_opened', { category: 'grocery', source: 'grid' })
    })
  })

})
