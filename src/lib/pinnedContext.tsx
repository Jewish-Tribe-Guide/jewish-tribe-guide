'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isPinned, loadPinned, savePinned, togglePinned, type PinnedListing } from './pinned'

// The visitor's pinned-listing shortlist, shared by every screen that shows a
// pin toggle (directory rows, the map's nearby list, map markers) — same
// pattern as LocationProvider: one localStorage-backed value at the top of
// the tree instead of each consumer keeping its own copy out of sync.

type PinnedContextValue = {
  pinned: PinnedListing[]
  isPinned: (id: string) => boolean
  toggle: (listing: PinnedListing) => void
  /** Whether the map's "Pinned" chip should read as selected — lives here
   *  (not as ResourceMapView's own local state) so pinning a place from
   *  ANY pin button (a directory row, the map's nearby list, a place detail)
   *  turns the chip on immediately, even though those buttons don't know
   *  the map exists. Toggling it back off (the chip itself, or Hide all)
   *  writes here too, so the two stay in sync no matter which one changed
   *  it last. */
  filterActive: boolean
  setFilterActive: (value: boolean) => void
}

const PinnedContext = createContext<PinnedContextValue | null>(null)

export function PinnedProvider({ children }: { children: React.ReactNode }) {
  // Starts empty to match the server-rendered markup, then restores from
  // localStorage in a post-mount effect — same hydration-safety reasoning as
  // useStoredLocation (reading localStorage during render would mismatch SSR).
  const [pinned, setPinned] = useState<PinnedListing[]>([])
  const [filterActive, setFilterActive] = useState(false)
  const hydrated = useRef(false)

  useEffect(() => {
    setPinned(loadPinned())
    hydrated.current = true
  }, [])

  useEffect(() => {
    // Guards against the empty initial state clobbering a previously-saved
    // list before the restore effect above has actually run.
    if (!hydrated.current) return
    savePinned(pinned)
  }, [pinned])

  const value = useMemo<PinnedContextValue>(
    () => ({
      pinned,
      isPinned: (id: string) => isPinned(pinned, id),
      toggle: (listing: PinnedListing) => {
        setPinned((prev) => {
          const wasPinned = isPinned(prev, listing.id)
          const next = togglePinned(prev, listing)
          // Only turn the chip ON when this pinned something new — unpinning
          // shouldn't silently flip a filter the visitor didn't touch.
          if (!wasPinned) setFilterActive(true)
          return next
        })
      },
      filterActive,
      setFilterActive,
    }),
    [pinned, filterActive],
  )

  return <PinnedContext.Provider value={value}>{children}</PinnedContext.Provider>
}

export function usePinned(): PinnedContextValue {
  const ctx = useContext(PinnedContext)
  if (!ctx) throw new Error('usePinned must be used inside a PinnedProvider')
  return ctx
}
