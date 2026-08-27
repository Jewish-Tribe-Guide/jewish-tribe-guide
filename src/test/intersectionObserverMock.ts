// ── A controllable window.IntersectionObserver stand-in.
//
// jsdom has no IntersectionObserver implementation at all — not a stub gap,
// just absent — so anything that calls `new IntersectionObserver(...)`
// (useInView, the engine behind Landing's deferred map band) throws without
// this. Installed once, globally, in vitest.setup.ts (same treatment as the
// localStorage/matchMedia/geolocation polyfills there) so every jsdom test
// gets a safe default of "nothing has intersected yet"; import
// triggerAllIntersections here to drive a specific test's "now it's
// visible" path. ──

type Observed = { target: Element; callback: IntersectionObserverCallback }

let observed: Observed[] = []

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  // Required by the DOM lib TypeScript 6+ ships (absent from TS5's) — same
  // unused-in-practice default as rootMargin above, not a real behavior.
  readonly scrollMargin = ''
  readonly thresholds: ReadonlyArray<number> = []
  private callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(target: Element): void {
    observed.push({ target, callback: this.callback })
  }
  unobserve(target: Element): void {
    observed = observed.filter((o) => o.target !== target)
  }
  disconnect(): void {
    observed = observed.filter((o) => o.callback !== this.callback)
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

export function installMockIntersectionObserver(): void {
  if (typeof window === 'undefined') return
  window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver
}

/** Clears every currently-observed element — call in afterEach. */
export function resetMockIntersectionObserver(): void {
  observed = []
}

/** Fires every currently-observed callback as if its element just scrolled
 *  into view. Wrap in `act(...)` (or call after a `user-event` interaction,
 *  which already wraps its own work in `act`) so React processes the
 *  resulting state update before your next assertion. */
export function triggerAllIntersections(): void {
  for (const { target, callback } of observed) {
    callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      new MockIntersectionObserver(() => {}),
    )
  }
}
