// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import * as locationContext from '@/lib/locationContext'
import { ui } from '@/lib/uiConfig'
import ListingActionsFan from './ListingActionsFan'

vi.mock('@/lib/uiConfig', () => ({ ui: { map: { pins: true } } }))

// useShareLink has its own unit test for the native-share-vs-clipboard
// logic, so this file only cares what the fan does with it.
const shareMock = vi.fn()
vi.mock('@/lib/useShareLink', () => ({
  useShareLink: () => ({ share: shareMock, copied: false }),
}))

vi.mock('@/lib/locationContext', async () => {
  const actual = await vi.importActual<typeof import('@/lib/locationContext')>('@/lib/locationContext')
  return { ...actual, useOptionalLocation: vi.fn() }
})

function renderFan(
  categoryOverrides: Parameters<typeof makeCategory>[0] = {},
  { listing = {}, placement }: { listing?: Parameters<typeof makeListing>[0]; placement?: 'auto' | 'stack' } = {},
) {
  const item = makeListing({ id: 'listing-1', name: 'Goldi Market', geo: { lat: 39.95, lng: -75.16 }, ...listing })
  renderWithProviders(
    <ListingActionsFan item={item} category={makeCategory(categoryOverrides)} path="/philly/grocery/goldi-a1b2c3" placement={placement} />,
  )
  return item
}

function withLocation(overrides: { anchorListingId?: string | null; setListingAnchor?: () => void; unsetListingAnchor?: () => void } = {}) {
  vi.mocked(locationContext.useOptionalLocation).mockReturnValue({
    anchorListingId: null,
    setListingAnchor: vi.fn(),
    unsetListingAnchor: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof locationContext.useOptionalLocation>)
}

const openFan = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  // The movement tests below redefine this; leave it where every other test
  // in the file expects to find it.
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  // usePinned is backed by real localStorage, and every test here uses the
  // same listing id — a pin left by one would turn the next one's "Pin"
  // into "Pinned".
  localStorage.clear()
  ui.map.pins = true
})

