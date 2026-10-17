// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { emitError, emitPosition, mockGeolocation, resetMockGeolocation } from '@/test/geolocationMock'
import { useWatchPosition } from './useWatchPosition'

// Direct coverage for the GPS-watch wrapper behind useLiveLocation — in
// particular its error branch (a real GeolocationPositionError -> the
// geoError state LocationControl's popover shows), which had ZERO test
// coverage of any kind before this file: LocationControl.test.tsx and
// friends only ever passed a static geoError PROP, never drove the real
// navigator.geolocation error callback this hook actually registers. The
// mock's own emitError() was written for exactly this, sat unused, got
// removed as dead code, and came back the same day once this file needed
// it — see geolocationMock.ts's own note on the story. Flagged via
// mcp__ccd_session__spawn_task as task_6a8b5ebd during that cleanup.

afterEach(() => {
  resetMockGeolocation()
})

describe('useWatchPosition — success path', () => {
  it('starts untracked, with no position or error', () => {
    const { result } = renderHook(() => useWatchPosition())
    expect(result.current.tracking).toBe(false)
    expect(result.current.position).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('start() subscribes and flips tracking on', () => {
    const { result } = renderHook(() => useWatchPosition())
    act(() => result.current.start())
    expect(result.current.tracking).toBe(true)
    expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(1)
  })

  it('a position fix updates position and clears any prior error', () => {
    const { result } = renderHook(() => useWatchPosition())
    act(() => result.current.start())
    act(() => emitError(2))
    expect(result.current.error).not.toBeNull()

    act(() => emitPosition({ lat: 40.05, lng: -75.16, accuracy: 12 }))
    expect(result.current.position).toEqual({ lat: 40.05, lng: -75.16, accuracy: 12 })
    expect(result.current.error).toBeNull()
    expect(result.current.errorSilent).toBe(false)
  })

  it('stop() clears the watch and flips tracking off', () => {
    const { result } = renderHook(() => useWatchPosition())
    act(() => result.current.start())
    act(() => result.current.stop())
    expect(result.current.tracking).toBe(false)
    expect(mockGeolocation.clearWatch).toHaveBeenCalledTimes(1)
  })
})

describe('useWatchPosition — error path', () => {
  it('PERMISSION_DENIED (1) surfaces the "blocked" message and stops tracking', () => {
    const { result } = renderHook(() => useWatchPosition())
    act(() => result.current.start())
    act(() => emitError(1))
    expect(result.current.error).toBe('Location permission is blocked. Enable it in your browser settings and try again.')
    expect(result.current.tracking).toBe(false)
  })

  it('POSITION_UNAVAILABLE (2) surfaces the "step outside" message', () => {
    const { result } = renderHook(() => useWatchPosition())
    act(() => result.current.start())
    act(() => emitError(2))
    expect(result.current.error).toBe('Location unavailable. Step outside or try again in a moment.')
  })

  it('TIMEOUT (3) surfaces the generic "try again" message', () => {
    const { result } = renderHook(() => useWatchPosition())
    act(() => result.current.start())
    act(() => emitError(3))
    expect(result.current.error).toBe('Could not get your location. Try again.')
  })

  it('a visitor-triggered start() (no silent flag) surfaces errorSilent=false', () => {
    const { result } = renderHook(() => useWatchPosition())
    act(() => result.current.start())
    act(() => emitError(1))
    expect(result.current.errorSilent).toBe(false)
  })

  it('a silent start() (mount-time auto-resume) surfaces errorSilent=true, with the same message', () => {
    const { result } = renderHook(() => useWatchPosition())
    act(() => result.current.start({ silent: true }))
    act(() => emitError(1))
    expect(result.current.errorSilent).toBe(true)
    expect(result.current.error).toBe('Location permission is blocked. Enable it in your browser settings and try again.')
  })

  it('a failed watch can be restarted — start() again resubscribes', () => {
    const { result } = renderHook(() => useWatchPosition())
    act(() => result.current.start())
    act(() => emitError(1))
    expect(result.current.tracking).toBe(false)

    act(() => result.current.start())
    expect(result.current.tracking).toBe(true)
    expect(result.current.error).toBeNull()
    expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(2)
  })
})

describe('useWatchPosition — no geolocation API at all', () => {
  it('surfaces a device-level message and never calls watchPosition', () => {
    const original = navigator.geolocation
    // @ts-expect-error — simulating a browser with no Geolocation API.
    delete navigator.geolocation
    try {
      const { result } = renderHook(() => useWatchPosition())
      act(() => result.current.start())
      expect(result.current.error).toBe('Location is not available on this device.')
      expect(result.current.tracking).toBe(false)
    } finally {
      Object.defineProperty(navigator, 'geolocation', { value: original, configurable: true, writable: true })
    }
  })

  it('respects the silent flag even on the device-unavailable path', () => {
    const original = navigator.geolocation
    // @ts-expect-error — simulating a browser with no Geolocation API.
    delete navigator.geolocation
    try {
      const { result } = renderHook(() => useWatchPosition())
      act(() => result.current.start({ silent: true }))
      expect(result.current.errorSilent).toBe(true)
    } finally {
      Object.defineProperty(navigator, 'geolocation', { value: original, configurable: true, writable: true })
    }
  })
})
