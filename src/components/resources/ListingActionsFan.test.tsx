// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import * as locationContext from '@/lib/locationContext'
import ListingActionsFan from './ListingActionsFan'

vi.mock('@/lib/uiConfig', () => ({ ui: { map: { pins: true } } }))

// Same reasoning as ListingActionsMenu.test.tsx: useShareLink has its own
// unit test for the native-share-vs-clipboard logic, so this file only cares
// what the fan does with it.
const shareMock = vi.fn()
vi.mock('@/lib/useShareLink', () => ({
  useShareLink: () => ({ share: shareMock, copied: false }),
}))

vi.mock('@/lib/locationContext', async () => {
  const actual = await vi.importActual<typeof import('@/lib/locationContext')>('@/lib/locationContext')
  return { ...actual, useOptionalLocation: vi.fn() }
})

function renderFan(categoryOverrides: Parameters<typeof makeCategory>[0] = {}) {
  const item = makeListing({ id: 'listing-1', name: 'Goldi Market', geo: { lat: 39.95, lng: -75.16 } })
  renderWithProviders(
    <ListingActionsFan item={item} category={makeCategory(categoryOverrides)} path="/philly/grocery/goldi-a1b2c3" />,
  )
  return item
}

function withLocation() {
  vi.mocked(locationContext.useOptionalLocation).mockReturnValue({
    anchorListingId: null,
    setListingAnchor: vi.fn(),
    unsetListingAnchor: vi.fn(),
  } as unknown as ReturnType<typeof locationContext.useOptionalLocation>)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  // The movement tests below redefine this; leave it where every other test
  // in the file expects to find it.
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
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

  // "More actions for {name}" is the collapsed row's kebab, which is still in
  // the DOM behind an open listing. Two controls with one accessible name is
  // a real problem for anyone navigating by name — and this codebase has
  // already shipped that bug once, with two different Add buttons.
  it('does not reuse the collapsed row kebab\'s accessible name', () => {
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
})
