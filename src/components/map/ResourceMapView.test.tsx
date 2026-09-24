// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeCommunity, makeContent, makeListing } from '@/test/providerFixtures'
import { resolveCapabilities } from '@/lib/categories'
import { CommunityProvider } from '@/lib/communityContext'
import { ContentProvider } from '@/lib/contentContext'
import { ListingsProvider } from '@/lib/listingsContext'
import { PinnedProvider } from '@/lib/pinnedContext'
import { DroppedPinsProvider } from '@/lib/droppedPinsContext'
import { ForcedViewport } from '@/lib/useIsMobile'
import { HeaderCollapseProvider } from '@/lib/headerVisibility'
import type { LocationControls } from '@/components/home/LocationControl'
import type { CampaignBanner } from '@/lib/campaignBanner'
import type { DirectoryResource } from '@/types'
import { track } from '@vercel/analytics'
import { mockRouter } from '@/test/nextNavigationMock'
import type { MapPoint } from './ResourceMap'
import ResourceMapView from './ResourceMapView'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// NearbyList's row-level Share action calls useCommunitySlug(), which pulls
// in next/navigation's useRouter() unconditionally (see nextNavigationMock's
// own comment) — required here even though this suite never asserts on
// routing itself.
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// ResourceMap.tsx renders a REAL google.maps.Map instance — script-injected
// SDK, no wrapper library (see loadGoogleMaps.ts) — which jsdom has no
// equivalent for. Mocked to a stub exposing just enough to drive
// ResourceMapView's own logic (filtering, search, chip selection, point
// selection) without ever touching window.google. Same approach as
// Landing.test.tsx's DaveningTimesCard mock.
vi.mock('./ResourceMap', () => ({
  default: ({
    points,
    onSelectPoint,
    onLongPressPoint,
    onBackgroundClick,
    frameToken,
  }: {
    points: MapPoint[]
    onSelectPoint?: (p: MapPoint) => void
    onLongPressPoint?: (p: MapPoint) => void
    onBackgroundClick?: () => void
    frameToken?: number
  }) => (
    <div data-testid="resource-map">
      <p data-testid="point-count">{points.length}</p>
      <p data-testid="frame-token">{frameToken ?? 0}</p>
      {points.map((p) => (
        <div key={p.id}>
          <button onClick={() => onSelectPoint?.(p)}>Select {p.name}</button>
          <button onClick={() => onLongPressPoint?.(p)}>Long-press {p.name}</button>
        </div>
      ))}
      <button onClick={() => onBackgroundClick?.()}>Click map background</button>
    </div>
  ),
}))

// localStorage.clear(): PinnedProvider/DroppedPinsProvider persist there (see
// pinnedContext.tsx's own doc) and jsdom's localStorage is one real store
// shared by every test in this file, not reset between them on its own. A
// pin left behind by an earlier test (e.g. "long-pressing a point pins it")
// silently changes `hasPinnedChip`/`allChipsOn` for every test that runs
// after it — confirmed live: it turned a later "select just this chip" click
// into a deselect, because "All" no longer meant the same thing "all
// categories, no pin filter" once a stray pinned listing survived from
// another test.
afterEach(() => {
  cleanup()
  localStorage.clear()
})

// usePinned()/useDroppedPins() throw outside their providers, and
// useAllListings() silently returns null outside ListingsProvider — which
// leaves `loading` permanently true (see ResourceMapView's own `loading =
// listings === null || categories === null`) — so every test needs all
// three, unlike the CommunityProvider/ContentProvider-only components tested
// so far.
function renderMap(
  ui: ReactElement,
  listings: DirectoryResource[] = [],
  categories = [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })],
  campaignBanners: CampaignBanner[] = [],
) {
  return renderWithProviders(
    <PinnedProvider>
      <DroppedPinsProvider>
        <ListingsProvider listings={listings}>{ui}</ListingsProvider>
      </DroppedPinsProvider>
    </PinnedProvider>,
    { content: { categories, campaignBanners } },
  )
}

// The full-screen category picker (the "⋯ More" chip's destination) only
// renders on mobile. useIsMobile measures window.matchMedia by default,
// which jsdom's global polyfill always reports as desktop — ForcedViewport
// (the same mechanism the admin device preview uses) short-circuits that
// instead of fighting the polyfill.
function renderMobileMap(
  ui: ReactElement,
  listings: DirectoryResource[] = [],
  categories = [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })],
  campaignBanners: CampaignBanner[] = [],
) {
  return renderWithProviders(
    <PinnedProvider>
      <DroppedPinsProvider>
        <ListingsProvider listings={listings}>
          <ForcedViewport isMobile>{ui}</ForcedViewport>
        </ListingsProvider>
      </DroppedPinsProvider>
    </PinnedProvider>,
    { content: { categories, campaignBanners } },
  )
}

function listingWithGeo(overrides: Partial<DirectoryResource> = {}): DirectoryResource {
  return makeListing({ geo: { lat: 40, lng: -75 }, ...overrides })
}

describe('ResourceMapView — loading', () => {
  it('shows a loading state until listings arrive', () => {
    // No ListingsProvider at all — useAllListings() returns null outside one.
    renderWithProviders(
      <PinnedProvider>
        <DroppedPinsProvider>
          <ResourceMapView onUp={vi.fn()} />
        </DroppedPinsProvider>
      </PinnedProvider>,
    )

    expect(screen.getByText('Loading map…')).toBeInTheDocument()
    expect(screen.queryByTestId('resource-map')).not.toBeInTheDocument()
  })
})

describe('ResourceMapView — plotting listings', () => {
  it('plots a listing with real coordinates, in a category with the Map capability on', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ category: 'grocery', name: 'Acme Grocery' })], [grocery])

    expect(screen.getByTestId('point-count')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Select Acme Grocery' })).toBeInTheDocument()
  })

  it('skips a listing with no geo coordinates', () => {
    const grocery = makeCategory({ id: 'grocery' })
    renderMap(<ResourceMapView onUp={vi.fn()} />, [makeListing({ category: 'grocery', geo: null })], [grocery])

    expect(screen.getByTestId('point-count')).toHaveTextContent('0')
  })

  it('skips a listing whose category has the Map capability turned off', () => {
    const grocery = makeCategory({ id: 'grocery', capabilities: { add: true, edit: true, report: true, directorySearch: true, map: false } })
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ category: 'grocery' })], [grocery])

    expect(screen.getByTestId('point-count')).toHaveTextContent('0')
  })
})

