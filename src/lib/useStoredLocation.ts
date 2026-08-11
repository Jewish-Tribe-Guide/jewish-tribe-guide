'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

// The visitor's location (typed address, "current location" + coordinates, or a
// listing they marked themselves at), persisted to localStorage so distance
// sorting survives reloads and return visits — it's the linchpin of the whole
// directory experience.
//
// Hydration-safe: state starts empty (matching the server-rendered markup), then
// the saved value is restored in a post-mount effect. Reading localStorage during
// render would mismatch SSR and trip React's hydration warning — same reason
// page.tsx restores history.state after mount rather than during render.
export function useStoredLocation() {
  const [location, setLocation] = useState<StoredLocation>(EMPTY)

  // Until the restore effect has run we must not write back to storage, or the
  // initial empty state would clobber a previously-saved location before we read it.
  const hydrated = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setLocation(parseStoredLocation(raw))
    } catch {
      // Corrupt/blocked storage — fall back to the empty in-memory location.
    }
    hydrated.current = true
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    try {
      if (!location.address && !location.coords) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(location))
    } catch {
      // Storage unavailable (private mode, quota) — persistence is best-effort.
    }
  }, [location])

  // Functional updates throughout: the GPS tick calls setCoords and setAddress
  // back to back (see useLiveLocation), and only this shape composes both into
  // one commit instead of the second overwriting the first.
  const setAddress = useCallback((address: string) => {
    setLocation((prev) => ({ ...prev, address, listingId: null }))
  }, [])

  const setCoords = useCallback((coords: Coords | null) => {
    setLocation((prev) => ({ ...prev, coords, listingId: null }))
  }, [])

  /** Commits address + coords + listingId together. The two setters above
   *  can't express a listing anchor between them — each clears `listingId`,
   *  and calling them in sequence would also write storage twice. */
  const setAnchor = useCallback((next: StoredLocation) => setLocation(next), [])

  return {
    address: location.address,
    coords: location.coords,
    listingId: location.listingId,
    setAddress,
    setCoords,
    setAnchor,
  }
}
