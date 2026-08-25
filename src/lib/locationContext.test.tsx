// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { LocationProvider, useLocation } from './locationContext'

// useLiveLocation itself (GPS watch, localStorage persistence) is exercised
// by its own tests — this mocks it down to the handful of fields
// directionsOrigin actually reads, so these tests can drive `tracking` and
// `address` directly instead of simulating a real geolocation watch.
const mockState = {
  address: '',
  coords: null as { lat: number; lng: number } | null,
  tracking: false,
}

vi.mock('./useLiveLocation', () => ({
  CURRENT_LOCATION_LABEL: 'Current location',
  useLiveLocation: () => ({
    address: mockState.address,
    coords: mockState.coords,
    listingId: null,
    setAddress: vi.fn(),
    setCoords: vi.fn(),
    setAnchor: vi.fn(),
    tracking: mockState.tracking,
    geoError: null,
    geoErrorSilent: false,
    resumingSilently: false,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}))

afterEach(() => {
  cleanup()
  mockState.address = ''
  mockState.coords = null
  mockState.tracking = false
})

// A live GPS tick sets `address` to the display placeholder "Current
// location" alongside the real coords (see useLiveLocation's
// CURRENT_LOCATION_LABEL) — and stopping tracking doesn't clear it, so the
// header pill can keep showing a readable label for the frozen fix instead
// of raw numbers. directionsOrigin has to recognize that placeholder and
// keep using the real coords regardless — sending Google Maps the literal
// text "Current location" doesn't just fail to geocode, Maps' own URL API
// treats that exact string as "use my device's live GPS right now," silently
// substituting wherever the visitor actually is for the spot they froze.
describe('directionsOrigin', () => {
  it('uses raw coords while live tracking is on', () => {
    mockState.tracking = true
    mockState.address = 'Current location'
    mockState.coords = { lat: 39.94, lng: -75.16 }
    const { result } = renderHook(() => useLocation(), { wrapper: LocationProvider })
    expect(result.current.directionsOrigin).toEqual({ lat: 39.94, lng: -75.16 })
  })

  it('still uses raw coords after tracking stops, not the leftover "Current location" placeholder', () => {
    mockState.tracking = false
    mockState.address = 'Current location'
    mockState.coords = { lat: 39.94, lng: -75.16 }
    const { result } = renderHook(() => useLocation(), { wrapper: LocationProvider })
    expect(result.current.directionsOrigin).toEqual({ lat: 39.94, lng: -75.16 })
  })

  it('uses the typed address once tracking is off and a real address is set', () => {
    mockState.tracking = false
    mockState.address = '123 Main St, Philadelphia, PA'
    mockState.coords = { lat: 39.94, lng: -75.16 }
    const { result } = renderHook(() => useLocation(), { wrapper: LocationProvider })
    expect(result.current.directionsOrigin).toBe('123 Main St, Philadelphia, PA')
  })

  it('falls back to coords when tracking is off and there is no address at all', () => {
    mockState.tracking = false
    mockState.address = ''
    mockState.coords = { lat: 39.94, lng: -75.16 }
    const { result } = renderHook(() => useLocation(), { wrapper: LocationProvider })
    expect(result.current.directionsOrigin).toEqual({ lat: 39.94, lng: -75.16 })
  })
})