describe('ResourceMapView — search autocomplete', () => {
  // "Open now" is a real, working search (typing it and hitting Enter
  // filters to only-open places) but was entirely undiscoverable — nothing
  // on screen ever suggested it. Google Maps surfaces this kind of thing as
  // its own row in the autocomplete dropdown; this mirrors that.
  it('offers "Open now" as a suggestion when the search box is focused and empty', async () => {
    const user = userEvent.setup()
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ category: 'grocery', name: 'Acme Grocery' })])

    await user.click(screen.getByPlaceholderText(/Search name, address/))

    expect(screen.getByText('Open now')).toBeInTheDocument()
    expect(screen.getByText('Show only listings open right now')).toBeInTheDocument()
  })

  it('keeps offering "Open now" while the typed text is still heading toward it, and drops it once the text diverges', async () => {
    const user = userEvent.setup()
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ category: 'grocery', name: 'Acme Grocery' })])

    const input = screen.getByPlaceholderText(/Search name, address/)
    await user.click(input)
    await user.type(input, 'ope')
    expect(screen.getByText('Open now')).toBeInTheDocument()

    await user.type(input, 'n pizza')
    expect(screen.queryByText('Open now')).not.toBeInTheDocument()
  })

  it('clicking "Open now" commits it as the search, closing the dropdown', async () => {
    const user = userEvent.setup()
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ category: 'grocery', name: 'Acme Grocery' })])

    const input = screen.getByPlaceholderText<HTMLInputElement>(/Search name, address/)
    await user.click(input)
    await user.click(screen.getByText('Open now'))

    expect(input.value).toBe('open now')
    expect(screen.queryByText('Show only listings open right now')).not.toBeInTheDocument()
  })
})

describe('ResourceMapView — desktop search/filter bar position', () => {
  // Neither the search box nor the chips MOVE (left/top) when the sidebar
  // opens or closes — both used to shift right to dodge the sidebar (first
  // together, then just the chips), which kept reading as things getting
  // "pushed" every time the sidebar appeared. The search box's WIDTH is a
  // different story: it now tracks the sidebar's own width (see
  // SIDEBAR_SEARCH_INSET's own doc) rather than staying a fixed 336px —
  // reported live as looking disconnected from the sidebar it visually
  // sits on top of once the sidebar was dragged wider than that fixed
  // value, leaving a growing bare strip of the sidebar's own white to the
  // search box's right. The chips stay fixed well past the sidebar's own
  // edge, with a real gap, unlike Google Maps' own chip row, which sits
  // with more breathing room around the panel (see the reference
  // screenshots).
  it('keeps the search box and chips at the same LEFT position whether or not the sidebar is open', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const { container } = renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [grocery],
    )

    const search = () => container.querySelector('[class*="left-3"][class*="top-3"]')
    const chips = () => container.querySelector('[class*="right-16"][class*="z-20"]') as HTMLElement | null
    const before = { searchClass: search()?.className, chipsLeft: chips()?.style.left }

    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))

    // The search box's className (its left/top position) doesn't change —
    // only its width (a separate inline style, asserted below) does. The
    // chips' inline `left` (driven by sidebarWidth, not a fixed class —
    // see that element's own doc) is what actually could have drifted here.
    expect(search()?.className).toBe(before.searchClass)
    expect(chips()?.style.left).toBe(before.chipsLeft)
    expect(search()?.className).toMatch(/\bleft-3\b/)
    expect(chips()?.style.left).toBe('396px')
  })

  // The actual feature: the search box's width TRACKS the sidebar's own
  // (inset by SIDEBAR_SEARCH_INSET on each side, so it still reads as
  // sitting flush inside the sidebar rather than spanning it edge to
  // edge) — confirmed at the sidebar's default width, and confirmed AGAIN
  // after dragging it wider, which is the exact regression reported live
  // (the search box used to stay a fixed 336px regardless, leaving a
  // growing bare strip of the sidebar's own white to its right).
  it('grows the search box\'s width along with the sidebar\'s, with a consistent inset on each side', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const { container } = renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [grocery],
    )

    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))

    const aside = container.querySelector('aside') as HTMLElement
    const search = container.querySelector('[class*="left-3"][class*="top-3"]') as HTMLElement
    const SIDEBAR_SEARCH_INSET = 24

    expect(aside.style.width).toBe('380px') // SIDEBAR_DEFAULT_WIDTH
    expect(search.style.width).toBe(`${380 - SIDEBAR_SEARCH_INSET}px`)

    // Drag the sidebar wider — the search box must widen with it, not stay
    // put at its old width.
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' })
    fireEvent.pointerDown(handle, { clientX: 380 })
    fireEvent.pointerMove(handle, { clientX: 480 }) // +100px
    fireEvent.pointerUp(handle)

    expect(aside.style.width).toBe('480px')
    expect(search.style.width).toBe(`${480 - SIDEBAR_SEARCH_INSET}px`)
  })

  // The invariant that actually prevents both the overlap AND the flush,
  // no-breathing-room look for the CHIPS specifically (the search box's own
  // gap to the sidebar is fixed by construction now — see
  // SIDEBAR_SEARCH_INSET — so it's covered by the width test above, not a
  // "stays >= some floor" check): there has to be a real gap between the
  // sidebar's own right edge and where the chips start. Narrowing that gap
  // later without adjusting to match would silently reopen the flush,
  // no-breathing-room look — this fails immediately if that ever drifts,
  // instead of waiting for someone to notice it visually.
  it('leaves a real gap between the sidebar\'s right edge and the chips', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const { container } = renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [grocery],
    )

    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))

    const aside = container.querySelector('aside') as HTMLElement | null
    const chips = container.querySelector('[class*="right-16"][class*="z-20"]') as HTMLElement | null

    const sidebarWidth = Number(aside?.style.width.replace('px', ''))
    const chipsLeft = Number(chips?.style.left.replace('px', ''))
    const MIN_GAP_PX = 16

    expect(chipsLeft - sidebarWidth).toBeGreaterThanOrEqual(MIN_GAP_PX)
  })

  // The sidebar used to be a real flex sibling of the map, so opening it
  // (0 -> 380px) shrank the map's own container — which resizes the map's
  // real DOM box and makes ResourceMap's ResizeObserver re-center the map to
  // refresh its tile layer (see that component's own comment), so the whole
  // map visibly shifted whenever the sidebar opened or closed. It must be an
  // out-of-flow overlay instead, like Google Maps' own results panel, so the
  // map's box never changes size and nothing under it moves.
  it('overlays the map instead of sitting in flex flow beside it, so opening it cannot resize the map', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const { container } = renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [grocery],
    )

    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))

    const aside = container.querySelector('aside')
    expect(aside?.className).toMatch(/desktop:absolute/)
    expect(aside?.className).not.toMatch(/\bshrink-0\b/)
  })
})

