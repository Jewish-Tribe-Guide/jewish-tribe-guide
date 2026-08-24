// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { ListingsProvider } from '@/lib/listingsContext'
import { PinnedProvider } from '@/lib/pinnedContext'
import { DroppedPinsProvider } from '@/lib/droppedPinsContext'
import { ForcedViewport } from '@/lib/useIsMobile'
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
// Landing.test.tsx's HomeMap/ZmanimStrip mocks.
vi.mock('./ResourceMap', () => ({
  default: ({
    points,
    onSelectPoint,
    onLongPressPoint,
    frameToken,
  }: {
    points: MapPoint[]
    onSelectPoint?: (p: MapPoint) => void
    onLongPressPoint?: (p: MapPoint) => void
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
    </div>
  ),
}))

afterEach(() => cleanup())

// usePinned()/useDroppedPins() throw outside their providers, and
// useAllListings() silently returns null outside ListingsProvider — which
// leaves `loading` permanently true (see ResourceMapView's own `loading =
// listings === null || categories === null`) — so every test needs all
// three, unlike the CommunityProvider/ContentProvider-only components tested
// so far.
function renderMap(ui: ReactElement, listings: DirectoryResource[] = [], categories = [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })]) {
  return renderWithProviders(
    <PinnedProvider>
      <DroppedPinsProvider>
        <ListingsProvider listings={listings}>{ui}</ListingsProvider>
      </DroppedPinsProvider>
    </PinnedProvider>,
    { content: { categories } },
  )
}

// The full-screen category picker (the "⋯ More" chip's destination) only
// renders on mobile. useIsMobile measures window.matchMedia by default,
// which jsdom's global polyfill always reports as desktop — ForcedViewport
// (the same mechanism the admin device preview uses) short-circuits that
// instead of fighting the polyfill.
function renderMobileMap(ui: ReactElement, listings: DirectoryResource[] = [], categories = [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })]) {
  return renderWithProviders(
    <PinnedProvider>
      <DroppedPinsProvider>
        <ListingsProvider listings={listings}>
          <ForcedViewport isMobile>{ui}</ForcedViewport>
        </ListingsProvider>
      </DroppedPinsProvider>
    </PinnedProvider>,
    { content: { categories } },
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
})

describe('ResourceMapView — selecting a place', () => {
  it('selecting a point on desktop opens its detail in the sidebar', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderMap(<ResourceMapView onUp={vi.fn()} />, [listingWithGeo({ category: 'grocery', name: 'Acme Grocery', address: '1 Main St' })], [grocery])

    await user.click(screen.getByRole('button', { name: 'Select Acme Grocery' }))

    expect(await screen.findByText('1 Main St')).toBeInTheDocument()
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
