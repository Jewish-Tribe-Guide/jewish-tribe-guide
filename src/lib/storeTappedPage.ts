// A page reached by a tap arrives as data for the router, never as the page
// itself, so the service worker never saw it and it wasn't there with no
// signal: only pages loaded whole were (review item 36, Nov 18). This asks the
// worker to fetch and keep it (public/sw.js, 'STORE_PAGE'), a few seconds
// after the tap so it never competes with the page the visitor is opening.
// The worker skips a page it saved recently, and skips them all with Data
// Saver on.

export const STORE_TAPPED_PAGE_AFTER_MS = 3000

export function storeTappedPage(href: string): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  const url = new URL(href, window.location.href)
  if (url.origin !== window.location.origin) return
  setTimeout(() => {
    navigator.serviceWorker.controller?.postMessage({ type: 'STORE_PAGE', path: url.pathname })
  }, STORE_TAPPED_PAGE_AFTER_MS)
}