describe('ResourceMapView — sidebar resize', () => {
  async function openSidebar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))
  }

  it('renders no resize handle while the sidebar is collapsed', () => {
    renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })],
    )
    expect(screen.queryByRole('separator', { name: 'Resize sidebar' })).not.toBeInTheDocument()
  })

  it('dragging the handle resizes the sidebar, clamped to its min/max width', async () => {
    const user = userEvent.setup()
    const { container } = renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })],
    )
    await openSidebar(user)

    const aside = container.querySelector('aside') as HTMLElement
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' })
    expect(aside.style.width).toBe('380px')

    fireEvent.pointerDown(handle, { clientX: 380 })
    fireEvent.pointerMove(handle, { clientX: 480 }) // +100px
    expect(aside.style.width).toBe('480px')
    fireEvent.pointerUp(handle)

    // Dragged well past SIDEBAR_MAX_WIDTH (640) — clamps rather than
    // growing the sidebar past a usable size.
    fireEvent.pointerDown(handle, { clientX: 480 })
    fireEvent.pointerMove(handle, { clientX: 2000 })
    expect(aside.style.width).toBe('640px')
    fireEvent.pointerUp(handle)

    // Dragged well below SIDEBAR_MIN_WIDTH (360) — clamps rather than
    // shrinking past where the floating search box would overhang it (see
    // SIDEBAR_MIN_WIDTH's own doc).
    fireEvent.pointerDown(handle, { clientX: 640 })
    fireEvent.pointerMove(handle, { clientX: 0 })
    expect(aside.style.width).toBe('360px')
    fireEvent.pointerUp(handle)
  })

  it('persists the dragged width, and a later mount restores it', async () => {
    const user = userEvent.setup()
    const { unmount } = renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })],
    )
    await openSidebar(user)

    const handle = screen.getByRole('separator', { name: 'Resize sidebar' })
    fireEvent.pointerDown(handle, { clientX: 380 })
    fireEvent.pointerMove(handle, { clientX: 460 })
    fireEvent.pointerUp(handle)
    unmount()

    const { container: container2 } = renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })],
    )
    await user.click(within(container2).getByRole('button', { name: /Grocery Stores/ }))
    const aside2 = container2.querySelector('aside') as HTMLElement
    expect(aside2.style.width).toBe('460px')
  })

  // Same reasoning as MobileSheet's own pointerCancel coverage: the browser
  // can take a touch over mid-gesture (most commonly an edge swipe
  // recognized as its own back-navigation) — that should snap back to
  // where the drag started, not leave the sidebar wherever the
  // interrupted gesture happened to reach.
  it('a pointer cancel snaps the width back to where the drag started, and does not persist it', async () => {
    const user = userEvent.setup()
    const { container } = renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })],
    )
    await openSidebar(user)

    const aside = container.querySelector('aside') as HTMLElement
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' })

    fireEvent.pointerDown(handle, { clientX: 380 })
    fireEvent.pointerMove(handle, { clientX: 500 })
    expect(aside.style.width).toBe('500px')
    fireEvent.pointerCancel(handle)

    expect(aside.style.width).toBe('380px')
    expect(localStorage.getItem('jpc:map-sidebar-width')).toBeNull()
  })

  it('ArrowRight/ArrowLeft on the focused handle resize it by a fixed step, and persist immediately', async () => {
    const user = userEvent.setup()
    const { container } = renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })],
    )
    await openSidebar(user)

    const aside = container.querySelector('aside') as HTMLElement
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' })
    handle.focus()

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(aside.style.width).toBe('396px')
    expect(localStorage.getItem('jpc:map-sidebar-width')).toBe('396')

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(aside.style.width).toBe('364px')
    expect(localStorage.getItem('jpc:map-sidebar-width')).toBe('364')
  })
})

describe('ResourceMapView — category filtering', () => {
  it('tapping one chip while everything is shown narrows straight down to just that category', async () => {
    // Deliberate, documented behavior (see ResourceMapView's own `toggle`
    // comment) — same as Google Maps' filter chips: starting from "all
    // shown", a single tap isolates that category rather than turning it
    // off. A second, separate test below covers actually deselecting one
    // from an already-narrowed set.
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' }), listingWithGeo({ id: 's1', category: 'synagogue', name: 'Beth Shalom' })],
      [grocery, synagogue],
    )

    expect(screen.getByTestId('point-count')).toHaveTextContent('2')

    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))

    expect(screen.getByTestId('point-count')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Select Acme Grocery' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select Beth Shalom' })).not.toBeInTheDocument()
  })

  it('tapping a second chip after narrowing adds it back in, rather than re-isolating', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' }), listingWithGeo({ id: 's1', category: 'synagogue', name: 'Beth Shalom' })],
      [grocery, synagogue],
    )

    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))
    expect(screen.getByTestId('point-count')).toHaveTextContent('1')

    await user.click(screen.getByRole('button', { name: /Synagogues/ }))

    expect(screen.getByTestId('point-count')).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: 'Select Acme Grocery' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Beth Shalom' })).toBeInTheDocument()
  })

  it('tracks a category_filter_selected event when a chip is selected, but not when deselected', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    // A third category so grocery+synagogue selected isn't "all" — otherwise
    // re-tapping grocery would hit the allChipsOn "narrow to just this one"
    // branch (itself a select, and correctly tracked) instead of a plain
    // deselect.
    const hotel = makeCategory({ id: 'hotel', pluralLabel: 'Hotels' })
    renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [
        listingWithGeo({ id: 'g1', category: 'grocery' }),
        listingWithGeo({ id: 's1', category: 'synagogue' }),
        listingWithGeo({ id: 'h1', category: 'hotel' }),
      ],
      [grocery, synagogue, hotel],
    )

    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))
    expect(track).toHaveBeenCalledWith('category_filter_selected', { category: 'grocery', source: 'chip' })

    vi.mocked(track).mockClear()
    await user.click(screen.getByRole('button', { name: /Synagogues/ }))
    // Adding a second chip after narrowing — also a select, so it tracks too.
    expect(track).toHaveBeenCalledWith('category_filter_selected', { category: 'synagogue', source: 'chip' })

    vi.mocked(track).mockClear()
    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))
    // Deselecting an already-selected chip is not a "selection" — no event.
    expect(track).not.toHaveBeenCalled()
  })

  it('starts pre-filtered to initialCategory', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    renderMap(
      <ResourceMapView onUp={vi.fn()} initialCategory="grocery" />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' }), listingWithGeo({ id: 's1', category: 'synagogue', name: 'Beth Shalom' })],
      [grocery, synagogue],
    )

    expect(screen.getByTestId('point-count')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Select Acme Grocery' })).toBeInTheDocument()
  })

  it('re-syncs to a NEW initialCategory on a later prop change, not just its own first mount', async () => {
    // Regression test: this screen stays mounted (not remounted) across an
    // in-app navigation away and back — see next.config.ts's cacheComponents
    // note — so a visitor who toggles a chip on the map, browses to a
    // different category directory, and taps THAT category's own "Map"
    // button used to keep seeing whatever they'd toggled last: the new
    // initialCategory prop arrived, but `selected` was only ever set from a
    // useState initializer, which React runs once and never again.
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    const listings = [
      listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' }),
      listingWithGeo({ id: 's1', category: 'synagogue', name: 'Beth Shalom' }),
    ]
    const categories = [grocery, synagogue]
    const community = makeCommunity()
    const content = makeContent({ categories })
    // Built by hand (not the renderMap/renderWithProviders helpers) so
    // `rerender` below can pass a brand-new initialCategory through the
    // EXACT SAME provider tree — renderWithProviders' own `rerender` would
    // otherwise replace the whole tree with a bare <ResourceMapView>, losing
    // CommunityProvider/ContentProvider and throwing on the very hooks this
    // test needs to re-render through.
    const wrap = (ui: ReactElement) => (
      <CommunityProvider community={community} communities={[community]}>
        <ContentProvider content={content}>
          <PinnedProvider>
            <DroppedPinsProvider>
              <ListingsProvider listings={listings}>{ui}</ListingsProvider>
            </DroppedPinsProvider>
          </PinnedProvider>
        </ContentProvider>
      </CommunityProvider>
    )
    const { rerender } = render(wrap(<ResourceMapView onUp={vi.fn()} initialCategory="grocery" />))
    expect(screen.getByTestId('point-count')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Select Acme Grocery' })).toBeInTheDocument()

    // Manually narrow to a THIRD state (both categories) — standing in for
    // the visitor toggling chips on the map itself before navigating away.
    await user.click(screen.getByRole('button', { name: /Synagogues/ }))
    expect(screen.getByTestId('point-count')).toHaveTextContent('2')

    // Same component instance, but a new initialCategory — what a real
    // navigation back via a different category's "Map" button delivers.
    rerender(wrap(<ResourceMapView onUp={vi.fn()} initialCategory="synagogue" />))

    expect(screen.getByTestId('point-count')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Select Beth Shalom' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select Acme Grocery' })).not.toBeInTheDocument()
  })
})