describe('ListingActionsFan', () => {
  // This is the whole point of the component and the one thing most likely
  // to be "simplified" away later, so it is asserted on the rendered TEXT,
  // not on aria-labels: a screen reader would be fine either way, and a
  // sighted visitor staring at three white discs would not. Pin is a
  // thumbtack and Set-as-location is a map marker — glyphs this codebase
  // already had to split apart deliberately — and with the words gone they
  // are a coin toss.
  it('gives every action a visible caption, not just an accessible name', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))

    const menu = screen.getByRole('menu')
    for (const label of ['Pin', 'Share', 'Set as location']) {
      // Asserting on textContent alone is NOT enough, and this test was
      // briefly written that way: `sr-only` captions satisfy it perfectly,
      // so it passed against an icon-only fan — the exact thing it exists to
      // prevent. Two structural checks instead, since jsdom loads no
      // Tailwind and cannot tell us what is actually painted:
      //   - the caption element isn't visually hidden, and
      //   - the row has no aria-label, so its accessible name has to be
      //     coming from rendered text rather than a hidden string.
      const caption = within(menu).getByText(label)
      expect(caption.className).not.toMatch(/sr-only|visually-hidden/)
      expect(within(menu).getByRole('menuitem', { name: label })).not.toHaveAttribute('aria-label')
    }
  })

  // "More actions for {name}" was the kebab's label while it and this were
  // both in the DOM — two controls, one accessible name. The kebab is gone,
  // but "More" was never accurate here anyway: it implies some of the set is
  // already visible, and none of it is.
  it('names its trigger "Actions for", not "More actions for"', () => {
    withLocation()
    renderFan()
    expect(screen.queryByRole('button', { name: /more actions for/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Goldi Market' })).toBeInTheDocument()
  })

  it('closes after an action that completes immediately', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    await user.click(screen.getByRole('menuitem', { name: 'Pin' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // Share is the exception: its confirmation IS its own label changing to
  // "Copied!", which nobody reads if the fan closes out from under it.
  it('stays open after Share, whose label is its own confirmation', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    await user.click(screen.getByRole('menuitem', { name: 'Share' }))

    expect(shareMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  // The regression this pair exists for: the fan used to close on any scroll
  // EVENT, and a scroll event outlives the scroll it describes. Scrolling
  // the trigger into view and then activating it — a phone still coasting on
  // momentum when the thumb lands, or any automated click, which scrolls its
  // target into view first — opened the fan and then had it shut by the
  // event for a scroll that had already finished. Caught in a real browser,
  // where scrollIntoView's event arrived 26ms after the click.
  it('ignores a scroll event that reports no actual movement', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // Exactly the shape of the late event: the position is whatever it was
    // when the fan opened, because the scroll it belongs to already landed.
    // Wrapped in act() deliberately — a bare dispatch leaves React's state
    // update unflushed, so the assertion reads the PREVIOUS render and both
    // of these tests pass no matter what the handler does. That is how they
    // were first written, and the mutation run is what exposed it.
    act(() => {
      document.dispatchEvent(new Event('scroll'))
    })
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('still closes when the page has genuinely moved', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true })
    act(() => {
      document.dispatchEvent(new Event('scroll'))
    })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // The gating lives in useListingActions, shared with the kebab — these two
  // prove the fan actually honours it rather than rendering a fixed set.
  it('drops Set as location for a category with no physical place', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan({ hasAddress: false })

    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    expect(screen.queryByRole('menuitem', { name: /set as location/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Share' })).toBeInTheDocument()
  })

  it('drops Set as location when there is no location provider at all', async () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    const user = userEvent.setup()
    renderFan()

    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    expect(screen.queryByRole('menuitem', { name: /set as location/i })).not.toBeInTheDocument()
  })

  // ── Ported from ListingActionsMenu.test.tsx when the kebab was deleted ──
  // That file was the only coverage several of these had: the backdrop that
  // makes outside-tap dismissal work (with the real-iPhone history written
  // up in ListingActionsFan's own doc), the aria-pressed rule axe flags as
  // critical, and useListingActions' whole Pin/Set-as-location state
  // machine, which has no test file of its own. Deleting a file along with
  // the component it tests quietly deletes every guarantee only it made.

  it('closes on an outside tap, via its invisible backdrop', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await openFan(user)
    await user.click(screen.getByTestId('listing-actions-fan-backdrop'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('does not let the dismissing tap reach whatever is behind the backdrop', async () => {
    withLocation()
    const onBackgroundClick = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <div onClick={onBackgroundClick}>
        <ListingActionsFan item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} path="/philly/grocery/goldi-a1b2c3" />
      </div>,
    )

    await openFan(user)
    // The backdrop is portaled to document.body, so this div is not its DOM
    // ancestor — but React bubbles a portaled element's events through the
    // COMPONENT tree regardless, and this div is that tree's ancestor. That
    // is exactly the gap: without the backdrop's own stopPropagation, the
    // tap would close the fan AND reach the card or map beneath it.
    await user.click(screen.getByTestId('listing-actions-fan-backdrop'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onBackgroundClick).not.toHaveBeenCalled()
  })

  it('stops the trigger and every action from bubbling to a parent handler', async () => {
    withLocation()
    const onParentClick = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <div onClick={onParentClick}>
        <ListingActionsFan
          item={makeListing({ id: 'listing-1', name: 'Goldi Market', geo: { lat: 39.95, lng: -75.16 } })}
          category={makeCategory()}
          path="/philly/grocery/goldi-a1b2c3"
        />
      </div>,
    )

    await openFan(user)
    await user.click(screen.getByRole('menuitem', { name: 'Pin' }))
    expect(onParentClick).not.toHaveBeenCalled()
  })

  // A scroll inside a nested element — which is how nearly all scrolling in
  // this app happens (a category list, the map sheet's own region) — has to
  // close it too. 'scroll' doesn't bubble, so this only passes if the
  // listener really is catching it on the way down, in the capture phase.
  it('closes when a nested scroll region scrolls', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await openFan(user)
    const scrollable = document.createElement('div')
    document.body.appendChild(scrollable)
    fireEvent.scroll(scrollable)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    scrollable.remove()
  })

  // These render as role="menuitem", where aria-pressed is not an allowed
  // attribute — axe flags that as critical. State lives in the label.
  it('puts no aria-pressed on any action', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await openFan(user)
    const items = screen.getAllByRole('menuitem')
    expect(items.length).toBe(3)
    for (const item of items) expect(item, item.textContent ?? '').not.toHaveAttribute('aria-pressed')
  })

  it('drops Pin when the community has pins turned off, but keeps Share', async () => {
    ui.map.pins = false
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await openFan(user)
    expect(screen.queryByRole('menuitem', { name: /^pin/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Share' })).toBeInTheDocument()
  })

  it('drops Set as location for a listing whose address never geocoded', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan({}, { listing: { geo: undefined } })

    await openFan(user)
    expect(screen.queryByRole('menuitem', { name: /set as location/i })).not.toBeInTheDocument()
  })

  it('sets this listing as the location, and closes', async () => {
    const setListingAnchor = vi.fn()
    withLocation({ setListingAnchor })
    const user = userEvent.setup()
    renderFan()

    await openFan(user)
    await user.click(screen.getByRole('menuitem', { name: 'Set as location' }))

    expect(setListingAnchor).toHaveBeenCalledWith({ id: 'listing-1', name: 'Goldi Market', coords: { lat: 39.95, lng: -75.16 } })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('reads "Location set" when this listing is already the location, and unsets it', async () => {
    const unsetListingAnchor = vi.fn()
    withLocation({ anchorListingId: 'listing-1', unsetListingAnchor })
    const user = userEvent.setup()
    renderFan()

    await openFan(user)
    await user.click(screen.getByRole('menuitem', { name: 'Location set' }))
    expect(unsetListingAnchor).toHaveBeenCalledTimes(1)
  })

  it('pins the listing, and says so the next time it opens', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await openFan(user)
    await user.click(screen.getByRole('menuitem', { name: 'Pin' }))
    await openFan(user)
    expect(screen.getByRole('menuitem', { name: 'Pinned' })).toBeInTheDocument()
  })

  // ── placement="stack", for surfaces with no scrim (the map) ───────────
  // jsdom loads no stylesheet, so it cannot say whether the backdrop is
  // actually painted dark — that is checked in a real browser. What it can
  // see are the inline styles the placement is expressed in, which is how
  // these tell `stack` (anchored right+bottom, rising from the trigger) from
  // the desktop default.
  it('rises from the trigger when asked to, even on desktop', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan({}, { placement: 'stack' })

    await openFan(user)
    const menu = screen.getByRole('menu')
    expect(menu.style.right).not.toBe('')
    expect(menu.style.bottom).not.toBe('')
    expect(menu.style.left).toBe('')
    expect(menu.style.top).toBe('')
  })

  it('keeps the desktop placement when not asked for stack', async () => {
    withLocation()
    const user = userEvent.setup()
    renderFan()

    await openFan(user)
    // jsdom's all-zero trigger rect leaves no height for the side column,
    // so desktop's fallback — a row under the trigger — is what it picks.
    // Either way, not `stack`.
    const menu = screen.getByRole('menu')
    expect(menu.style.top).not.toBe('')
    expect(menu.style.bottom).toBe('')
  })
})
