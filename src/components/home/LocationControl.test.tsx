// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeaderCollapseProvider, useCollapseHeader } from '@/lib/headerVisibility'
import LocationControl, { type LocationControls } from './LocationControl'

// Regression coverage for: typing an address that never resolves to a real
// place (no autocomplete suggestion picked, or one Google couldn't geocode)
// used to still make the header pill read as "location set" — filled pin,
// the typed text shown in place of "Set location" — even though there was no
// coordinate behind it and every distance-sorted category silently showed
// nothing. The pill must only read as "set" once `coords` is actually
// present, never off `address` alone. See locationContext.tsx's `anchor`
// for the other half of this fix.

function controls(overrides: Partial<LocationControls> = {}): LocationControls {
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

function renderControl(c: LocationControls) {
  return render(
    <HeaderCollapseProvider>
      <LocationControl controls={c} />
    </HeaderCollapseProvider>,
  )
}

afterEach(() => cleanup())

describe('LocationControl — the header pill', () => {
  it('still reads "Set location" for typed text with no resolved coords', () => {
    renderControl(controls({ address: '412', coords: null }))

    expect(screen.getByRole('button', { name: 'Set location' })).toBeInTheDocument()
    expect(screen.queryByText('412')).not.toBeInTheDocument()
  })

  it('shows the address once it has resolved coords', () => {
    renderControl(controls({ address: '412 Main St, Philadelphia, PA', coords: { lat: 39.95, lng: -75.16 } }))

    expect(screen.getByRole('button', { name: '412 Main St, Philadelphia, PA' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set location' })).not.toBeInTheDocument()
  })
})

// Regression coverage for: on the mobile map, the popover opened by the
// map's own pin button (while the header is collapsed — see this
// component's own doc on `collapsed`/`mapAnchor`) sometimes painted BENEATH
// the map itself, unclickable, even after it out-ranked the map's z-50 —
// Chromium's own layer-squashing against the map's heavy internal
// compositing (Google Maps) proved unreliable to beat with a z-index alone,
// confirmed live across repeated reloads of a real deployment. Portaling to
// `document.body` sidesteps the question: being the LAST element in the DOM
// guarantees topmost paint order regardless of any ancestor's stacking
// context, the map's included.
function Collapser() {
  useCollapseHeader(true)
  return null
}

describe('LocationControl — collapsed (mobile map)', () => {
  it("portals the popover to document.body, not left as a descendant the map's own layer could still paint over", () => {
    const { container } = render(
      <HeaderCollapseProvider>
        <Collapser />
        <LocationControl controls={controls()} />
      </HeaderCollapseProvider>,
    )

    act(() => {
      document.dispatchEvent(new CustomEvent('jpc:toggle-location', { detail: {} }))
    })

    const popoverHeading = screen.getByText('Where should distances be measured from?')
    expect(container.contains(popoverHeading)).toBe(false)
    expect(document.body.contains(popoverHeading)).toBe(true)
  })

  // The outside-click-closes handler checks DOM containment (`.contains()`)
  // against the popover's own ref — which, once portaled out of this
  // component's own wrapper, is no longer found by walking that wrapper's
  // descendants. Without also checking the portaled node directly, any tap
  // inside the popover (the address field, "Share my live location") read
  // as an outside tap and closed it before the real click could land.
  it('a click inside the portaled popover does not close it', async () => {
    const user = userEvent.setup()
    render(
      <HeaderCollapseProvider>
        <Collapser />
        <LocationControl controls={controls()} />
      </HeaderCollapseProvider>,
    )

    act(() => {
      document.dispatchEvent(new CustomEvent('jpc:toggle-location', { detail: {} }))
    })

    await user.click(screen.getByPlaceholderText('Enter your address'))

    expect(screen.getByText('Where should distances be measured from?')).toBeInTheDocument()
  })
})
