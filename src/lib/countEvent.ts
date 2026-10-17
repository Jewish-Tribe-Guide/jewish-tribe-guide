'use client'

// Counts a listing view or an empty search (see /api/counts). Fire and
// forget: sendBeacon hands the request to the browser, so it survives the
// page navigating away and never holds anything up.
//
// Two places never count:
//   - An automated browser (navigator.webdriver: Playwright, the e2e suites).
//     AGENTS.md: nothing in e2e/ may write to the database, and opening a
//     listing is exactly what those tests do all day.
//   - The admin console, where previewing a listing isn't someone reading it.

export type CountKind = 'listing_view' | 'search_miss'

export function shouldCount(nav: { webdriver?: boolean } | undefined, pathname: string): boolean {
  if (!nav || nav.webdriver) return false
  return !/(^|\/)admin(\/|$)/.test(pathname)
}

export function countEvent(community: string, kind: CountKind, key: string): void {
  try {
    if (typeof window === 'undefined' || !shouldCount(navigator, window.location.pathname)) return
    const body = JSON.stringify({ community, kind, key })
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/counts', new Blob([body], { type: 'application/json' }))) {
      return
    }
    void fetch('/api/counts', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {})
  } catch {
    // A count is never worth an error.
  }
}
