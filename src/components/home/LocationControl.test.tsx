// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HeaderCollapseProvider } from '@/lib/headerVisibility'
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
