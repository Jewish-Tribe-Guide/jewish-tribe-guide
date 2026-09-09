// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import * as locationContext from '@/lib/locationContext'
import { ui } from '@/lib/uiConfig'
import ListingActionsMenu from './ListingActionsMenu'

// A plain mutable object (not vi.fn()-backed) — ListingActionsMenu reads
// ui.map.pins directly on every render, so flipping this property between
// tests is enough; no need to re-mock per test.
vi.mock('@/lib/uiConfig', () => ({ ui: { map: { pins: true } } }))

// useShareLink already has its own dedicated unit test (useShareLink.test.tsx)
// covering the native-share-vs-clipboard-copy logic — mocked here so this
// file only exercises what ListingActionsMenu itself does with it (calls
// share(), reflects `copied` in the menu item's label).
const shareMock = vi.fn()
vi.mock('@/lib/useShareLink', () => ({
  useShareLink: () => ({ share: shareMock, copied: false }),
}))

// useOptionalLocation is mocked per-test below (via vi.spyOn) rather than a
// real LocationProvider — that provider pulls in useLiveLocation's
// geolocation/tracking machinery, which nothing here needs; this only cares
// about what ListingActionsMenu does with whatever the hook returns.
vi.mock('@/lib/locationContext', async () => {
  const actual = await vi.importActual<typeof import('@/lib/locationContext')>('@/lib/locationContext')
  return { ...actual, useOptionalLocation: vi.fn() }
})

function renderMenu(overrides: Partial<Parameters<typeof makeListing>[0]> = {}) {
  const item = makeListing({ id: 'listing-1', name: 'Goldi Market', ...overrides })
  const category = makeCategory()
  renderWithProviders(<ListingActionsMenu item={item} category={category} path="/philly/grocery/goldi-a1b2c3" />)
  return { item, category }
}

// Simulates the kebab's own position for the open-direction measurement in
// openMenu() — jsdom's default getBoundingClientRect() is all zeros, which
// (against jsdom's real, large default innerWidth) already reads as "plenty
// of room to the right", i.e. the common case. Only the near-the-edge case
// needs this.
function mockKebabNearRightEdge() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: window.innerWidth - 20,
    top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => {},
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  // Restores Element.prototype.getBoundingClientRect after
  // mockKebabNearRightEdge — clearAllMocks alone resets call history but not
  // a spy's overridden implementation, which would otherwise leak into
  // every test after it.
  vi.restoreAllMocks()
  // usePinned is backed by real localStorage (see pinnedContext.tsx) — every
  // test here uses the same listing id, so a pin left set by one test would
  // otherwise leak into the next.
  localStorage.clear()
  ui.map.pins = true
})

describe('ListingActionsMenu', () => {
  it('opens the menu on kebab click and shows Pin/Share, closes on Escape', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /more actions for goldi market/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^pin$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^share$/i })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // The original build showed Pin unconditionally, missing the same
  // ui.map.pins gate PinButton and the map's own pin filter chip respected —
  // a community with pinning turned off still saw a working Pin action here.
  it('hides Pin when ui.map.pins is off, but still shows Share', async () => {
    ui.map.pins = false
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.queryByRole('menuitem', { name: /^pin$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^share$/i })).toBeInTheDocument()
  })

  // With room to the right (the common case — a directory card, a dialog
  // header), the menu opens rightward so it stays clear of the name/
  // address/chevron to the kebab's own left.
  it('opens the dropdown extending right of the kebab when there is room', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveClass('left-0')
    expect(menu).not.toHaveClass('right-0')
  })

  // MapPlaceDetail's kebab sits flush against the edge of an edge-to-edge
  // mobile sheet — measured, not a fixed per-caller choice (see openMenu's
  // own doc), so a 160px-wide menu doesn't run off the right side of the
  // screen there.
  it('opens the dropdown extending left of the kebab when there is no room to the right', async () => {
    mockKebabNearRightEdge()
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveClass('right-0')
    expect(menu).not.toHaveClass('left-0')
  })

  it('closes the menu on an outside click', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('does not render "Set location" when there is no location context (e.g. the admin preview)', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.queryByRole('menuitem', { name: /set location/i })).not.toBeInTheDocument()
  })

  it('does not render "Set location" when the listing has no geo coordinates', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue({
      anchorListingId: null,
      setListingAnchor: vi.fn(),
      unsetListingAnchor: vi.fn(),
    } as unknown as ReturnType<typeof locationContext.useOptionalLocation>)
    const user = userEvent.setup()
    renderMenu({ geo: undefined })

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.queryByRole('menuitem', { name: /set location/i })).not.toBeInTheDocument()
  })

  it('shows "Set location", calls setListingAnchor, and closes the menu', async () => {
    const setListingAnchor = vi.fn()
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue({
      anchorListingId: null,
      setListingAnchor,
      unsetListingAnchor: vi.fn(),
    } as unknown as ReturnType<typeof locationContext.useOptionalLocation>)
    const user = userEvent.setup()
    renderMenu({ geo: { lat: 39.95, lng: -75.16 } })

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /^set location$/i }))

    expect(setListingAnchor).toHaveBeenCalledWith({ id: 'listing-1', name: 'Goldi Market', coords: { lat: 39.95, lng: -75.16 } })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows "Location set" and calls unsetListingAnchor when this listing is already the anchor', async () => {
    const unsetListingAnchor = vi.fn()
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue({
      anchorListingId: 'listing-1',
      setListingAnchor: vi.fn(),
      unsetListingAnchor,
    } as unknown as ReturnType<typeof locationContext.useOptionalLocation>)
    const user = userEvent.setup()
    renderMenu({ geo: { lat: 39.95, lng: -75.16 } })

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /location set/i }))

    expect(unsetListingAnchor).toHaveBeenCalledTimes(1)
  })

  it('toggles Pin, reflects the pinned state in the label, and closes the menu', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /^pin$/i }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menuitem', { name: /^pinned$/i })).toBeInTheDocument()
  })

  it('calls share() on Share click and leaves the menu open', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /^share$/i }))

    expect(shareMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  // The card's own root div toggles the collapsed/expanded state on any
  // click that bubbles to it (see GenericListingCard) — every action here
  // must stop that from happening, the same concern PinButton/
  // SetLocationButton/the distance slot's own picker button already
  // document.
  it('stops the kebab click and every menu item click from bubbling to a parent handler', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue({
      anchorListingId: null,
      setListingAnchor: vi.fn(),
      unsetListingAnchor: vi.fn(),
    } as unknown as ReturnType<typeof locationContext.useOptionalLocation>)
    const onParentClick = vi.fn()
    const user = userEvent.setup()
    const item = makeListing({ id: 'listing-1', name: 'Goldi Market', geo: { lat: 39.95, lng: -75.16 } })
    const category = makeCategory()
    renderWithProviders(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onParentClick}>
        <ListingActionsMenu item={item} category={category} path="/philly/grocery/goldi-a1b2c3" />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /^pin$/i }))

    expect(onParentClick).not.toHaveBeenCalled()
  })
})
