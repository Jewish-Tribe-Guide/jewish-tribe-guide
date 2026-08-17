'use client'

import { useCallback } from 'react'
import { usePersistedState } from './usePersistedState'

export type Coords = { lat: number; lng: number }

export type StoredLocation = {
  address: string
  coords: Coords | null
  /** The listing this anchor came from, when the visitor set it by tapping
   *  "I'm here" on one (see SetLocationButton) rather than typing an address
   *  or sharing GPS. Only used to show that one listing as the active one —
   *  distance math reads `coords` either way. Null for every other source,
   *  which is why both setters below clear it: typing a new address or
   *  taking a GPS fix means the anchor is no longer that listing. */
  listingId: string | null
}

const STORAGE_KEY = 'jpc:location'

const EMPTY: StoredLocation = { address: '', coords: null, listingId: null }

/** Parses a raw localStorage string into a valid location — pulled out of the
 *  hook so the malformed-input handling (a hand-edited value, a shape from a
 *  older deploy, plain garbage) is unit-testable without a DOM. Same pattern
 *  as parsePinned (lib/pinned.ts) and parseDroppedPins (lib/droppedPins.ts). */
export function parseStoredLocation(raw: string | null): StoredLocation {
  try {
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return EMPTY
    const saved = parsed as Partial<StoredLocation>
    const c = saved.coords
    return {
      address: typeof saved.address === 'string' ? saved.address : '',
      // Both halves must be numbers — a half-written coord is worse than none,
      // since every distance downstream would silently come out NaN.
      coords:
        c && typeof c.lat === 'number' && typeof c.lng === 'number' ? { lat: c.lat, lng: c.lng } : null,
      // Absent on anything saved before listing anchors existed.
      listingId: typeof saved.listingId === 'string' ? saved.listingId : null,
    }
  } catch {
    return EMPTY
  }
}

// Module-level (not defined inside the hook) so usePersistedState sees a
// referentially stable function across renders, same as loadPinned/savePinned
// and loadDroppedPins/saveDroppedPins.
function loadStoredLocation(): StoredLocation {
  try {
    return parseStoredLocation(localStorage.getItem(STORAGE_KEY))
  } catch {
    // Corrupt/blocked storage — fall back to the empty in-memory location.
    return EMPTY
  }
}

function saveStoredLocation(location: StoredLocation): void {
  try {
    if (!location.address && !location.coords) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(location))
  } catch {
    // Storage unavailable (private mode, quota) — persistence is best-effort.
  }
}

// The visitor's location (typed address, "current location" + coordinates, or a
// listing they marked themselves at), persisted to localStorage so distance
// sorting survives reloads and return visits — it's the linchpin of the whole
// directory experience.
//
// Hydration-safe: state starts empty (matching the server-rendered markup), then
// the saved value is restored in a post-mount effect. Reading localStorage during
// render would mismatch SSR and trip React's hydration warning — same reason
// page.tsx restores history.state after mount rather than during render.
//
// Not a useSyncExternalStore candidate: `location` gets mutated locally via
// setAddress/setCoords/setAnchor and written back, not purely read from an
// external source — modeling that as an external store would mean moving all
// of that mutation logic outside React, a real redesign, not a lint fix.
export function useStoredLocation() {
  const [location, setLocation] = usePersistedState<StoredLocation>(EMPTY, loadStoredLocation, saveStoredLocation)

  // Functional updates throughout: the GPS tick calls setCoords and setAddress
  // back to back (see useLiveLocation), and only this shape composes both into
  // one commit instead of the second overwriting the first. `setLocation` is
  // stable (usePersistedState's underlying useState setter) but that
  // stability isn't visible to eslint across the custom hook boundary, hence
  // the explicit dependency below.
  const setAddress = useCallback((address: string) => {
    setLocation((prev) => ({ ...prev, address, listingId: null }))
  }, [setLocation])

  const setCoords = useCallback((coords: Coords | null) => {
    setLocation((prev) => ({ ...prev, coords, listingId: null }))
  }, [setLocation])

  /** Commits address + coords + listingId together. The two setters above
   *  can't express a listing anchor between them — each clears `listingId`,
   *  and calling them in sequence would also write storage twice. */
  const setAnchor = useCallback((next: StoredLocation) => setLocation(next), [setLocation])

  return {
    address: location.address,
    coords: location.coords,
    listingId: location.listingId,
    setAddress,
    setCoords,
    setAnchor,
  }
}
