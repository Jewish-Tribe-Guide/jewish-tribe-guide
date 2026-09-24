// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
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
  // The movement tests redefine this; leave it where every other test in
  // this file expects to find it.
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
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

  // aria-pressed isn't a supported attribute of role="menuitem" (axe:
  // aria-allowed-attr, critical). The items' labels already carry the state —
  // "Pin"/"Pinned", "Set as location"/"Location set" — so nothing is lost.
  it('puts no aria-pressed on any menu item, which the menuitem role does not support', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue({
      anchorListingId: null,
      setListingAnchor: vi.fn(),
      unsetListingAnchor: vi.fn(),
    } as unknown as ReturnType<typeof locationContext.useOptionalLocation>)
    const user = userEvent.setup()
    renderMenu({ geo: { lat: 39.95, lng: -75.16 } })

    await user.click(screen.getByRole('button', { name: /more actions/i }))

    const items = screen.getAllByRole('menuitem')
    // Pin and Set as location are the two that used to carry it.
    expect(items.length).toBeGreaterThanOrEqual(3)
    for (const item of items) expect(item, item.textContent ?? '').not.toHaveAttribute('aria-pressed')
  })

  // Material's "state layer" convention for an icon-only button — see the
  // kebab button's own doc comment. Kept lit for as long as the menu is
  // open (not just for the hover/press instant), so there's a visible line
  // from the button back to the popup it caused.
  it('keeps the kebab lit (bg-slate-100) while its menu is open, not just on hover', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()
    const kebab = screen.getByRole('button', { name: /more actions for goldi market/i })

    expect(kebab).not.toHaveClass('bg-slate-100')

    await user.click(kebab)
    expect(kebab).toHaveClass('bg-slate-100')

    await user.keyboard('{Escape}')
    expect(kebab).not.toHaveClass('bg-slate-100')
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
  // address/chevron to the kebab's own left. The popup is portaled and
  // positioned with inline fixed-position styles (see openMenu's own doc),
  // not Tailwind position classes any more — asserting on transform-origin
  // is what's left to check "which corner did this actually anchor to"
  // without hardcoding a specific pixel value.
  it('opens the dropdown extending right of the kebab when there is room', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    const menu = screen.getByRole('menu')
    expect(menu.style.transformOrigin).toContain('left')
    expect(menu.style.transformOrigin).not.toContain('right')
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
    expect(menu.style.transformOrigin).toContain('right')
    expect(menu.style.transformOrigin).not.toContain('left')
  })

  // The invisible backdrop (see ListingActionsMenu's own top-of-file doc) is
  // what an outside click actually lands on now — a real, full-viewport DOM
  // element sitting in front of everything else while the menu is open, not
  // a document-level listener inferring "outside" from where a click
  // bubbled from. Clicking it directly (via its test id — in a real browser
  // a tap anywhere outside the popup hits this same element by ordinary hit-
  // testing, which jsdom doesn't simulate from screen coordinates) is what
  // that real-world tap looks like here; a raw `document.body` click, by
  // contrast, targets body ITSELF, which a click bubbling INTO the backdrop
  // (a descendant) never does.
  it('closes the menu on an outside click, via the invisible backdrop', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByTestId('listing-actions-backdrop'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // The backdrop is a REAL DOM element covering the whole viewport while the
  // menu is open, so an outside click never reaches whatever's visually
  // underneath it at all — not a suppression convention the thing
  // underneath has to opt into (see this component's own top-of-file doc on
  // why the old per-caller onOutsideDismiss/onOpenChange props are gone).
  // Confirms the other half of that: the tap that closes the menu doesn't
  // reach a click handler sitting behind the backdrop.
  it('does not let the dismissing click reach whatever is behind the backdrop', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const onBackgroundClick = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <div onClick={onBackgroundClick}>
        <ListingActionsMenu item={makeListing()} category={makeCategory()} path="/philly/grocery/goldi-a1b2c3" />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // The backdrop is portaled to document.body, so this parent isn't its
    // DOM ancestor — but React bubbles a portaled element's events through
    // its LOGICAL component tree regardless (this `<div>` IS that tree's
    // ancestor), which is exactly the gap this test guards: without the
    // backdrop's own stopPropagation, this click would still reach it.
    await user.click(screen.getByTestId('listing-actions-backdrop'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onBackgroundClick).not.toHaveBeenCalled()
  })

  // Standard behavior for any floating menu — a scroll means the visitor
  // has moved on, same as a tap elsewhere. Dispatched on an arbitrary
  // nested element, not document itself: 'scroll' doesn't bubble, so this
  // only proves anything if the listener is genuinely catching it via
  // capture (matching how a real scroll — a category page's own list, the
  // map sheet's own scroll region — actually happens in this app, never on
  // document directly).
  it('closes the menu when the page (or a scrollable ancestor) scrolls', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    const scrollable = document.createElement('div')
    document.body.appendChild(scrollable)
    // fireEvent, not a raw dispatchEvent — this wraps the dispatch in
    // act(), so the setOpen(false) it triggers is actually flushed to the
    // DOM before the assertion below runs. A plain dispatchEvent call
    // looked like a real failure here at first (menu still open) purely
    // because of that missing flush, not because the listener didn't fire —
    // confirmed by checking registration directly before landing on this.
    fireEvent.scroll(scrollable)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    scrollable.remove()
  })

  // The distinction the pair below exists for: a scroll POSITION changes
  // synchronously, but the event announcing it is queued and arrives a
  // frame or more later — 26ms for a plain scrollIntoView, measured in a
  // real browser. So scrolling this button into view and then activating it
  // (a phone still coasting on momentum when the thumb lands, or any
  // automated click, which scrolls its target into view first) used to open
  // the menu and then have it closed by the event for a scroll that had
  // already finished. e2e/mobile.spec.ts carried a pre-scroll workaround
  // for precisely this.
  it('ignores a page scroll event that reports no actual movement', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // The shape of the late event: the position is exactly what it was when
    // the menu opened, because the scroll it belongs to already landed.
    fireEvent.scroll(document)

    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('still closes when the page has genuinely moved', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true })
    fireEvent.scroll(document)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('does not render "Set as location" when there is no location context (e.g. the admin preview)', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.queryByRole('menuitem', { name: /set as location/i })).not.toBeInTheDocument()
  })

  it('does not render "Set as location" when the listing has no geo coordinates', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue({
      anchorListingId: null,
      setListingAnchor: vi.fn(),
      unsetListingAnchor: vi.fn(),
    } as unknown as ReturnType<typeof locationContext.useOptionalLocation>)
    const user = userEvent.setup()
    renderMenu({ geo: undefined })

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.queryByRole('menuitem', { name: /set as location/i })).not.toBeInTheDocument()
  })

  it('shows "Set as location", calls setListingAnchor, and closes the menu', async () => {
    const setListingAnchor = vi.fn()
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue({
      anchorListingId: null,
      setListingAnchor,
      unsetListingAnchor: vi.fn(),
    } as unknown as ReturnType<typeof locationContext.useOptionalLocation>)
    const user = userEvent.setup()
    renderMenu({ geo: { lat: 39.95, lng: -75.16 } })

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /^set as location$/i }))

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
  // Edit/Report — optional, only passed by GenericListingCard's mobile
  // collapsed row (see this component's own doc). Undefined by default in
  // renderMenu, so every test above already proves they don't leak into
  // MapPlaceDetail/ListingDetailModal's own kebab instances, which never
  // pass them.
  describe('Edit', () => {
    it('does not render Edit or the divider when it is not passed', async () => {
      vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
      const user = userEvent.setup()
      renderMenu()

      await user.click(screen.getByRole('button', { name: /more actions/i }))
      expect(screen.queryByRole('menuitem', { name: /^edit$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: /^report$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    })

    // Removal used to be a "Report" row here. It now lives at the foot of the
    // edit form (RemovalRequest), so the menu must never offer it again.
    it('shows Edit, with a divider above it, and no Report row', async () => {
      vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
      const onEdit = vi.fn()
      const user = userEvent.setup()
      const item = makeListing({ id: 'listing-1', name: 'Goldi Market' })
      const category = makeCategory()
      renderWithProviders(
        <ListingActionsMenu
          item={item}
          category={category}
          path="/philly/grocery/goldi-a1b2c3"
          onEdit={onEdit}
          canEdit
        />,
      )

      await user.click(screen.getByRole('button', { name: /more actions/i }))
      expect(screen.getByRole('separator')).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: /report/i })).not.toBeInTheDocument()
    })

    it('calls onEdit and closes the menu, without bubbling to a parent handler', async () => {
      vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
      const onEdit = vi.fn()
      const onParentClick = vi.fn()
      const user = userEvent.setup()
      renderWithProviders(
        <div onClick={onParentClick}>
          <ListingActionsMenu item={makeListing()} category={makeCategory()} path="/philly/grocery/goldi-a1b2c3" onEdit={onEdit} canEdit />
        </div>,
      )

      await user.click(screen.getByRole('button', { name: /more actions/i }))
      await user.click(screen.getByRole('menuitem', { name: /^edit$/i }))

      expect(onEdit).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(onParentClick).not.toHaveBeenCalled()
    })

  })

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
      <div onClick={onParentClick}>
        <ListingActionsMenu item={item} category={category} path="/philly/grocery/goldi-a1b2c3" />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /^pin$/i }))

    expect(onParentClick).not.toHaveBeenCalled()
  })
})