describe('ResourceMapView — selecting a place', () => {
  it('selecting a point on desktop opens its detail in the sidebar', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ category: 'grocery', name: 'Acme Grocery', address: '1 Main St' })], [grocery])

    await user.click(screen.getByRole('button', { name: 'Select Acme Grocery' }))

    expect(await screen.findByText('1 Main St')).toBeInTheDocument()
  })

  // Regression: select a place (opens the sidebar), close it with the edge
  // toggle WHILE still selected (not the detail panel's own "back" button —
  // that clears the selection outright, this doesn't), then click the map
  // background to deselect, then try to reopen. The toggle used to branch
  // on desktopNarrowed/desktopSelected to decide which of two flags to
  // flip — closing while selected set sidebarCollapsed, but deselecting via
  // the map background never reset it, so the later reopen attempt (now
  // routed to the other flag, sidebarOpenedManually) could never overcome
  // it. sidebarVisible stayed false no matter how many times "Show sidebar"
  // was clicked.
  it('reopening the sidebar still works after closing it while a place was selected, then deselecting', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const { container } = renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ category: 'grocery', name: 'Acme Grocery', address: '1 Main St' })],
      [grocery],
    )
    const asideWidth = () => (container.querySelector('aside') as HTMLElement | null)?.style.width.replace('px', '')

    await user.click(screen.getByRole('button', { name: 'Select Acme Grocery' }))
    expect(await screen.findByText('1 Main St')).toBeInTheDocument()
    expect(asideWidth()).toBe('380')

    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }))
    expect(asideWidth()).toBe('0')

    await user.click(screen.getByRole('button', { name: 'Click map background' }))

    await user.click(screen.getByRole('button', { name: 'Show sidebar' }))
    expect(asideWidth()).toBe('380')
  })

  // A pin tapped directly on the map is already visible right where it is —
  // reframing to fit it alongside the visitor's location would yank the view
  // they just tapped into. A listing picked from the sidebar list, on the
  // other hand, isn't necessarily on screen at all, so that one should still
  // reframe. ResourceMap itself only decides whether to actually move the
  // camera (mocked away here, see the vi.mock above) — this asserts the
  // frameToken signal ResourceMapView sends it distinguishes the two.
  it('bumps frameToken for a sidebar list pick but not for a map pin tap', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' }), listingWithGeo({ id: 's1', category: 'synagogue', name: 'Beth Shalom' })],
      [grocery, synagogue],
    )

    // Narrow to both categories so the sidebar shows a real (unmocked)
    // results list instead of auto-selecting a single match.
    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))
    await user.click(screen.getByRole('button', { name: /Synagogues/ }))

    const initialFrameToken = screen.getByTestId('frame-token').textContent

    // A pin tap (the mocked ResourceMap's own "Select" button, standing in
    // for onSelectPoint) opens the detail panel but must not bump the token.
    await user.click(screen.getByRole('button', { name: 'Select Acme Grocery' }))
    expect(await screen.findByRole('button', { name: 'Back to list' })).toBeInTheDocument()
    expect(screen.getByTestId('frame-token').textContent).toBe(initialFrameToken)

    // Back to the list, then pick the OTHER listing from the real sidebar
    // row — that one should bump the token.
    await user.click(screen.getByRole('button', { name: 'Back to list' }))
    // MobileNearbySheet stays mounted (CSS-hidden, not unmounted) even on
    // desktop, so its own copy of this row exists in the DOM too — the
    // sidebar's own row is the first of the two.
    await user.click(screen.getAllByRole('button', { name: /^Beth Shalom/ })[0]!)
    expect(await screen.findByRole('button', { name: 'Back to list' })).toBeInTheDocument()
    expect(screen.getByTestId('frame-token').textContent).not.toBe(initialFrameToken)
  })
  // Through the real component: the sidebar's edit bar is part of the
  // place's content, inside the scroll region, so it's reached at the end of
  // a long listing the way the directory's dropdown ends with it — not
  // docked to the sidebar's bottom edge the way phase 3 had it.
  it('ends the selected place\'s content with its edit bar, inside the sidebar\'s scroll region', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' }), listingWithGeo({ id: 's1', category: 'synagogue', name: 'Beth Shalom' })],
      [grocery, synagogue],
    )
    // Two categories, so the sidebar lists results rather than auto-selecting.
    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))
    await user.click(screen.getByRole('button', { name: /Synagogues/ }))
    // The sidebar's own row (the first of two: the mobile sheet stays
    // mounted on desktop too), not the map marker, which is outside it.
    const listRegion = screen.getAllByRole('button', { name: /^Acme Grocery/ })[0]!.closest('.overscroll-contain')
    expect(listRegion).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Select Acme Grocery' }))

    const back = await screen.findByRole('button', { name: 'Back to list' })
    const region = back.closest('.overscroll-contain')!
    const sidebar = back.closest('aside')!
    const pill = screen.getByRole('button', { name: 'Suggest an edit' })
    expect(sidebar).toContainElement(pill)
    expect(region).toContainElement(pill)
    // And a fresh region, not the list's: a shared one carried the list's
    // scroll offset into a place picked from deep in it.
    expect(region).not.toBe(listRegion)
  })
})

