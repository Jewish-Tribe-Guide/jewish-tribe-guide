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
import { HeaderCollapseProvider } from '@/lib/headerVisibility'
import { ListingsProvider } from '@/lib/listingsContext'
import type { DirectoryResource } from '@/types'
import { resetMockIntersectionObserver, setAllIntersecting, triggerAllIntersections } from '@/test/intersectionObserverMock'
import { mockRouter } from '@/test/nextNavigationMock'
import { markHomeReveal } from '@/lib/homeRevealSignal'
import { ForcedViewport } from '@/lib/useIsMobile'
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

// DaveningTimesCard is mocked out — it pulls in its own real
// listings/categories aggregation, its own component's concern, not
// Landing's. What's under test here is Landing's own composition/filtering
// logic: which cards render, whether typing narrows the grid, and whether
// the davening card appears only when the community actually has it
// configured.
//
// ShabbatTimesCard/SubscribeSection/UpdateListingsCard are NOT mocked —
// none of them ever were, even before the old zmanim+shabbat pairs split
// into these independent cards, so this preserves that.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('@/components/home/DaveningTimesCard', () => ({
  default: () => <div data-testid="davening-stub" />,
}))
// Stubbed for the same reason as DaveningTimesCard above — its own
// admin-set-date-range gating (activeCampaignBanner) is that component's own
// concern, not Landing's. What's under test here is Landing's own decision
// to hide it on mobile while actively searching — see the tests below.
vi.mock('@/components/home/CampaignBannerCard', () => ({
  default: () => <div data-testid="campaign-banner-stub" />,
}))

afterEach(() => {
  cleanup()
  resetMockIntersectionObserver()
})

