import { vi } from 'vitest'

// ── A controllable navigator.geolocation stand-in.
//
// jsdom has no geolocation implementation at all — not a stub gap, just
// absent — so anything that calls navigator.geolocation.watchPosition()
// (useWatchPosition, the engine behind useLiveLocation) throws without this.
// Installed once, globally, in vitest.setup.ts (same treatment as the
// localStorage/matchMedia polyfills there) so every jsdom test gets a safe
// default; import emitPosition/emitError here to drive a specific test's
// success/error path. ──

type SuccessCb = (pos: GeolocationPosition) => void
type ErrorCb = (err: GeolocationPositionError) => void

let successCb: SuccessCb | null = null
let errorCb: ErrorCb | null = null
let nextWatchId = 1

export const mockGeolocation = {
  watchPosition: vi.fn((success: SuccessCb, error?: ErrorCb) => {
    successCb = success
    errorCb = error ?? null
    return nextWatchId++
  }),
  clearWatch: vi.fn(),
  getCurrentPosition: vi.fn(),
}

export function installMockGeolocation(): void {
  if (typeof navigator === 'undefined') return
  Object.defineProperty(navigator, 'geolocation', {
    value: mockGeolocation,
    configurable: true,
    writable: true,
  })
}

/** Call in afterEach — clears both the call history and whichever
 *  success/error callback the component under test last subscribed with. */
export function resetMockGeolocation(): void {
  successCb = null
  errorCb = null
  mockGeolocation.watchPosition.mockClear()
  mockGeolocation.clearWatch.mockClear()
  mockGeolocation.getCurrentPosition.mockClear()
}

/** Fires the most recent watchPosition() call's success callback, as if a
 *  GPS fix just came in. */
export function emitPosition(coords: { lat: number; lng: number; accuracy?: number }): void {
  successCb?.({
    coords: {
      latitude: coords.lat,
      longitude: coords.lng,
      accuracy: coords.accuracy ?? 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  } as GeolocationPosition)
}

/** Fires the most recent watchPosition() call's error callback. `code`
 *  matches the real GeolocationPositionError constants (1 = PERMISSION_DENIED,
 *  2 = POSITION_UNAVAILABLE, 3 = TIMEOUT) — useWatchPosition branches on it. */
export function emitError(code: 1 | 2 | 3, message = 'geolocation error'): void {
  errorCb?.({
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError)
}
