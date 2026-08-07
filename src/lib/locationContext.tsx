'use client'

import { createContext, useContext, useMemo } from 'react'
import type { DirectoryAnchor } from '@/types'
import type { LocationControls } from '@/components/home/LocationControl'
import { useLiveLocation } from './useLiveLocation'

// ─────────────────────────────────────────────────────────────────────────────
// The visitor's location, shared by every screen.
//
// This lived in src/app/page.tsx, which was the whole site — one component that
// never unmounted, so a single useLiveLocation() call there was reachable from
// everywhere by prop drilling.
//
// With real routes each screen is its own page that mounts and unmounts, so the
// GPS watch has to live above them or it would restart on every navigation
// (re-prompting, dropping the fix, and resetting distance sorting mid-browse).
// It lives in the community layout instead: layouts persist across navigations
// between their child routes, which is exactly the lifetime this needs.
// ─────────────────────────────────────────────────────────────────────────────

export type LiveTracking = {
  tracking: boolean
  error: string | null
  start: () => void
  stop: () => void
}

type LocationContextValue = {
  /** Controls for the header pill — address entry plus the tracking toggle. */
  controls: LocationControls
  /** What the directories sort by. */
  anchor: DirectoryAnchor
  coords: { lat: number; lng: number } | null
  liveTracking: LiveTracking
}

const LocationContext = createContext<LocationContextValue | null>(null)

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { address, coords, setAddress, setCoords, tracking, geoError, start, stop } =
    useLiveLocation()

  const value = useMemo<LocationContextValue>(
    () => ({
      controls: {
        address,
        onAddressChange: setAddress,
        onCoords: setCoords,
        tracking,
        geoError,
        onStartTracking: start,
        onStopTracking: stop,
      },
      anchor: { coords, label: address },
      coords,
      liveTracking: { tracking, error: geoError, start, stop },
    }),
    // setAddress/setCoords are stable setState setters; start/stop are stable
    // closures over the same watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, coords, tracking, geoError],
  )

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext)
  if (!ctx) throw new Error('useLocation must be used inside a LocationProvider')
  return ctx
}