const handlers = {
  onNavigate: vi.fn(),
  onOpenFlow: vi.fn(),
  coords: null,
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
  // own doc) so every existing call site is unaffected; only tests that need
  // real per-category listing counts (the browse grid's sort order, place
  // search) supply this.
  listings: DirectoryResource[] | null = null,
): RenderResult {
  return renderWithProviders(
    // HeaderCollapseProvider: Landing now calls useHeaderOverlay (Phase 2 —
    // transparent desktop header over the hero), which needs the same
    // provider SiteChrome always wraps it in for real. Not asserted on
    // directly here — see SiteHeader.test.tsx for the overlay behavior
    // itself — just required for Landing to render at all.
    <HeaderCollapseProvider>
      <LocationProvider>
        <ListingsProvider listings={listings}>
          <Landing {...handlers} {...props} />
        </ListingsProvider>
      </LocationProvider>
    </HeaderCollapseProvider>,
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

  it('mobile: narrows its own permanent grid to matching cards when typing, and hides the rest', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    const { container } = renderLanding(undefined, { content: { categories: [grocery, synagogue] } })

    // Scoped to mobile's own results section specifically (CSS-only toggle
    // — jsdom applies no CSS, so both mobile and desktop copies are
    // genuinely in the DOM at once) rather than relying on useIsMobile(),
    // which starts `false` on every render regardless of a mocked
    // matchMedia (see HeroHeading's own doc on why) and so can't be used to
    // isolate a query immediately after render. `.mt-12.desktop\\:hidden`,
    // not the bare class — HeroHeading's own mobile hero block is also
    // `desktop:hidden` and renders first in the DOM.
    const mobileSection = container.querySelector<HTMLElement>('.mt-12.desktop\\:hidden')!
    await user.type(screen.getAllByLabelText('Search resources')[0]!, 'grocery')

    expect(within(mobileSection).getByText('Grocery Stores')).toBeInTheDocument()
    expect(within(mobileSection).queryByText('Synagogues')).not.toBeInTheDocument()
  })

  // Reported live: mobile has no HeroSearchDropdown of its own (see
  // HeroHeading's own doc) — typing re-filters the grid further down the
  // page in place instead, with the campaign banner sitting in normal flow
  // between the search box and that grid, pushing the answer further from
  // the box the same way desktop's old "answer in a card near the bottom"
  // problem did. Hidden here specifically while there's an active query, not
  // as a "no promotions during search" rule — it reappears the instant the
  // search is cleared. ForcedViewport, not the mobileSection DOM-scoping
  // trick the test above uses: this is gated on the real `isMobile` value
  // (Landing.tsx's own `!(isMobile && q)`), which starts false regardless of
  // matchMedia in jsdom (see that test's own comment) and so needs forcing
  // to exercise at all.
  it('mobile: hides the campaign banner while actively searching, and brings it back once the search is cleared', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ForcedViewport isMobile>
        <HeaderCollapseProvider>
          <LocationProvider>
            <ListingsProvider listings={null}>
              <Landing {...handlers} />
            </ListingsProvider>
          </LocationProvider>
        </HeaderCollapseProvider>
      </ForcedViewport>,
      { content: { categories: [makeCategory()] } },
    )
    const search = screen.getAllByLabelText('Search resources')[0]!

    expect(screen.getByTestId('campaign-banner-stub')).toBeInTheDocument()

    await user.type(search, 'grocery')
    expect(screen.queryByTestId('campaign-banner-stub')).not.toBeInTheDocument()

    await user.clear(search)
    expect(screen.getByTestId('campaign-banner-stub')).toBeInTheDocument()
  })

  // Desktop's own HeroSearchDropdown already opens right under the search
  // box and paints over whatever's below it (including this banner) while
  // there are results to show — see that component's own doc. No separate
  // hide-while-searching rule is needed (or wanted) on top of that, so the
  // banner stays mounted regardless of `q` here.
  it("desktop: keeps the campaign banner mounted while searching — HeroSearchDropdown's own overlay covers it instead", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ForcedViewport isMobile={false}>
        <HeaderCollapseProvider>
          <LocationProvider>
            <ListingsProvider listings={null}>
              <Landing {...handlers} />
            </ListingsProvider>
          </LocationProvider>
        </HeaderCollapseProvider>
      </ForcedViewport>,
      { content: { categories: [makeCategory()] } },
    )

    await user.type(screen.getAllByLabelText('Search resources')[0]!, 'grocery')

    expect(screen.getByTestId('campaign-banner-stub')).toBeInTheDocument()
  })

  // Desktop used to swap this whole card for a filtered CompactCardGrid the
  // moment there was a query — HeroSearchDropdown (opening right under the
  // hero's own search box) replaced that job, and having this section ALSO
  // change out from under a search read as two different things reacting to
  // one keystroke — the user's own call, reviewing the built feature. So
  // this now stays the plain, full category index regardless of `query`.
  it("desktop: the category index doesn't narrow when typing — only the hero's own search dropdown does", async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    renderLanding(undefined, { content: { categories: [grocery, synagogue] } })

    const card = screen.getByTestId('browse-everything-card')
    await user.type(screen.getAllByLabelText('Search resources')[0]!, 'grocery')

    expect(within(card).getByText('Grocery Stores')).toBeInTheDocument()
    expect(within(card).getByText('Synagogues')).toBeInTheDocument()
  })

  it('shows a "nothing matches" message for a query with no hits', async () => {
    const user = userEvent.setup()
    renderLanding(undefined, { content: { categories: [makeCategory()] } })

    await user.type(screen.getAllByLabelText('Search resources')[0]!, 'xyznotreal')

    expect(screen.getAllByText(/Nothing matches “xyznotreal”/).length).toBeGreaterThan(0)
  })

  // Reported live: picking a listing from the hero's own search dropdown
  // used to also carry the typed search term along as `?q=` on the
  // destination category page, pre-filtering its list underneath the
  // listing's own modal — the user's own call to drop it: picking a
  // listing should show exactly that listing, nothing else narrowed.
  it("opening a listing from the hero's search dropdown carries no leftover search term to the destination category page", async () => {
    const user = userEvent.setup()
    vi.mocked(handlers.onNavigate).mockClear()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderLanding(
      undefined,
      { content: { categories: [grocery] } },
      [makeListing({ id: 'l1', category: 'grocery', name: 'Test Grocery' })],
    )

    await user.type(screen.getAllByLabelText('Search resources')[0]!, 'Test Grocery')
    await user.click(screen.getAllByText('Test Grocery')[0]!)

    expect(handlers.onNavigate).toHaveBeenCalledWith('patient', 'find', {
      findView: 'grocery',
      findItemId: 'l1',
    })
  })

  // The map is retired as a home-screen card (the user's own call — it only
  // ever lives at its own full-screen route now), so the hero's "View Map"
  // button has one job unconditionally: navigate there. No more "scroll to
  // an embedded band, falling back to navigation only once the admin's
  // removed it" branching.
  it('the hero\'s "View Map" button navigates to the full map page', async () => {
    const user = userEvent.setup()
    const withMap = makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' })
    renderLanding(undefined, { content: { categories: [withMap] } })

    await user.click(screen.getAllByRole('button', { name: /View Map/ })[0]!)

    expect(handlers.onNavigate).toHaveBeenCalledWith(null, 'map')
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

  // Phase 6a of the desktop mockup rework: Davening Times, Update Listings
  // and the new Suggest a Listing card share ONE row (the "community row")
  // instead of each getting its own — see Landing.tsx's own community-row
  // doc for why this is a special case rather than the generic half-width
  // pairing every other kind goes through.
  describe('the community row (Davening / Update Listings / Suggest a Listing)', () => {
    it('renders all three, in order, when both Davening and Update Listings are configured', () => {
      const { container } = renderLanding(undefined, {
        content: {
          categories: [makeCategory()],
          homeSections: [
            { id: 'davening', kind: 'davening', title: 'Davening Times Card', sortOrder: 100, cardIds: [], width: 'full' },
            { id: 'listings', kind: 'listings', title: 'Update Listings Card', sortOrder: 200, cardIds: [], width: 'full' },
          ],
        },
      })

      const daveningStub = screen.getByTestId('davening-stub')
      const listingsHeading = screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.desktopListingsHeading })
      const suggestHeading = screen.getByRole('heading', { name: 'Suggest a Listing' })

      const row = daveningStub.closest('.grid')!
      expect(row).not.toBeNull()
      expect(row).toContainElement(listingsHeading)
      expect(row).toContainElement(suggestHeading)
      expect(row).toHaveClass('min-[900px]:grid-cols-3')

      // Only one shared row wrapper for all three, not one per card.
      expect(container.querySelectorAll('.my-8').length).toBe(1)

      // Document order: Davening, then Update Listings, then Suggest.
      const html = container.innerHTML
      expect(html.indexOf('data-testid="davening-stub"')).toBeLessThan(html.indexOf(SITE_SETTINGS_DEFAULTS.desktopListingsHeading))
      expect(html.indexOf(SITE_SETTINGS_DEFAULTS.desktopListingsHeading)).toBeLessThan(html.indexOf('Suggest a Listing'))
    })

    it('renders Update Listings + Suggest (no Davening slot) once Davening is not configured', () => {
      renderLanding(undefined, {
        content: {
          categories: [makeCategory()],
          homeSections: [
            { id: 'listings', kind: 'listings', title: 'Update Listings Card', sortOrder: 100, cardIds: [], width: 'full' },
          ],
        },
      })

      expect(screen.queryByTestId('davening-stub')).not.toBeInTheDocument()
      const listingsHeading = screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.desktopListingsHeading })
      const suggestHeading = screen.getByRole('heading', { name: 'Suggest a Listing' })

      const row = listingsHeading.closest('.grid')!
      expect(row).not.toBeNull()
      expect(row).toContainElement(suggestHeading)
      expect(row).toHaveClass('min-[740px]:grid-cols-2')
    })

    it('renders nothing for the community row when neither kind is configured', () => {
      renderLanding(undefined, {
        content: {
          categories: [makeCategory()],
          homeSections: [
            { id: 'subscribe', kind: 'subscribe', title: 'Subscribe Card', sortOrder: 100, cardIds: [], width: 'full' },
          ],
        },
      })

      expect(screen.queryByTestId('davening-stub')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: SITE_SETTINGS_DEFAULTS.desktopListingsHeading })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Suggest a Listing' })).not.toBeInTheDocument()
    })
  })

  describe('the built-in cards\' admin-configured order', () => {
    const withZmanim = [makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' })]

    it('defaults to davening before jewishTimes when nothing is configured (no built-in rows at all)', () => {
      renderLanding(undefined, { content: { categories: withZmanim, homeSections: [] } })

      const daveningStub = screen.getByTestId('davening-stub')
      const jewishTimesHeading = screen.getByRole('heading', { name: 'Shabbat & Holiday Times' })
      expect(daveningStub.compareDocumentPosition(jewishTimesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('follows the admin-configured order — jewishTimes before davening', () => {
      renderLanding(undefined, {
        content: {
          categories: withZmanim,
          homeSections: [
            { id: 'jewishTimes', kind: 'jewishTimes', title: 'Jewish Times Card', sortOrder: 100, cardIds: [], width: 'full' },
            { id: 'davening', kind: 'davening', title: 'Davening Times Card', sortOrder: 200, cardIds: [], width: 'full' },
          ],
        },
      })

      const daveningStub = screen.getByTestId('davening-stub')
      const jewishTimesHeading = screen.getByRole('heading', { name: 'Shabbat & Holiday Times' })
      expect(jewishTimesHeading.compareDocumentPosition(daveningStub) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
          categories: withZmanim,
          homeSections: [{ id: 'davening', kind: 'davening', title: 'Davening Times Card', sortOrder: 100, cardIds: [], width: 'full' }],
        },
      })

      expect(screen.getByTestId('davening-stub')).toBeInTheDocument()
      // Jewish Times has no row of its own here, so it doesn't render at
      // all — configuring one kind doesn't implicitly configure the rest.
      expect(screen.queryByRole('heading', { name: 'Shabbat & Holiday Times' })).not.toBeInTheDocument()
    })
  })

  describe('side-by-side cards (width: half)', () => {
    const withMapAndZmanim = [
      makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' }),
      makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' }),
      // SubscribeSection self-gates on having at least one real (kind:
      // 'listing') category to offer in its picker — without one it
      // renders null, same as this suite's own jewishTimes/zmanim gate.
      makeCategory({ id: 'grocery', kind: 'listing', pluralLabel: 'Grocery Stores' }),
    ]

    // davening/map used to be this suite's own example pair — davening no
    // longer generically pairs with anything (it's always pulled into the
    // community row alongside Update Listings/Suggest a Listing instead,
    // see Landing.tsx's own community-row doc), so these are rewritten
    // against subscribe/jewishTimes, the pair the plan explicitly keeps
    // pairing generically.
    it('pairs two adjacent half-width cards into one row', () => {
      const { container } = renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          homeSections: [
            { id: 'subscribe', kind: 'subscribe', title: 'Subscribe Card', sortOrder: 100, cardIds: [], width: 'half' },
            { id: 'jewishTimes', kind: 'jewishTimes', title: 'Jewish Times Card', sortOrder: 200, cardIds: [], width: 'half' },
          ],
        },
      })

      // Both cards share the same grid row — a direct parent with grid
      // classes containing both, not two separate my-8 rows.
      const subscribeHeading = screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.desktopSubscribeHeading })
      const jewishTimesHeading = screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.desktopJewishTimesHeading })
      const row = subscribeHeading.closest('.grid')
      expect(row).not.toBeNull()
      expect(row).toContainElement(jewishTimesHeading)
      // Only one shared outer spacing wrapper for the pair, not one each.
      expect(container.querySelectorAll('.my-8').length).toBe(1)
    })

    it('a half-width card with no half-width neighbor falls back to its own full-width row', () => {
      const { container } = renderLanding(undefined, {
        content: {
          categories: withMapAndZmanim,
          homeSections: [
            { id: 'subscribe', kind: 'subscribe', title: 'Subscribe Card', sortOrder: 100, cardIds: [], width: 'half' },
            { id: 'jewishTimes', kind: 'jewishTimes', title: 'Jewish Times Card', sortOrder: 200, cardIds: [], width: 'full' },
          ],
        },
      })

      const subscribeHeading = screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.desktopSubscribeHeading })
      // Not inside a grid — its own row, same as a full-width card.
      expect(subscribeHeading.closest('.grid')).toBeNull()
      expect(container.querySelectorAll('.my-8').length).toBe(2)
    })

    it('a half-width card whose neighbor was gated off this render still falls back to full width', () => {
      // subscribe/jewishTimes both 'half', but no zmanim category — subscribe
      // is unconditional (mocked to always render), jewishTimes self-gates
      // on zmanimCategory; drop the zmanim category so jewishTimes renders
      // nothing at all, leaving subscribe the only real card.
      renderLanding(undefined, {
        content: {
          categories: [
            makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' }),
            makeCategory({ id: 'grocery', kind: 'listing', pluralLabel: 'Grocery Stores' }),
          ], // no zmanim category
          homeSections: [
            { id: 'subscribe', kind: 'subscribe', title: 'Subscribe Card', sortOrder: 100, cardIds: [], width: 'half' },
            { id: 'jewishTimes', kind: 'jewishTimes', title: 'Jewish Times Card', sortOrder: 200, cardIds: [], width: 'half' },
          ],
        },
      })

      const subscribeHeading = screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.desktopSubscribeHeading })
      expect(subscribeHeading.closest('.grid')).toBeNull()
      expect(screen.queryByRole('heading', { name: SITE_SETTINGS_DEFAULTS.desktopJewishTimesHeading })).not.toBeInTheDocument()
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

      // The card's heading is a hardcoded "Explore by Category" now (the
      // user's own reference image), not settings.desktopBrowseHeading —
      // see Landing.tsx's own comment on why.
      expect(screen.getByRole('heading', { level: 2, name: 'Explore by Category' })).toBeInTheDocument()
      // Both cards render as siblings under the ONE "Browse everything"
      // card — not under their own admin-configured section titles ("Food
      // and Hospitality", etc.), which is what "flat" means here.
      const card = screen.getByTestId('browse-everything-card')
      expect(within(card).getByText('Grocery Stores')).toBeInTheDocument()
      expect(within(card).getByText('Synagogues')).toBeInTheDocument()
    })

    // Desktop mockup match (Phase 5, docs/desktop-mockup-plan.md) briefly
    // gave this card a bordered box per tile — reversed again after review
    // against the user's own reference image, which shows plain icon+label
    // with no box, closer to CompactCard's own borderless-at-rest treatment
    // than a card grid.
    it('tiles have no border, at rest or on hover — just the icon and label', () => {
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      renderLanding(undefined, { content: { categories: [grocery] } })

      const card = screen.getByTestId('browse-everything-card')
      const tile = within(card).getByText('Grocery Stores').closest('a')!
      expect(tile.className).not.toMatch(/\bborder\b/)
      expect(tile.className).toMatch(/hover:bg-slate-50/)
    })

    // "Explore by Category" titles the whole merged card — unlike the flat
    // grid itself (still replaced by the grouped results grid while there's
    // a query — see "narrows the grid" above), the heading never hides.
    it('keeps its heading as the section title while actively searching', async () => {
      const user = userEvent.setup()
      renderLanding(undefined, { content: { categories: [makeCategory({ pluralLabel: 'Grocery Stores' })] } })

      expect(screen.getByRole('heading', { level: 2, name: 'Explore by Category' })).toBeInTheDocument()
      await user.type(screen.getAllByLabelText('Search resources')[0]!, 'grocery')
      expect(screen.getByRole('heading', { level: 2, name: 'Explore by Category' })).toBeInTheDocument()
    })

    it('tracks category_opened with source "grid" on a card click', async () => {
      const user = userEvent.setup()
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      renderLanding(undefined, { content: { categories: [grocery] } })

      const card = screen.getByTestId('browse-everything-card')
      await user.click(within(card).getByText('Grocery Stores'))

      expect(vi.mocked(track)).toHaveBeenCalledWith('category_opened', { category: 'grocery', source: 'grid' })
    })
  })

  // Phase 5 of the desktop mockup rework, revised twice after user review:
  // the flat grid is a single non-scrolling, non-wrapping row by default —
  // the first COLLAPSED_TILE_COUNT (9) cards, sorted by listing count (most
  // to least places), plus a trailing "More" tile when there are more than
  // that. The header row's own "View all" link is gone (the "More" tile
  // does that job now); "Show fewer categories" there is the only way back
  // once expanded, since there's no "More" tile to click in that state.
  describe('the capped row + "More" tile vs. full grid', () => {
    // Listing counts, not creation order, decide the order — deliberately
    // NOT already-sorted category ids, so a test that accidentally read
    // insertion order instead of the real sort would still pass by
    // accident. cat9 (the 10th, over COLLAPSED_TILE_COUNT) gets the fewest
    // listings, so it's the one pushed behind "More".
    function tenCategoriesWithCounts() {
      const categories = Array.from({ length: 10 }, (_, i) => makeCategory({ id: `cat${i}`, pluralLabel: `Category ${i}` }))
      // Descending counts: cat0 has the most listings, cat9 the fewest.
      const listings = categories.flatMap((c, i) =>
        Array.from({ length: 10 - i }, (_, j) => makeListing({ id: `${c.id}-l${j}`, category: c.id! })),
      )
      return { categories, listings }
    }

    it('sorts by listing count (most to least), caps at 9, and shows a trailing "More" tile', () => {
      const { categories, listings } = tenCategoriesWithCounts()
      renderLanding(undefined, { content: { categories } }, listings)

      const card = screen.getByTestId('browse-everything-card')
      const tileLinks = within(card).getAllByRole('link', { name: /Category \d/ })
      // Exactly the first 9, in descending-count order — cat9 (fewest
      // listings) is the one left out, behind "More".
      expect(tileLinks.map((l) => l.textContent)).toEqual(
        Array.from({ length: 9 }, (_, i) => expect.stringContaining(`Category ${i}`)),
      )
      expect(within(card).queryByText('Category 9')).not.toBeInTheDocument()

      const moreButton = within(card).getByRole('button', { name: /More/ })
      expect(moreButton).toBeInTheDocument()
      // Single row: no scroll container, no wrap — a plain flex row.
      const row = tileLinks[0]!.parentElement!
      expect(row).toHaveClass('flex')
      expect(row).not.toHaveClass('overflow-x-auto')
      expect(row).not.toHaveClass('flex-wrap')
    })

    it('the trailing "More" tile expands the grid to every card, no cap', async () => {
      const user = userEvent.setup()
      const { categories, listings } = tenCategoriesWithCounts()
      renderLanding(undefined, { content: { categories } }, listings)

      const card = screen.getByTestId('browse-everything-card')
      await user.click(within(card).getByRole('button', { name: /More/ }))

      expect(within(card).getAllByRole('link', { name: /Category \d/ }).length).toBe(10)
      expect(within(card).queryByRole('button', { name: /More/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show fewer categories' })).toHaveAttribute('aria-expanded', 'true')
    })

    it('collapses back to the capped row + "More" tile on "Show fewer categories"', async () => {
      const user = userEvent.setup()
      const { categories, listings } = tenCategoriesWithCounts()
      renderLanding(undefined, { content: { categories } }, listings)

      const card = screen.getByTestId('browse-everything-card')
      await user.click(within(card).getByRole('button', { name: /More/ }))
      await user.click(screen.getByRole('button', { name: 'Show fewer categories' }))

      expect(within(card).getAllByRole('link', { name: /Category \d/ }).length).toBe(9)
      expect(within(card).getByRole('button', { name: /More/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Show fewer categories' })).not.toBeInTheDocument()
    })

    it('shows no "More" tile and no "Show fewer" control with 9 or fewer cards', () => {
      const nine = Array.from({ length: 9 }, (_, i) => makeCategory({ id: `cat${i}`, pluralLabel: `Category ${i}` }))
      renderLanding(undefined, { content: { categories: nine } })

      expect(screen.queryByRole('button', { name: 'Show fewer categories' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /More/ })).not.toBeInTheDocument()
    })

    it('tile clicks still track category_opened with source "grid" once expanded', async () => {
      const user = userEvent.setup()
      const { categories, listings } = tenCategoriesWithCounts()
      renderLanding(undefined, { content: { categories } }, listings)

      const card = screen.getByTestId('browse-everything-card')
      await user.click(within(card).getByRole('button', { name: /More/ }))
      await user.click(within(card).getByText('Category 9'))

      expect(vi.mocked(track)).toHaveBeenCalledWith('category_opened', { category: 'cat9', source: 'grid' })
    })

    // The hero's own "Browse Categories" button used to only scroll to this
    // card, landing a visitor on the same capped 9+"More" row they'd have
    // scrolled to on their own — defeating a button whose whole promise is
    // "show me everything." It now expands the grid too, same as clicking
    // "More" directly.
    it('the hero\'s "Browse Categories" button expands the grid, not just scrolls to it', async () => {
      // jsdom doesn't implement scrollIntoView at all (not even a no-op).
      Element.prototype.scrollIntoView = vi.fn()
      const user = userEvent.setup()
      const { categories, listings } = tenCategoriesWithCounts()
      renderLanding(undefined, { content: { categories } }, listings)

      const card = screen.getByTestId('browse-everything-card')
      expect(within(card).getByRole('button', { name: /More/ })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Browse Categories' }))

      expect(within(card).getAllByRole('link', { name: /Category \d/ }).length).toBe(10)
      expect(within(card).queryByRole('button', { name: /More/ })).not.toBeInTheDocument()
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
      // An intersection callback reporting NOT intersecting must be a
      // no-op regardless of a pending reveal — only isIntersecting: true
      // ever applies the slide (see Landing's own doc on why there's no
      // separate "ignore the first callback" special case any more).
      act(() => setAllIntersecting(false))
      expect(main.className).not.toContain('reveal-slide-back')

      act(() => triggerAllIntersections())
      expect(main.className).toContain('reveal-slide-back')
      expect(main.className).not.toContain('animate-[fadeIn_180ms_ease-out]')

      // Deliberately never reverts to animate-[fadeIn_180ms_ease-out] —
      // see this className's own doc on why swapping it back caused a
      // visible flash on a real device (a fresh animation-name value
      // restarts whatever's newly named, including a fade-from-transparent
      // on already-visible content). This assertion is a weak guard, not
      // real regression coverage: it passes against the OLD buggy code
      // too (confirmed directly), since the bug lived in an
      // onAnimationEnd handler that only ever fired from a real
      // 'animationend' event — jsdom has no AnimationEvent/
      // animation-timeline support at all, so nothing here can actually
      // trigger it either way. Kept anyway as a sanity check that a plain
      // intersection update alone (no real animation involved) doesn't
      // touch the class.
      act(() => setAllIntersecting(false))
      expect(main.className).toContain('reveal-slide-back')
    })

    it('ignores an ordinary reveal with no pending back-navigation', () => {
      mockViewport(true)
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      renderLanding(undefined, { content: { categories: [grocery] } })
      const main = document.querySelector('main')!

      // No markHomeReveal() this time — an ordinary scroll-driven
      // intersection change becoming true must never apply the slide on
      // its own.
      act(() => triggerAllIntersections())
      expect(main.className).not.toContain('reveal-slide-back')
    })

    it('applies the slide even when the FIRST-EVER intersection callback is the one reporting true', () => {
      // Regression guard for the actual production bug: a live capture
      // against a real deployment showed the observer's first-ever
      // callback can itself be the "became visible again" event, with no
      // earlier "became hidden" callback ever arriving to be skipped
      // first — the browser can coalesce a fast hide-then-reveal into one
      // notification. An earlier version of this effect specifically
      // ignored the observer's first-ever callback on the assumption it
      // always reports harmless pre-existing state, which silently ate
      // this exact case.
      mockViewport(true)
      const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
      renderLanding(undefined, { content: { categories: [grocery] } })
      const main = document.querySelector('main')!

      markHomeReveal()
      act(() => triggerAllIntersections())
      expect(main.className).toContain('reveal-slide-back')
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
