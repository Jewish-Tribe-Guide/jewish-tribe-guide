// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { track } from '@vercel/analytics'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { LocationProvider } from '@/lib/locationContext'
import { ListingsProvider } from '@/lib/listingsContext'
import type { DirectoryResource } from '@/types'
import { resetMockIntersectionObserver, setAllIntersecting, triggerAllIntersections } from '@/test/intersectionObserverMock'
import { mockRouter } from '@/test/nextNavigationMock'
import { markHomeReveal } from '@/lib/homeRevealSignal'
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

// HomeMap and DaveningTimesCard are mocked out — both pull in real
// network/SDK dependencies of their own (Google Maps, the community's real
// listings/categories aggregation) that are their own components'
// concerns, not Landing's. What's under test here is Landing's own
// composition/filtering logic: which cards render, whether typing narrows
// the grid, and whether the map/davening cards appear only when the
// community actually has the relevant pseudo-category/data.
//
// ShabbatTimesCard/SubscribeSection/UpdateListingsCard are NOT mocked —
// none of them ever were, even before the old zmanim+shabbat pairs split
// into these independent cards, so this preserves that.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('@/components/home/HomeMap', () => ({
  default: () => <div data-testid="home-map-stub" />,
}))
vi.mock('@/components/home/DaveningTimesCard', () => ({
  default: () => <div data-testid="davening-stub" />,
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
// useIsMobile() reads this — see the "back-navigation reveal" tests below,
// which only apply on mobile (see navTransitions.ts's own doc).
function mockViewport(isMobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isMobile,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

function renderLanding(
  props: Partial<ComponentProps<typeof Landing>> = {},
  options?: Parameters<typeof renderWithProviders>[1],
  // Defaults to null (the same as no provider at all — see useAllListings'
  // own doc) so every existing call site is unaffected; only the map card's
  // "N places across M categories" line needs real listings supplied.
  listings: DirectoryResource[] | null = null,
): RenderResult {
  return renderWithProviders(
    <LocationProvider>
      <ListingsProvider listings={listings}>
        <Landing {...handlers} {...props} />
      </ListingsProvider>
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

  describe('the map card\'s "N places across M categories" line', () => {
    const withMap = makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' })
    const grocery = makeCategory({ id: 'grocery', kind: 'listing', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', kind: 'listing', pluralLabel: 'Synagogues' })

    it('counts real listings across listing-kind categories only, once they’ve loaded', () => {
      const listings = [
        makeListing({ id: 'l1', category: 'grocery' }),
        makeListing({ id: 'l2', category: 'grocery' }),
        makeListing({ id: 'l3', category: 'synagogue' }),
        // A stray row filed under the Map pseudo-category itself — shouldn't
        // happen in real data, but proves the count is driven by the
        // category's own `kind`, not just whatever `listings` happens to hold.
        makeListing({ id: 'l4', category: 'map' }),
      ]
      renderLanding(undefined, { content: { categories: [withMap, grocery, synagogue] } }, listings)

      expect(
        screen.getByText((_, el) => el?.tagName.toLowerCase() === 'p' && el.textContent === '3 places across 2 categories'),
      ).toBeInTheDocument()
    })

    it('pluralizes down to one place, one category', () => {
      renderLanding(
        undefined,
        { content: { categories: [withMap, grocery] } },
        [makeListing({ id: 'l1', category: 'grocery' })],
      )

      expect(
        screen.getByText((_, el) => el?.tagName.toLowerCase() === 'p' && el.textContent === '1 place across 1 category'),
      ).toBeInTheDocument()
    })

    it('shows nothing yet while listings haven’t loaded, rather than claiming zero', () => {
      renderLanding(undefined, { content: { categories: [withMap, grocery] } })
      expect(screen.queryByText(/places across/)).not.toBeInTheDocument()
    })
  })

  // Jewish Times (ShabbatTimesCard, not mocked) is the one remaining card
  // still gated on a real Zmanim pseudo-category — it needs candle-lighting
  // data that has nowhere to come from otherwise. Davening Times/Update
  // Listings/Email Signup dropped that gate entirely when the old paired
  // blocks split into independent cards (see homeSections.ts's own doc) —
  // each now has only the gating it actually needs on its own merits.
  it('renders the Jewish Times card only when the community has a zmanim pseudo-category', () => {
    const withZmanim = makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' })
    const { unmount } = renderLanding(undefined, { content: { categories: [withZmanim] } })
    expect(screen.getByRole('heading', { name: 'Shabbat & Holiday Times' })).toBeInTheDocument()
    unmount()

    renderLanding(undefined, { content: { categories: [makeCategory()] } })
    expect(screen.queryByRole('heading', { name: 'Shabbat & Holiday Times' })).not.toBeInTheDocument()
  })

  it('renders Update Listings and (once a minyanim category exists) Davening Times with no zmanim category at all', () => {
    // Regression: both used to share a component with the Jewish
    // Times/Shabbat pair and were needlessly gated on zmanimCategory even
    // though neither reads zmanim data — see homeSections.ts's own doc.
    renderLanding(undefined, { content: { categories: [makeCategory()] } }) // grocery only, no zmanim category
    expect(screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.desktopListingsHeading })).toBeInTheDocument()
    expect(screen.getByTestId('davening-stub')).toBeInTheDocument()
  })

  describe('the gateway block order (Explore the map / Davening Times)', () => {
    const withMapAndZmanim = [
      makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' }),
      makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' }),
    ]

    it('defaults to davening before map when nothing is configured (no built-in rows at all)', () => {
      const { container } = renderLanding(undefined, {
        content: { categories: withMapAndZmanim, homeSections: [] },
      })
      // HomeMap itself doesn't mount until the band scrolls near (see
      // useInView) — irrelevant to this test, which only cares about DOM
      // order, so just force it in so home-map-stub is there to compare.
      act(() => triggerAllIntersections())

      const html = container.innerHTML
      expect(html.indexOf('data-testid="davening-stub"')).toBeLessThan(html.indexOf('data-testid="home-map-stub"'))
    })

    it('follows the admin-configured order — map before davening', () => {
      const { container } = renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          homeSections: [
            { id: 'map', kind: 'map', title: 'Map Card', sortOrder: 100, cardIds: [], width: 'full' },
            { id: 'davening', kind: 'davening', title: 'Davening Times Card', sortOrder: 200, cardIds: [], width: 'full' },
          ],
        },
      })
      act(() => triggerAllIntersections())

      const html = container.innerHTML
      expect(html.indexOf('data-testid="home-map-stub"')).toBeLessThan(html.indexOf('data-testid="davening-stub"'))
    })

    it('renders the map’s admin-editable heading, not the built-in default', () => {
      renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          settings: { ...SITE_SETTINGS_DEFAULTS, desktopMapHeading: 'See it on the map' },
          homeSections: [
            { id: 'map', kind: 'map', title: 'Map Card', sortOrder: 100, cardIds: [], width: 'full' },
            { id: 'davening', kind: 'davening', title: 'Davening Times Card', sortOrder: 200, cardIds: [], width: 'full' },
          ],
        },
      })

      expect(screen.getByRole('heading', { name: 'See it on the map' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Explore the Map' })).not.toBeInTheDocument()
    })

    // All-or-nothing: the admin's Home screen cards list is authoritative
    // the moment it has any row at all — a kind with no row is "not
    // configured", not "default it in anyway". See Landing.tsx's own doc —
    // an earlier version tried the independent-fallback approach and it
    // meant the admin's own list stopped matching what the live site
    // actually rendered, which is worse than a temporary gap.
    it('hides a built-in card that has no row of its own, once a sibling kind is configured', () => {
      renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          homeSections: [{ id: 'davening', kind: 'davening', title: 'Davening Times Card', sortOrder: 100, cardIds: [], width: 'full' }],
        },
      })

      expect(screen.getByTestId('davening-stub')).toBeInTheDocument()
      // Map has no row of its own here, so it doesn't render at all —
      // configuring one kind doesn't implicitly configure the rest.
      expect(screen.queryByTestId('home-map-stub')).not.toBeInTheDocument()
    })
  })

  describe('side-by-side cards (width: half)', () => {
    const withMapAndZmanim = [
      makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' }),
      makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' }),
    ]

    it('pairs two adjacent half-width cards into one row', () => {
      const { container } = renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          homeSections: [
            { id: 'davening', kind: 'davening', title: 'Davening Times Card', sortOrder: 100, cardIds: [], width: 'half' },
            { id: 'map', kind: 'map', title: 'Map Card', sortOrder: 200, cardIds: [], width: 'half' },
          ],
        },
      })
      act(() => triggerAllIntersections())

      // Both stubs share the same grid row — a direct parent with grid
      // classes containing both testids, not two separate my-12 rows.
      const daveningStub = screen.getByTestId('davening-stub')
      const mapStub = screen.getByTestId('home-map-stub')
      const row = daveningStub.closest('.grid')
      expect(row).not.toBeNull()
      expect(row).toContainElement(mapStub)
      // Only one shared outer spacing wrapper for the pair, not one each.
      expect(container.querySelectorAll('.my-12').length).toBe(1)
    })

    it('a half-width card with no half-width neighbor falls back to its own full-width row', () => {
      const { container } = renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          homeSections: [
            { id: 'davening', kind: 'davening', title: 'Davening Times Card', sortOrder: 100, cardIds: [], width: 'half' },
            { id: 'map', kind: 'map', title: 'Map Card', sortOrder: 200, cardIds: [], width: 'full' },
          ],
        },
      })
      act(() => triggerAllIntersections())

      const daveningStub = screen.getByTestId('davening-stub')
      // Not inside a grid — its own row, same as a full-width card.
      expect(daveningStub.closest('.grid')).toBeNull()
      expect(container.querySelectorAll('.my-12').length).toBe(2)
    })

    it('a half-width card whose neighbor was gated off this render still falls back to full width', () => {
      // davening/map both 'half', but no zmanim category — davening is
      // JS-gated on nothing here (it self-gates on minyanim data, mocked to
      // always render), map self-gates on `hasMap`; drop the map category so
      // map renders nothing at all, leaving davening the only real card.
      renderLanding(undefined, {
        content: {
          categories: [makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' })], // no map category
          homeSections: [
            { id: 'davening', kind: 'davening', title: 'Davening Times Card', sortOrder: 100, cardIds: [], width: 'half' },
            { id: 'map', kind: 'map', title: 'Map Card', sortOrder: 200, cardIds: [], width: 'half' },
          ],
        },
      })

      const daveningStub = screen.getByTestId('davening-stub')
      expect(daveningStub.closest('.grid')).toBeNull()
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

      // The card's heading is `settings.heroTitle` now ("What are you
      // looking for?" by default), not a hardcoded "Browse Everything" —
      // see Landing.tsx's own comment on why that string is gone.
      const heading = screen.getByRole('heading', { level: 2, name: SITE_SETTINGS_DEFAULTS.heroTitle })
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

      const heading = screen.getByRole('heading', { level: 2, name: SITE_SETTINGS_DEFAULTS.heroTitle })
      const row = within(heading.parentElement!).getByText('Grocery Stores').closest('a')!
      expect(row.className).not.toMatch(/\bborder\b/)
      expect(row.className).not.toMatch(/\bbg-white\b/)
      expect(row.className).toMatch(/hover:bg-slate-50/)
    })

    // `settings.heroTitle` now titles the whole merged card — search sits
    // under it as the first thing in the section, framed as "search within
    // these categories" — not just this flat grid, so unlike the flat grid
    // itself (still replaced by the grouped results grid while there's a
    // query — see "narrows the grid" above), the heading no longer hides.
    it('keeps its heading as the section title while actively searching', async () => {
      const user = userEvent.setup()
      renderLanding(undefined, { content: { categories: [makeCategory({ pluralLabel: 'Grocery Stores' })] } })

      expect(screen.getByRole('heading', { level: 2, name: SITE_SETTINGS_DEFAULTS.heroTitle })).toBeInTheDocument()
      await user.type(screen.getAllByLabelText('Search resources')[0]!, 'grocery')
      expect(screen.getByRole('heading', { level: 2, name: SITE_SETTINGS_DEFAULTS.heroTitle })).toBeInTheDocument()
    })

    it('tracks category_opened with source "grid" on a card click', async () => {
      const user = userEvent.setup()
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      renderLanding(undefined, { content: { categories: [grocery] } })

      const heading = screen.getByRole('heading', { level: 2, name: SITE_SETTINGS_DEFAULTS.heroTitle })
      await user.click(within(heading.parentElement!).getByText('Grocery Stores'))

      expect(vi.mocked(track)).toHaveBeenCalledWith('category_opened', { category: 'grocery', source: 'grid' })
    })
  })

  // Landing never remounts when a category's back arrow returns here — Next
  // keeps this exact instance alive instead of tearing it down (confirmed
  // live; see globals.css's `.reveal-slide-back` doc) — so nothing in
  // React's own lifecycle (a render, an effect re-running) ever fires again
  // on this reveal. An IntersectionObserver is what actually catches it
  // (real layout visibility, independent of React), gated on
  // markHomeReveal()/consumeHomeReveal() so an ordinary scroll-driven
  // intersection change doesn't also trigger it.
  describe('the mobile back-arrow reveal (reveal-slide-back)', () => {
    afterEach(() => mockViewport(false))

    it('applies reveal-slide-back once a pending reveal actually intersects', () => {
      mockViewport(true)
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      renderLanding(undefined, { content: { categories: [grocery] } })
      const main = document.querySelector('main')!
      expect(main.className).toContain('animate-[fadeIn_180ms_ease-out]')

      markHomeReveal()
      // The observer's own first callback reports current state and is
      // ignored (see Landing's own doc) — this simulates it, and should be
      // a no-op even with a reveal already pending.
      act(() => setAllIntersecting(false))
      expect(main.className).not.toContain('reveal-slide-back')

      act(() => triggerAllIntersections())
      expect(main.className).toContain('reveal-slide-back')
      expect(main.className).not.toContain('animate-[fadeIn_180ms_ease-out]')

      // Not covered here: the one-shot flag clearing back to fadeIn once the
      // slide's own CSS animation actually ends. jsdom has no
      // AnimationEvent/animation-timeline support at all, and confirmed
      // directly (a debug listener that never fired) that React doesn't
      // even register onAnimationEnd delegation in this environment as a
      // result — a genuine automation gap, not a skipped assertion.
    })

    it('ignores an ordinary reveal with no pending back-navigation', () => {
      mockViewport(true)
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      renderLanding(undefined, { content: { categories: [grocery] } })
      const main = document.querySelector('main')!

      // No markHomeReveal() this time — an ordinary scroll-driven
      // intersection change (or the observer's own first callback) must
      // never apply the slide.
      act(() => triggerAllIntersections())
      expect(main.className).not.toContain('reveal-slide-back')
    })

    it('does nothing on desktop even with a reveal pending', () => {
      mockViewport(false)
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      renderLanding(undefined, { content: { categories: [grocery] } })
      const main = document.querySelector('main')!

      markHomeReveal()
      act(() => triggerAllIntersections())
      expect(main.className).not.toContain('reveal-slide-back')
    })
  })

})
