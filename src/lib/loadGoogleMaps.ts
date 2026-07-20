// Shared loader for the Google Maps JavaScript API.
//
// The script must load exactly once for the whole app — both the address
// autocomplete (`places`) and the resource map (`maps` + `marker`) depend on
// it. Loading it twice throws "You have included the Google Maps JavaScript
// API multiple times". This module owns the single <script> injection and
// resolves only when the modern `importLibrary` loader is actually available;
// callers then `await google.maps.importLibrary(...)` for the pieces they need.

export const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

// Set to true if Google rejects the key (invalid key, API/billing not enabled,
// referrer not allowed). Callers read this to degrade gracefully instead of
// leaving a broken Google widget on the page.
let authFailed = false
const authFailedListeners = new Set<() => void>()

export function mapsAuthFailed(): boolean {
  return authFailed
}

/** Subscribe to the one-way "Google rejected the key" signal. Returns an
 *  unsubscribe fn. Fires at most once, app-wide. */
export function onMapsAuthFailure(listener: () => void): () => void {
  authFailedListeners.add(listener)
  return () => authFailedListeners.delete(listener)
}

/** Report that Google rejected the key (e.g. a widget's `gmp-error` event).
 *  Idempotent; notifies every subscriber so the whole app can degrade. */
export function reportMapsAuthFailure() {
  if (authFailed) return
  authFailed = true
  authFailedListeners.forEach((l) => l())
}

declare global {
  interface Window {
    gm_authFailure?: () => void
  }
}

// Load the Maps JS API once per window, then resolve only when
// `importLibrary` is available. With `loading=async`, that function is
// attached shortly *after* the script's load event fires, so resolving on
// `onload` alone would call importLibrary too early — hence the poll.
//
// Keyed per-window (not just once globally) because a custom element like
// PlaceAutocompleteElement only renders in the document/window that defined
// it — the admin category preview portals its Add/Edit form into a separate
// <iframe> document (see DevicePreviewFrame.tsx), so AddressInput loads a
// second, independent copy of the script into that iframe's own window
// rather than reusing the main page's `google` global.
const scriptPromises = new WeakMap<Window, Promise<void>>()

// `google` is a bare ambient global (from @types/google.maps), not a property
// declared on the `Window` interface — so a `Window`-typed variable other than
// the literal `window` needs a cast to read it off.
function windowGoogle(win: Window): typeof google | undefined {
  return (win as Partial<Window & { google: typeof google }>).google
}

export function loadGoogleMaps(targetWindow?: Window): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const win = targetWindow ?? window

  const existing = scriptPromises.get(win)
  if (existing) return existing

  const promise = new Promise<void>((resolve, reject) => {
    // Google calls this global on auth failure (bad key, no billing, etc.) —
    // shared across every window, since a rejected key is rejected everywhere.
    win.gm_authFailure = reportMapsAuthFailure

    if (!win.document.getElementById('google-maps-script') && !windowGoogle(win)?.maps) {
      const script = win.document.createElement('script')
      script.id = 'google-maps-script'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places&loading=async`
      script.async = true
      script.onerror = () => reject(new Error('Failed to load Google Maps script'))
      win.document.head.appendChild(script)
    }

    // Poll for the modern loader to become ready (up to ~10s).
    let tries = 0
    const check = () => {
      if (typeof windowGoogle(win)?.maps?.importLibrary === 'function') {
        resolve()
      } else if (++tries > 200) {
        reject(new Error('Google Maps importLibrary did not become available'))
      } else {
        setTimeout(check, 50)
      }
    }
    check()
  })
  scriptPromises.set(win, promise)
  return promise
}