describe('ResourceMapView — pinning', () => {
  it('long-pressing a point pins it, which turns the Pinned chip on', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })], [grocery])

    expect(screen.queryByRole('button', { name: /^Pinned/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Long-press Acme Grocery' }))

    expect(await screen.findByRole('button', { name: /^Pinned/ })).toBeInTheDocument()
  })

  // Real bug: a listing in a non-mappable category (WhatsApp Groups,
  // Networking — `hasAddress: false`, which forces `capabilities.map` off
  // via resolveCapabilities) can still be pinned from its own directory row
  // (the card's Pin action has no capability gate), so it lands in
  // usePinned()'s `pinned` array like any other pin. The map's Pinned chip
  // used to read `pinned.length` directly — a raw count with no idea some
  // pins are for categories the map never plots at all — so pinning a
  // WhatsApp group flipped the chip on and counted a pin nothing would ever
  // show for. It must be driven by `allPoints` instead (already excludes
  // non-mappable categories the same way it excludes missing coordinates),
  // same fix categories.ts's own doc describes for the "chip with nothing
  // behind it" shape of bug.
  //
  // Seeded directly via the real pinned.ts storage shape (see
  // GenericDirectory.test.tsx's "pinned listings sort first" for the same
  // pattern) — the mocked ResourceMap only renders a Long-press button for
  // points actually passed to it, and this listing is never one of them.
  it('does not show the Pinned chip for a pin in a non-mappable category (e.g. WhatsApp Groups)', () => {
    localStorage.setItem('jpc:pinned-listings', JSON.stringify([{ id: 'wa1', categoryId: 'whatsapp' }]))
    // A normal mappable category alongside it — a map with only a
    // non-mappable category would hide the whole chip row regardless of the
    // bug, which is a false pass, not a real regression check (confirmed:
    // this test still passed against the unfixed source until Grocery was
    // added here). Real categories pages always have at least one mappable
    // one, so this matches the actual scenario the bug report describes.
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const whatsapp = makeCategory({
      id: 'whatsapp',
      pluralLabel: 'WhatsApp Groups',
      hasAddress: false,
      capabilities: resolveCapabilities(undefined, false),
    })
    // Real geo on the WhatsApp listing, so this is testing the
    // category-capability exclusion specifically, not just the pre-existing
    // missing-coordinates one.
    renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [
        listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' }),
        listingWithGeo({ id: 'wa1', category: 'whatsapp', name: 'Shul Chat' }),
      ],
      [grocery, whatsapp],
    )

    expect(screen.queryByRole('button', { name: /^Pinned/ })).not.toBeInTheDocument()
  })
})

describe('ResourceMapView — campaign chip', () => {
  // A wide, fixed date range rather than dates relative to "today" — this
  // only needs to always be currently active, not exercise
  // activeCampaignBanner's own boundary logic (that's campaignBanner.test.ts's
  // job).
  const liveBanner: CampaignBanner = {
    id: 'sukkah-map',
    categoryId: 'grocery',
    title: 'Sukkah Map',
    subtitle: '',
    startDate: '2000-01-01',
    endDate: '2999-12-31',
    destination: 'map',
  }

  it('shows the live campaign category as its own chip on desktop', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [grocery],
      [liveBanner],
    )

    // Queried by the ✨ marker, not accessible name: aria-hidden excludes the
    // sparkle from the button's accessible name, and the campaign category
    // also still appears as its own ordinary chip elsewhere in the row (this
    // is an additional distinctly-styled affordance, not a replacement) — so
    // "Grocery Stores" alone would match two buttons.
    const sparkle = screen.getByText('✨')
    expect(within(sparkle.closest('button')!).getByText('Grocery Stores')).toBeInTheDocument()
  })

  // Real bug: ResourceMapView renders TWO separate <CategoryFilter> instances
  // — one for the desktop chip row (only mounted when !isMobile), and a
  // second, shared one under the search bar that's what actually renders on
  // mobile. Only the desktop instance was ever passed `campaignChip`, so a
  // live campaign's chip appeared on desktop but silently never on mobile,
  // even with the exact same active campaign and category.
  it('shows the live campaign category as its own chip on mobile too', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderMobileMap(
      <ResourceMapView onUp={vi.fn()} />,
      [listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' })],
      [grocery],
      [liveBanner],
    )

    // Queried by the ✨ marker, not accessible name: aria-hidden excludes the
    // sparkle from the button's accessible name, and the campaign category
    // also still appears as its own ordinary chip elsewhere in the row (this
    // is an additional distinctly-styled affordance, not a replacement) — so
    // "Grocery Stores" alone would match two buttons.
    const sparkle = screen.getByText('✨')
    expect(within(sparkle.closest('button')!).getByText('Grocery Stores')).toBeInTheDocument()
  })
})

