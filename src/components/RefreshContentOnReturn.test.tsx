// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import RefreshContentOnReturn, { MIN_REFRESH_INTERVAL_MS } from './RefreshContentOnReturn'
import { mockRouter, resetMockRouter } from '@/test/nextNavigationMock'

vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }))

// The end-to-end proof that a refresh actually reaches the layout's content
// lives in e2e-cache/cache-roundtrip.spec.ts, against a real production build
// — that one costs a build and ~15s, so it covers the round trip once, via
// focus. This covers the wiring around it, where the cheap mistakes are: a
// trigger that was never registered, one that fires when it shouldn't, the
// throttle, and cleanup. Those are all one-line risks that a second copy of
// the e2e test would be a slow way to catch.

/** jsdom reports document.hidden from visibilityState, which isn't settable
 *  directly — this is the standard way to drive it. */
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

/** Moves the clock past the throttle window, so the next trigger is due.
 *  The component reads Date.now() rather than a timer, so advancing fake
 *  timers alone wouldn't do it. */
function letThrottleExpire() {
  vi.setSystemTime(Date.now() + MIN_REFRESH_INTERVAL_MS + 1)
}

/** What /api/content-version answers: the server's current fingerprint. */
let serverVersion = 'v1'
const fetchMock = vi.fn(async (_url: string) => Response.json({ ok: true, version: serverVersion }))

/** Lets the ask and its answer land: the component awaits both. */
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

const ON_SCREEN = 'v1'
const show = () => render(<RefreshContentOnReturn community="philly" version={ON_SCREEN} />)

beforeEach(() => {
  vi.useFakeTimers()
  resetMockRouter()
  setHidden(false)
  serverVersion = 'v2'
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RefreshContentOnReturn', () => {
  it('asks whether the content changed when the window regains focus, and refreshes when it did', async () => {
    show()
    letThrottleExpire()

    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(fetchMock).toHaveBeenCalledWith('/api/content-version?community=philly', { cache: 'no-store' })
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
  })

  it('leaves the page alone when nothing changed, so a tap never waits on a refresh', async () => {
    serverVersion = ON_SCREEN
    show()
    letThrottleExpire()

    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockRouter.refresh).not.toHaveBeenCalled()
  })

  it('leaves the page alone when there is no answer', async () => {
    show()
    letThrottleExpire()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    window.dispatchEvent(new Event('focus'))
    await settle()

    letThrottleExpire()
    fetchMock.mockResolvedValueOnce(Response.json({ ok: false }, { status: 502 }))
    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mockRouter.refresh).not.toHaveBeenCalled()
  })

  it('compares with what a refresh brought down, not what the tab first loaded', async () => {
    const { rerender } = show()
    letThrottleExpire()
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1)

    // The refresh re-rendered the layout with the new fingerprint.
    rerender(<RefreshContentOnReturn community="philly" version="v2" />)
    letThrottleExpire()
    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
  })

  it('asks when the tab becomes visible again', async () => {
    show()
    letThrottleExpire()

    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
  })

  it('asks when the network comes back', async () => {
    show()
    letThrottleExpire()

    window.dispatchEvent(new Event('online'))
    await settle()

    expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not ask when the tab is being hidden', async () => {
    show()
    letThrottleExpire()

    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    // Nobody is looking at a hidden tab, so a request here renders for no one.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockRouter.refresh).not.toHaveBeenCalled()
  })

  it('does not ask immediately after mount', async () => {
    show()

    // The content arrived with this render. A focus event landing straight
    // away — which desktop browsers do fire — must not spend a request
    // re-checking what just came.
    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('collapses a burst of triggers into one ask', async () => {
    show()
    letThrottleExpire()

    // Alt-tabbing between two windows, or a mobile connection flapping.
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(1)

    // ...and asks again once the window has genuinely passed.
    letThrottleExpire()
    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops listening once unmounted', async () => {
    const { unmount } = show()
    letThrottleExpire()

    unmount()
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
