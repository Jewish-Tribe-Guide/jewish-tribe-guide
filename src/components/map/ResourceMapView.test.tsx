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
import type { DirectoryResource } from '@/types'
import type { MapPoint } from './ResourceMap'
import ResourceMapView from './ResourceMapView'

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
  }: {
    points: MapPoint[]
    onSelectPoint?: (p: MapPoint) => void
    onLongPressPoint?: (p: MapPoint) => void
  }) => (
    <div data-testid="resource-map">
      <p data-testid="point-count">{points.length}</p>
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