describe('ResourceMapView — nested touch gestures', () => {
  // The row's sliding content — SwipeRow's content element. Found through the
  // row's own name, not its Pin button: the Pin/Share strip is only mounted
  // while a row is actually swiped open (see SwipeRow), so at rest there's no
  // Pin button to find.
  function rowContentFor(scope: HTMLElement, name: string) {
    return within(scope).getByText(name).closest('div.px-4') as HTMLElement
  }

  // Real bug: MobileNearbySheet's content area used to capture the pointer
  // on every touchdown (an attempted fix for a different, unrelated
  // smoothness issue) — which won the race against NearbyList's own row-level
  // swipe-to-reveal gesture (its setPointerCapture is deliberately deferred
  // until it detects clear horizontal movement, specifically so a vertical
  // sheet-drag isn't stolen from it — see NearbyRow's onPointerMove). Once
  // the sheet's wrapper grabbed the pointer first, every row swipe attempt
  // got swallowed by the sheet instead of ever reaching the row.
  it('a horizontal swipe on a nearby-list row inside the mobile sheet still reveals its pin/share actions', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    // A listing id/name not used by any other test in this file — usePinned()
    // persists to the shared localStorage mock across tests (see
    // vitest.setup.ts), so reusing 'g1'/Acme Grocery here would pick up
    // whatever pinned state the "pinning" describe block above left behind.
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ id: 'row-swipe-1', category: 'grocery', name: 'Nosh Deli' })], [grocery])

    // MobileNearbySheet stays mounted (CSS-hidden, not unmounted) even on
    // desktop (see the frame-token test above) — its content area is the
    // only ancestor with this class, so it's enough to scope into the
    // sheet's own copy of the row rather than the sidebar's.
    const sheetContent = document.querySelector('.overscroll-contain') as HTMLElement
    const rowContent = rowContentFor(sheetContent, 'Nosh Deli')

    fireEvent.pointerDown(rowContent, { clientX: 300 })
    fireEvent.pointerMove(rowContent, { clientX: 190 }) // 110px left — past both the 8px activation threshold and the open threshold
    fireEvent.pointerUp(rowContent, { clientX: 190 })

    expect(rowContent.style.transform).toBe('translateX(-104px)') // two 52px actions — fully revealed
    expect(within(sheetContent).getByRole('button', { name: 'Pin Nosh Deli' })).toBeInTheDocument()
  })

  // Real bug, the other direction: a plain `abs(deltaX) >= 8` threshold
  // claimed the row's horizontal swipe the moment X crossed 8px, even while
  // the same drag was moving mostly vertically — so swiping up/down over a
  // row (to drag the sheet) could still crack the row open a little, unlike
  // Spotify/WhatsApp, where a vertical-dominant drag never triggers the
  // horizontal row action at all. See onPointerMove's own comment.
  it('a vertical-dominant drag over a row does not reveal its pin/share actions, even once its horizontal component crosses the row\'s own 8px threshold', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ id: 'row-swipe-2', category: 'grocery', name: 'Corner Bakery' })], [grocery])

    const sheetContent = document.querySelector('.overscroll-contain') as HTMLElement
    const rowContent = rowContentFor(sheetContent, 'Corner Bakery')

    fireEvent.pointerDown(rowContent, { clientX: 300, clientY: 300 })
    // 10px left, 50px down — past the row's own 8px X threshold, but
    // vertical clearly dominates. Read mid-drag, before release: releasing
    // this short a horizontal distance snaps back to closed either way (it
    // never reaches REVEAL_WIDTH/2), which would make even a wrongly-claimed
    // gesture look identical to a correctly-ignored one by the time the
    // gesture ends — same reasoning as the sheet's own boundary-handoff
    // tests reading dragHeight mid-drag instead of the post-release snap.
    fireEvent.pointerMove(rowContent, { clientX: 290, clientY: 350 })

    // No transform at all at rest — SwipeRow only sets one while displaced.
    expect(rowContent.style.transform).toBe('')
    expect(within(sheetContent).queryByRole('button', { name: 'Pin Corner Bakery' })).not.toBeInTheDocument()

    fireEvent.pointerUp(rowContent, { clientX: 290, clientY: 350 })
  })

  // The other side of the same axis-lock: once a row's own gesture commits
  // to horizontal, it now calls stopPropagation so MobileNearbySheet's own
  // vertical-drag listener (an ancestor) never sees those events either —
  // otherwise a horizontal-dominant swipe with even a small Y component
  // would still nudge the sheet's height at the same time it opens the row.
  it('a horizontal swipe on a row does not also drag the sheet, even though the events would otherwise bubble to it', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ id: 'row-swipe-3', category: 'grocery', name: 'Test Grocery' })], [grocery])

    const sheetContent = document.querySelector('.overscroll-contain') as HTMLElement
    const sheetEl = sheetContent.parentElement as HTMLElement
    const handle = sheetContent.previousElementSibling as HTMLElement

    // Raise the sheet to 'half' — at 'peek'/'half' every touch on the
    // content area is treated as a sheet-drag from the very first move (see
    // onContentPointerDown), the state where a row's own horizontal swipe
    // would leak into the sheet most easily if left unguarded.
    fireEvent.pointerDown(handle, { clientY: 100 })
    fireEvent.pointerUp(handle, { clientY: 100 })
    // The actual height number can't tell these two cases apart in jsdom —
    // ResizeObserver never fires here, so containerHeight stays 0 and every
    // snap point computes to the same PEEK_PX floor. But dragHeight is a
    // separate bit of state from the settled snap height, and a live drag
    // sets it (dropping the CSS transition to 'none') even when its numeric
    // value happens to match — a detectable side effect either way.
    const idleTransition = sheetEl.style.transition
    expect(idleTransition).toContain('280ms')

    const rowContent = rowContentFor(sheetContent, 'Test Grocery')

    fireEvent.pointerDown(rowContent, { clientX: 300, clientY: 300 })
    // 90px horizontal, 20px vertical — clearly horizontal, but a real Y
    // component too. Short of the 104px strip, so the row sits at a live,
    // unclamped position that proves it's following the finger.
    fireEvent.pointerMove(rowContent, { clientX: 210, clientY: 320 })

    expect(rowContent.style.transform).toBe('translateX(-90px)') // the row did respond
    expect(sheetEl.style.transition).toBe(idleTransition) // ...but the sheet did not

    fireEvent.pointerUp(rowContent, { clientX: 210, clientY: 320 })
  })
})

