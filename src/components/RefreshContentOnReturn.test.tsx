// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import RefreshContentOnReturn, { MIN_REFRESH_INTERVAL_MS, QUIET_MS, REFRESHES_PER_VERSION } from './RefreshContentOnReturn'
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

/** Lets the ask and its answer land (the component awaits both), then the
 *  quiet wait before a refresh pass, with nobody tapping. */
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  vi.advanceTimersByTime(QUIET_MS)
}

/** The ask and its answer only, with the quiet wait still to run. */
async function answered() {
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

  // Nov 18: the Minyan view's `?davening=1` and its `step`, written behind
  // Next's router, were wiped by the refresh's commit, which writes the
  // router's address and none of the page's own keys.
  describe('what the page wrote into the address', () => {
    /** What Next's commit does as the refresh lands: its own address and
     *  state, nothing of the page's. */
    function refreshWrites(routerAddress: string) {
      mockRouter.refresh.mockImplementationOnce(() => {
        window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'fresh' }, '', routerAddress)
      })
    }
    async function comeBack() {
      show()
      letThrottleExpire()
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
        await settle()
      })
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
    }
    const address = () => window.location.pathname + window.location.search

    it('is put back once the refresh lands, with its keys', async () => {
      window.history.replaceState({ __NA: true, step: 'minyanim' }, '', '/philly/synagogue?davening=1')
      refreshWrites('/philly/synagogue')
      await comeBack()
      expect(address()).toBe('/philly/synagogue?davening=1')
      expect(window.history.state).toEqual({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'fresh', step: 'minyanim' })
    })

    // A write without `__NA` tells Next's router, and on the real site that
    // replayed the page's older cached copy over the fresh one, so a renamed
    // category never arrived (e2e-cache, "regains focus").
    it('is never told to the router around a refresh', async () => {
      window.history.replaceState({ __NA: true, step: 'minyanim' }, '', '/philly/synagogue?davening=1')
      refreshWrites('/philly/synagogue')
      const replace = vi.spyOn(window.history, 'replaceState')
      try {
        await comeBack()
        expect(replace).toHaveBeenCalled()
        for (const [state] of replace.mock.calls) expect(state).toMatchObject({ __NA: true })
      } finally {
        replace.mockRestore()
      }
    })

    it('gives way to another page the visitor went to meanwhile', async () => {
      window.history.replaceState({ __NA: true, step: 'minyanim' }, '', '/philly/synagogue?davening=1')
      refreshWrites('/philly/food')
      await comeBack()
      expect(address()).toBe('/philly/food')
      expect(window.history.state).toEqual({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'fresh' })
    })
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

  // Nov 16: a page cached before a change, refreshed, came back with the
  // same old version, so every return refreshed it and held the next tap.
  it('refreshes a page still behind at most twice for the same change, not on every return', async () => {
    show()
    for (let i = 0; i < 5; i++) {
      letThrottleExpire()
      window.dispatchEvent(new Event('focus'))
      await settle()
    }
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(mockRouter.refresh).toHaveBeenCalledTimes(REFRESHES_PER_VERSION)

    // A newer change gets its own tries.
    serverVersion = 'v3'
    letThrottleExpire()
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(mockRouter.refresh).toHaveBeenCalledTimes(REFRESHES_PER_VERSION + 1)
  })

  // The tap someone came back to make is never the one held behind it.
  it('waits for the visitor to be still before refreshing', async () => {
    show()
    letThrottleExpire()
    window.dispatchEvent(new Event('focus'))
    await answered()
    expect(mockRouter.refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(QUIET_MS - 100)
    window.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(QUIET_MS - 100)
    expect(mockRouter.refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
  })

  it('drops a waiting refresh once unmounted', async () => {
    const { unmount } = show()
    letThrottleExpire()
    window.dispatchEvent(new Event('focus'))
    await answered()
    unmount()
    vi.advanceTimersByTime(QUIET_MS * 2)
    expect(mockRouter.refresh).not.toHaveBeenCalled()
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
