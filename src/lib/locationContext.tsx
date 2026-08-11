'use client'

import { createContext, useContext, useMemo, useRef } from 'react'
import type { DirectoryAnchor } from '@/types'
import type { LocationControls } from '@/components/home/LocationControl'
import type { Coords, StoredLocation } from './useStoredLocation'
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
  /** The listing the anchor currently points at, if the visitor set it by
   *  tapping "I'm here" on one. Null for a typed address or a GPS fix.
   *
   *  Deliberately here on the context value rather than inside `controls`:
   *  LocationControls is a hand-built object in CategoryPreview.tsx (the
   *  admin's category preview keeps its own session-only address/coords), so
   *  a new required field there would break that call site for no benefit. */
  anchorListingId: string | null
  /** Anchors distances to a listing — stops GPS first, since tracking would
   *  otherwise overwrite this within a tick (see useLiveLocation). */
  setListingAnchor: (listing: { id: string; name: string; coords: Coords }) => void
  /** Undoes setListingAnchor: puts back whatever address the listing
   *  displaced, or clears if there was nothing. This is what tapping the
   *  listing's own button a second time does — checking distances from a
   *  hotel shouldn't cost you the address you'd already typed. */
  unsetListingAnchor: () => void
  /** Drops the anchor entirely, back to "no location set" — the picker's
   *  Clear button, which means clear, not undo. */
  clearAnchor: () => void
}

const LocationContext = createContext<LocationContextValue | null>(null)

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { address, coords, listingId, setAddress, setCoords, setAnchor, tracking, geoError, start, stop } =
    useLiveLocation()

  // What a listing anchor displaced, so tapping that listing's button again
  // can put it back rather than leaving the visitor with nothing.
  //
  // Deliberately a ref, not persisted: this is an undo for "let me just check
  // distances from the hotel", and this provider lives in the community layout
  // so it survives every in-app navigation. A reload ends the gesture — and an
  // address restored days later, from a session the visitor doesn't remember,
  // would be a worse surprise than a clear.
  const displacedRef = useRef<StoredLocation | null>(null)

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
      anchorListingId: listingId,
      setListingAnchor: (listing) => {
        // Remember what's being displaced, but only a typed address is worth
        // restoring. A GPS fix would come back frozen and still labelled
        // "Current location" with tracking off, which claims something untrue;
        // and if a listing is already the anchor, whatever it displaced is
        // already stashed here — hopping hotel to hotel shouldn't lose the
        // address the first hop displaced.
        if (!tracking && !listingId) {
          displacedRef.current = address || coords ? { address, coords, listingId: null } : null
        }
        // Order matters: tracking auto-resumes from localStorage on mount, and
        // every GPS tick rewrites address/coords, so committing first would
        // last about a second. Same stop-then-commit order LocationControl
        // uses for a typed address.
        if (tracking) stop()
        setAnchor({ address: listing.name, coords: listing.coords, listingId: listing.id })
      },
      unsetListingAnchor: () => {
        const displaced = displacedRef.current
        displacedRef.current = null
        setAnchor(displaced ?? { address: '', coords: null, listingId: null })
      },
      clearAnchor: () => {
        displacedRef.current = null
        setAnchor({ address: '', coords: null, listingId: null })
      },
    }),
    // setAddress/setCoords/setAnchor are stable useCallback setters; start/stop
    // are stable closures over the same watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, coords, listingId, tracking, geoError],
  )

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext)
  if (!ctx) throw new Error('useLocation must be used inside a LocationProvider')
  return ctx
}

/** Like useLocation, but returns null outside a provider instead of throwing.
 *
 *  For components that render BOTH under the community layout (where
 *  LocationProvider exists) and inside the admin's category preview, which
 *  deliberately doesn't have one — it keeps its own session-only address so a
 *  location set while previewing can't leak into the live site. PlaceDetailBody
 *  is exactly that: shared by the public directory/map and the preview. The
 *  throwing version would take the preview down, the same way a missing
 *  HeaderCollapseProvider and PinnedProvider each did. */
export function useOptionalLocation(): LocationContextValue | null {
  return useContext(LocationContext)
}
