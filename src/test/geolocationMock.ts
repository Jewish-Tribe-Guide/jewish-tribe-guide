import { vi } from 'vitest'

// ── A controllable navigator.geolocation stand-in.
//
// jsdom has no geolocation implementation at all — not a stub gap, just
// absent — so anything that calls navigator.geolocation.watchPosition()
// (useWatchPosition, the engine behind useLiveLocation) throws without this.
// Installed once, globally, in vitest.setup.ts (same treatment as the
// localStorage/matchMedia polyfills there) so every jsdom test gets a safe
// default; import emitPosition here to drive a specific test's success path.
// ──

type SuccessCb = (pos: GeolocationPosition) => void

let successCb: SuccessCb | null = null
let nextWatchId = 1

export const mockGeolocation = {
  // Real watchPosition() also takes an error callback; not captured here —
  // nothing in this mock currently drives it (a caller that registers one
  // just never has it called, the same as a real GPS fix that never fails).
  watchPosition: vi.fn((success: SuccessCb) => {
    successCb = success
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

/** Call in afterEach — clears both the call history and whichever success
 *  callback the component under test last subscribed with. */
export function resetMockGeolocation(): void {
  successCb = null
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
