'use client'

import { useEffect, useRef, useState } from 'react'

export type Coords = { lat: number; lng: number }

type StoredLocation = { address: string; coords: Coords | null }

const STORAGE_KEY = 'jpc:location'

// The visitor's location (typed address or "current location" + coordinates),
// persisted to localStorage so distance sorting survives reloads and return
// visits — it's the linchpin of the whole directory experience.
//
// Hydration-safe: state starts empty (matching the server-rendered markup), then
// the saved value is restored in a post-mount effect. Reading localStorage during
// render would mismatch SSR and trip React's hydration warning — same reason
// page.tsx restores history.state after mount rather than during render.
export function useStoredLocation() {
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<Coords | null>(null)

  // Until the restore effect has run we must not write back to storage, or the
  // initial empty state would clobber a previously-saved location before we read it.
  const hydrated = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as StoredLocation
        if (typeof saved.address === 'string') setAddress(saved.address)
        if (saved.coords && typeof saved.coords.lat === 'number' && typeof saved.coords.lng === 'number') {
          setCoords(saved.coords)
        }
      }
    } catch {
      // Corrupt/blocked storage — fall back to the empty in-memory location.
    }
    hydrated.current = true
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    try {
      if (!address && !coords) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, JSON.stringify({ address, coords }))
    } catch {
      // Storage unavailable (private mode, quota) — persistence is best-effort.
    }
  }, [address, coords])

  return { address, coords, setAddress, setCoords }
}