describe('ResourceMapView — mobile full-screen category picker', () => {
  // The compact chip row's own "⋯ More" chip (which opens the full-screen
  // picker) only renders once there are more categories than fit in the
  // row (maxVisible={4} — see ResourceMapView) — so these tests need 5+
  // categories, not the 1-2 the other describe blocks use, or "⋯ More"
  // never appears at all and there'd be nothing to open.
  const manyCategoryIds = ['grocery', 'synagogue', 'hotel', 'school', 'mikvah']
  const manyCategories = manyCategoryIds.map((id) => makeCategory({ id, pluralLabel: id[0]!.toUpperCase() + id.slice(1) }))
  // A category with zero plotted points doesn't even become a filter chip
  // (see ResourceMapView's own `options` — it skips any category whose
  // listing count is 0) — one geo-tagged listing per category so all five
  // actually show up in the row, or "⋯ More" would never appear either.
  const manyListings = manyCategoryIds.map((id) => listingWithGeo({ id: `${id}-1`, category: id }))

  async function openPicker(user: ReturnType<typeof userEvent.setup>) {
    renderMobileMap(<ResourceMapView onUp={vi.fn()} />, manyListings, manyCategories)
    await user.click(screen.getByRole('button', { name: '⋯ More' }))
  }

  function allCheckboxes() {
    return manyCategories.map((c) => screen.getByRole('checkbox', { name: `Show ${c.pluralLabel}` }))
  }

  // Regression coverage for the picker's own checkboxes: they used to
  // auto-revert to "show all" the instant the last box was unchecked (the
  // same "never leave nothing shown" guard the compact chip row uses), which
  // meant there was no way to actually leave every category unchecked while
  // still browsing the picker. Real checkboxes should show exactly what's
  // checked; the "nothing shown" guard now lives at Apply/Back time instead.
  it('lets every category be unchecked, without snapping back to all checked', async () => {
    const user = userEvent.setup()
    await openPicker(user)
    const boxes = allCheckboxes()
    for (const box of boxes) expect(box).toBeChecked()

    for (const box of boxes) await user.click(box)

    for (const box of boxes) expect(box).not.toBeChecked()
  })

  // Back is always enabled — unlike Apply, it can never leave the map in an
  // invalid ("nothing shown") state, since it doesn't touch the real
  // selection at all (see the draft-vs-apply tests below).
  it('disables Apply, with a note, once nothing is checked — Back stays enabled throughout', async () => {
    const user = userEvent.setup()
    await openPicker(user)
    const boxes = allCheckboxes()
    const applyButton = screen.getByRole('button', { name: 'Apply' })
    const backButton = screen.getByRole('button', { name: 'Back to map' })
    expect(applyButton).not.toBeDisabled()
    expect(backButton).not.toBeDisabled()
    expect(screen.queryByText(/Select at least one category/)).not.toBeInTheDocument()

    for (const box of boxes) await user.click(box)

    expect(applyButton).toBeDisabled()
    expect(backButton).not.toBeDisabled()
    expect(screen.getByText(/Select at least one category/)).toBeInTheDocument()

    await user.click(boxes[0]!)

    expect(applyButton).not.toBeDisabled()
    expect(screen.queryByText(/Select at least one category/)).not.toBeInTheDocument()
  })

  // "Show all" is a toggle now that the draft can genuinely sit at zero —
  // re-tapping it from an all-checked draft clears it, the same shortcut
  // working in both directions, and its label reflects which way a tap
  // would go.
  it('"Show all" toggles to "Deselect all" and back, both from the picker’s own draft', async () => {
    const user = userEvent.setup()
    await openPicker(user)
    expect(screen.getByRole('button', { name: 'Deselect all' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Deselect all' }))

    for (const box of allCheckboxes()) expect(box).not.toBeChecked()
    const showAllButton = screen.getByRole('button', { name: 'Show all' })
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()

    await user.click(showAllButton)

    for (const box of allCheckboxes()) expect(box).toBeChecked()
    expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled()
  })

  // Regression coverage for the actual ask: editing the picker (unchecking
  // boxes, deselecting all) must not touch the map until Apply — and Back
  // must restore exactly what was live before the picker opened, discarding
  // whatever was mid-edit.
  it('editing the picker does not filter the map until Apply is pressed', async () => {
    const user = userEvent.setup()
    await openPicker(user)
    expect(screen.getByTestId('point-count')).toHaveTextContent('5')

    await user.click(allCheckboxes()[0]!)
    expect(screen.getByTestId('point-count')).toHaveTextContent('5')

    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByTestId('point-count')).toHaveTextContent('4')
  })

  it('Back discards the draft — the map keeps showing what it did before the picker opened', async () => {
    const user = userEvent.setup()
    await openPicker(user)

    await user.click(screen.getByRole('button', { name: 'Deselect all' }))
    await user.click(screen.getByRole('button', { name: 'Back to map' }))

    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
    expect(screen.getByTestId('point-count')).toHaveTextContent('5')
  })

  it('reopening the picker after Back starts from the live selection again, not the discarded draft', async () => {
    const user = userEvent.setup()
    await openPicker(user)
    await user.click(allCheckboxes()[0]!)
    await user.click(screen.getByRole('button', { name: 'Back to map' }))

    await user.click(screen.getByRole('button', { name: '⋯ More' }))

    for (const box of allCheckboxes()) expect(box).toBeChecked()
  })

  // Regression test: picking one of a category's own filters (Kosher,
  // Denomination, …) inside the picker's expanded row is documented to imply
  // wanting that category too (see ensureDraftSelected/toggleBoolFieldInPicker
  // in ResourceMapView) — but that side effect used to land on the LIVE
  // selection, not the draft the checkboxes actually display, so picking a
  // filter for an unchecked category left its box looking unchecked (wrong)
  // and Apply would then silently drop the live change the filter had made.
  it('picking a category’s own filter in the picker checks that category’s box too', async () => {
    const user = userEvent.setup()
    const withFilter = manyCategories.map((c) =>
      c.id === 'grocery'
        ? { ...c, detailFields: [{ key: 'kosher', label: 'Kosher', type: 'boolean' as const, filterable: true }] }
        : c,
    )
    renderMobileMap(<ResourceMapView onUp={vi.fn()} />, manyListings, withFilter)
    await user.click(screen.getByRole('button', { name: '⋯ More' }))
    const groceryBox = screen.getByRole('checkbox', { name: 'Show Grocery' })
    await user.click(groceryBox)
    expect(groceryBox).not.toBeChecked()

    // Expand Grocery's row (the chevron button sharing its row content) and
    // pick its Kosher filter. Scoped with `expanded: false` — the compact
    // chip row behind the picker also has a "Grocery" chip in the DOM.
    await user.click(screen.getByRole('button', { name: /Grocery/, expanded: false }))
    await user.click(screen.getByRole('button', { name: 'Kosher' }))

    expect(groceryBox).toBeChecked()

    // And Apply actually commits it to the live selection, not just the
    // draft's own display — reopening the picker re-syncs from live state
    // (see the "reopening after Back" test above), so Grocery staying
    // checked there proves Apply carried the filter-triggered check through.
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: '⋯ More' }))
    expect(screen.getByRole('checkbox', { name: 'Show Grocery' })).toBeChecked()
  })
})

// The desktop map carries its own copy of the header's location control, but
// only in fullscreen — fullscreen paints over the header (desktop:fixed
// desktop:inset-0 desktop:z-50), taking the header's pill with it, so the map
// is the only place left to set an address. The boxed state relies on the
// header instead, since the header is `sticky top-0` and stays visible above
// a boxed map — a second copy there would be redundant. Both copies (map and
// header) drive the SAME controls object (see LocationProvider), which is
// what makes an address typed here apply to the whole site rather than to
// this screen.
describe('ResourceMapView — the map’s own location control', () => {
  function mapControls(overrides: Partial<LocationControls> = {}): LocationControls {
    return {
      address: '',
      coords: null,
      onAddressChange: vi.fn(),
      onCoords: vi.fn(),
      tracking: false,
      geoError: null,
      geoErrorSilent: false,
      onStartTracking: vi.fn(),
      onStopTracking: vi.fn(),
      ...overrides,
    }
  }

  // The boxed state is the default for the embedded (non-standalone) map —
  // `fullscreen` only starts true for the standalone map screen.
  function renderBoxed(controls?: LocationControls) {
    return renderMap(
      <HeaderCollapseProvider>
        <ResourceMapView onUp={vi.fn()} controls={controls} />
      </HeaderCollapseProvider>,
      [listingWithGeo({ category: 'grocery' })],
    )
  }

  // `standalone` forces fullscreen on mount (see ResourceMapView's own
  // `useState(!!standalone)`), which is the only way this suite reaches the
  // fullscreen-only control without driving the fullscreen-toggle button.
  function renderFullscreen(controls?: LocationControls) {
    return renderMap(
      <HeaderCollapseProvider>
        <ResourceMapView onUp={vi.fn()} standalone visible controls={controls} />
      </HeaderCollapseProvider>,
      [listingWithGeo({ category: 'grocery' })],
    )
  }

  it('shows the control on the fullscreen desktop map', () => {
    renderFullscreen(mapControls())
    expect(screen.getByRole('button', { name: 'Set location' })).toBeInTheDocument()
  })

  it('does not show the control on the boxed desktop map, where the sticky header pill already covers it', () => {
    renderBoxed(mapControls())
    expect(screen.queryByRole('button', { name: 'Set location' })).not.toBeInTheDocument()
  })

  it('drives the site-wide controls, so an address set here is set everywhere', async () => {
    const user = userEvent.setup()
    const controls = mapControls()
    renderFullscreen(controls)

    await user.click(screen.getByRole('button', { name: 'Set location' }))
    await user.click(screen.getByRole('button', { name: /Share my live location/ }))

    expect(controls.onStartTracking).toHaveBeenCalled()
  })

  it('reads the location already set elsewhere rather than keeping its own', () => {
    renderFullscreen(mapControls({ address: '1 Main St', coords: { lat: 40, lng: -75 } }))
    expect(screen.getByRole('button', { name: '1 Main St' })).toBeInTheDocument()
  })

  it('renders nothing for a caller with no location to set (the admin preview map)', () => {
    renderFullscreen(undefined)
    expect(screen.queryByRole('button', { name: 'Set location' })).not.toBeInTheDocument()
  })

  it('stays off mobile, where the header is collapsed rather than covered', () => {
    renderWithProviders(
      <PinnedProvider>
        <DroppedPinsProvider>
          <ListingsProvider listings={[listingWithGeo({ category: 'grocery' })]}>
            <ForcedViewport isMobile>
              <HeaderCollapseProvider>
                <ResourceMapView onUp={vi.fn()} standalone visible controls={mapControls()} />
              </HeaderCollapseProvider>
            </ForcedViewport>
          </ListingsProvider>
        </DroppedPinsProvider>
      </PinnedProvider>,
      { content: { categories: [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })] } },
    )
    expect(screen.queryByRole('button', { name: 'Set location' })).not.toBeInTheDocument()
  })
})

