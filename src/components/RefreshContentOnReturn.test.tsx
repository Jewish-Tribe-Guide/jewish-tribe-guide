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

beforeEach(() => {
  vi.useFakeTimers()
  resetMockRouter()
  setHidden(false)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('RefreshContentOnReturn', () => {
  it('refreshes when the window regains focus', () => {
    render(<RefreshContentOnReturn />)
    letThrottleExpire()

    window.dispatchEvent(new Event('focus'))

    expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes when the tab becomes visible again', () => {
    render(<RefreshContentOnReturn />)
    letThrottleExpire()

    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes when the network comes back', () => {
    render(<RefreshContentOnReturn />)
    letThrottleExpire()

    window.dispatchEvent(new Event('online'))

    expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when the tab is being hidden', () => {
    render(<RefreshContentOnReturn />)
    letThrottleExpire()

    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))

    // Nobody is looking at a hidden tab, so a request here renders for no one.
    expect(mockRouter.refresh).not.toHaveBeenCalled()
  })

  it('does not refresh immediately after mount', () => {
    render(<RefreshContentOnReturn />)

    // The content arrived with this render. A focus event landing straight
    // away — which desktop browsers do fire — must not spend a request
    // re-fetching what just came.
    window.dispatchEvent(new Event('focus'))

    expect(mockRouter.refresh).not.toHaveBeenCalled()
  })

  it('collapses a burst of triggers into one refresh', () => {
    render(<RefreshContentOnReturn />)
    letThrottleExpire()

    // Alt-tabbing between two windows, or a mobile connection flapping.
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))

    expect(mockRouter.refresh).toHaveBeenCalledTimes(1)

    // ...and refreshes again once the window has genuinely passed.
    letThrottleExpire()
    window.dispatchEvent(new Event('focus'))

    expect(mockRouter.refresh).toHaveBeenCalledTimes(2)
  })

  it('stops listening once unmounted', () => {
    const { unmount } = render(<RefreshContentOnReturn />)
    letThrottleExpire()

    unmount()
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockRouter.refresh).not.toHaveBeenCalled()
  })
})
