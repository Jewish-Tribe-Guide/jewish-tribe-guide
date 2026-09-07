// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Google only calls `gm_authFailure` for a bad/missing/referrer-rejected key —
// NOT for a project whose billing has lapsed, which instead only prints
// `console.error('...BillingNotEnabledMapError...')` and shows its own
// blocking dialog. That gap is exactly what broke the map in every
// environment once with no deploy involved, silently: mapsAuthFailed() stayed
// false, so the app's own fallback never took over. These tests are keyed on
// the console.error text Google's error-messages docs use for each error
// class, so a genuine occurrence (reproduced live via the browser console
// while diagnosing that incident) is provably caught.
describe('loadGoogleMaps — console-based failure detection', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('treats a BillingNotEnabledMapError console.error the same as gm_authFailure', async () => {
    const { loadGoogleMaps, mapsAuthFailed } = await import('./loadGoogleMaps')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Not awaited — the importLibrary poll never resolves under fake timers
    // (there's no real google.maps in jsdom), and this test only needs the
    // console.error watcher loadGoogleMaps installs synchronously on call.
    loadGoogleMaps().catch(() => {})

    expect(mapsAuthFailed()).toBe(false)

    console.error(
      'Google Maps JavaScript API error: BillingNotEnabledMapError',
      'https://developers.google.com/maps/documentation/javascript/error-messages#billing-not-enabled-map-error',
    )

    expect(mapsAuthFailed()).toBe(true)
  })

  it('leaves unrelated console.error calls alone', async () => {
    const { loadGoogleMaps, mapsAuthFailed } = await import('./loadGoogleMaps')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    loadGoogleMaps().catch(() => {})
    console.error('some unrelated error')

    expect(mapsAuthFailed()).toBe(false)
  })
})