// A real user reported seeing a brief flash of "some other screen of a small
// map" on desktop after pressing Escape on the standalone /map route. Root
// cause: exitFullscreen() called setFullscreen(false) unconditionally before
// navigating away, which rendered one frame of the embedded/boxed map layout
// — a state that isn't supposed to exist for this screen at all (see the
// `standalone` prop's own doc: "a standalone map always opens (and stays)
// fullscreen — there's no boxed state for it") — before the navigation
// actually unmounted the component.
describe('ResourceMapView — standalone map Escape/exit', () => {
  function renderStandalone(onExitFullscreenToListing: () => void) {
    return renderMap(
      <HeaderCollapseProvider>
        <ResourceMapView onUp={vi.fn()} standalone visible onExitFullscreenToListing={onExitFullscreenToListing} />
      </HeaderCollapseProvider>,
      [listingWithGeo({ category: 'grocery' })],
    )
  }

  it('navigates away on Escape without ever dropping out of its fullscreen layout first', () => {
    const onExit = vi.fn()
    renderStandalone(onExit)

    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onExit).toHaveBeenCalledTimes(1)
    // Still the fullscreen layout, synchronously — nothing ever flipped it to
    // the boxed one, so there's no frame for that flash to happen in.
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View fullscreen' })).not.toBeInTheDocument()
  })

  it('clicking the fullscreen-toggle button (its other exit path) behaves the same way', async () => {
    const user = userEvent.setup()
    const onExit = vi.fn()
    renderStandalone(onExit)

    await user.click(screen.getByRole('button', { name: 'Exit fullscreen' }))

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument()
  })

  // Regression coverage for a real, live-confirmed bug: the fullscreen
  // wrapper's `fixed inset-0` positioning — the only thing that paints
  // behind env(safe-area-inset-top), the iOS status bar/notch area — used
  // to be `desktop:`-only, on the theory that mobile was already
  // "effectively full-bleed" via plain flex layout (see the `fullscreen`
  // state's own doc comment). Plain flow content doesn't extend behind the
  // notch the way a fixed layer does, though, which showed up live as a
  // gray gap (the page's own background) above the floating search bar on
  // a real notched phone. `fixed` (unprefixed, so it applies on mobile too)
  // needs its own bottom reservation there, unlike desktop — mobile's fixed
  // tab bar has to stay clear of it, where desktop has no such bottom
  // chrome to protect.
  it('on mobile, the standalone map is fixed to the viewport — not just desktop — with its top flush and its bottom clearing the tab bar', () => {
    const { container } = renderMobileMap(
      <HeaderCollapseProvider>
        <ResourceMapView onUp={vi.fn()} standalone visible />
      </HeaderCollapseProvider>,
    )

    const wrapper = container.querySelector('[class*="bottom-\\[calc(3\\.75rem"]') as HTMLElement | null
    expect(wrapper).not.toBeNull()
    expect(wrapper!.className).toMatch(/\bfixed\b/)
    expect(wrapper!.className).toMatch(/\btop-0\b/)
    expect(wrapper!.className).toMatch(/\bz-50\b/)
  })
})

// The standalone map's own address bar used to never actually update after
// the initial load — a chip toggle, a committed search, or picking a pin all
// left window.location exactly where it started. The mechanism meant to do
// this (a history.replaceState effect) checked window.history.state.mode
// === 'map', a leftover from the old hand-rolled navigation state machine
// (see useSiteNavigation.ts's own doc — "Now the URL is the state") that
// nothing sets any more, so the effect's body never ran. A category
// directory's own filters/search already round-trip through its URL the
// same way (FindResourcesConnected); this closes the same gap here, so a
// map link is shareable down to the exact chips/search/pin someone had
// open, the way viewMapForCategory's own initial-navigation link already
// was — see mapQueryString/parseMapQuery.
describe('ResourceMapView — the shareable URL (standalone)', () => {
  afterEach(() => window.history.replaceState(null, '', '/test-community/map'))

  // Two categories, not one — narrowing to "just Grocery" when it's the
  // ONLY category available is indistinguishable from "All" by set equality
  // (see allSelected's own comment below), so a single-category fixture
  // can't tell "wrote the chip" apart from "wrongly treated it as All".
  function renderStandaloneWithListings() {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    return renderMap(
      <HeaderCollapseProvider>
        <ResourceMapView onUp={vi.fn()} standalone visible />
      </HeaderCollapseProvider>,
      [
        listingWithGeo({ id: 'g1', category: 'grocery', name: 'Acme Grocery' }),
        listingWithGeo({ id: 's1', category: 'synagogue', name: 'Beth Shalom' }),
      ],
      [grocery, synagogue],
    )
  }

  it('writes the selected category chip to the URL', async () => {
    const user = userEvent.setup()
    renderStandaloneWithListings()

    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))

    expect(new URLSearchParams(window.location.search).get('cat')).toBe('grocery')
  })

  // "All" sets `selected` to a Set holding every current option's id, not
  // back to null (see showAll's own comment) — without allSelected treating
  // the two the same, this would spell out `cat=grocery,synagogue` instead
  // of just omitting the param the way the pristine "nothing tapped yet"
  // state already does.
  it('omits `cat` entirely once "All" is re-selected, instead of spelling out every category', async () => {
    const user = userEvent.setup()
    renderStandaloneWithListings()

    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))
    expect(new URLSearchParams(window.location.search).get('cat')).toBe('grocery')

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(new URLSearchParams(window.location.search).has('cat')).toBe(false)
  })

  it('writes the selected pin to the URL', async () => {
    const user = userEvent.setup()
    renderStandaloneWithListings()

    await user.click(screen.getByRole('button', { name: 'Select Acme Grocery' }))

    expect(new URLSearchParams(window.location.search).get('place')).toBe('g1')
  })

  // openNowActive derives from the committed query text itself (see
  // OPEN_NOW_WORDS) — the URL should carry that as `open=1`, not also
  // duplicate it into `q=open+now`.
  it('writes a committed "open now" search to the URL as open=1, not a redundant q=', async () => {
    const user = userEvent.setup()
    const { container } = renderStandaloneWithListings()
    const input = container.querySelector<HTMLInputElement>('input[placeholder^="Search name, address"]')!

    await user.type(input, 'open now')
    await user.keyboard('{Enter}')

    const params = new URLSearchParams(window.location.search)
    expect(params.get('open')).toBe('1')
    expect(params.get('q')).toBeNull()
  })
})
