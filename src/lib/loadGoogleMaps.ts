// Shared loader for the Google Maps JavaScript API.
//
// The script must load exactly once for the whole app — both the address
// autocomplete (`places`) and the resource map (`maps` + `marker`) depend on
// it. Loading it twice throws "You have included the Google Maps JavaScript
// API multiple times". This module owns the single <script> injection and
// resolves only when the modern `importLibrary` loader is actually available;
// callers then `await google.maps.importLibrary(...)` for the pieces they need.

export const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

// A Cloud-console Map ID. Two things depend on it:
//
//   1. AdvancedMarkerElement — every pin on the resource map — formally
//      requires one.
//   2. Basemap styling. With a Map ID set, the `styles` option is ignored and
//      the style is whatever is attached to that ID in the Cloud console. So
//      this is the only route to a desaturated basemap; there is no code-level
//      alternative while advanced markers are in use.
//
// The fallback is the literal string this shipped with for a long time, and it
// is NOT a real Map ID — Google's own mapConfigs response for it reads "Map ID
// not found. Map capabilities are currently enabled but this behavior may
// change in a future release." In other words the markers currently work on
// Google's forbearance rather than by right. Kept as the fallback anyway so
// nothing changes for a deployment that hasn't set the variable yet; the fix
// is to create a real Map ID (Cloud console → Map Management, vector,
// JavaScript) and set NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID to the value it
// generates. Once that's set, styling the map is a console-only change with
// no deploy.
export const MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'resource_map'

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

// Load the Maps JS API once, then resolve only when `importLibrary` is
// available. With `loading=async`, that function is attached shortly *after*
// the script's load event fires, so resolving on `onload` alone would call
// importLibrary too early — hence the poll.
let scriptPromise: Promise<void> | null = null

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    // Google calls this global on auth failure (bad key, no billing, etc.).
    window.gm_authFailure = reportMapsAuthFailure

    if (!document.getElementById('google-maps-script') && !window.google?.maps) {
      const script = document.createElement('script')
      script.id = 'google-maps-script'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places&loading=async`
      script.async = true
      script.onerror = () => reject(new Error('Failed to load Google Maps script'))
      document.head.appendChild(script)
    }

    // Poll for the modern loader to become ready (up to ~10s).
    let tries = 0
    const check = () => {
      if (typeof window.google?.maps?.importLibrary === 'function') {
        resolve()
      } else if (++tries > 200) {
        reject(new Error('Google Maps importLibrary did not become available'))
      } else {
        setTimeout(check, 50)
      }
    }
    check()
  })
  return scriptPromise
}
