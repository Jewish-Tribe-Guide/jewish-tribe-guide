// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// This module reads performance.getEntriesByType('navigation') and patches
// window.history.pushState as a TOP-LEVEL side effect on import — so each
// test needs a fresh module instance (vi.resetModules + a dynamic import)
// to see its own mocked starting conditions, rather than sharing whatever
// the first import happened to see.
async function freshModule() {
  vi.resetModules()
  return import('./backForwardNavigation')
}

function stubNavigationType(type: string) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type } as PerformanceNavigationTiming])
}

describe('backForwardNavigation', () => {
  beforeEach(() => {
    stubNavigationType('navigate')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports true when the document itself loaded via back/forward (a hard reload, not an SPA transition)', async () => {
    stubNavigationType('back_forward')
    const { didArriveViaBackForward } = await freshModule()
    expect(didArriveViaBackForward()).toBe(true)
  })

  it('reports false for an ordinary navigation load', async () => {
    stubNavigationType('navigate')
    const { didArriveViaBackForward } = await freshModule()
    expect(didArriveViaBackForward()).toBe(false)
  })

  // The other mechanism this covers — see the module's own doc — a
  // same-document SPA transition, which the browser signals with `popstate`
  // rather than a fresh navigation-timing entry.
  it('reports true after a popstate event (a same-document back/forward transition)', async () => {
    const { didArriveViaBackForward } = await freshModule()
    expect(didArriveViaBackForward()).toBe(false)

    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(didArriveViaBackForward()).toBe(true)
  })

  // The actual bug this module exists to avoid repeating: a fixed timeout
  // was tried first and confirmed live to be unreliable (GenericDirectory's
  // own mount can take anywhere from under 100ms to several seconds
  // depending on how long its category/community data takes to load) — see
  // the module's own doc. pushState is what every subsequent real
  // navigation in this app goes through, so it's the one boundary that
  // doesn't depend on how long anything took.
  it('clears back/forward status on the next pushState — a real navigation — regardless of how much time has passed', async () => {
    vi.useFakeTimers()
    stubNavigationType('back_forward')
    const { didArriveViaBackForward } = await freshModule()
    expect(didArriveViaBackForward()).toBe(true)

    // A generous amount of time passing on its own must NOT clear it — that
    // was the exact failure mode of the timeout-based version this replaced.
    vi.advanceTimersByTime(5000)
    expect(didArriveViaBackForward()).toBe(true)

    window.history.pushState(null, '', '/somewhere-else')
    expect(didArriveViaBackForward()).toBe(false)
    vi.useRealTimers()
  })

  it('does not clear back/forward status on a replaceState call (only pushState)', async () => {
    stubNavigationType('back_forward')
    const { didArriveViaBackForward } = await freshModule()
    expect(didArriveViaBackForward()).toBe(true)

    window.history.replaceState(null, '', '/still-here')
    expect(didArriveViaBackForward()).toBe(true)
  })
})
