'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { isPinned, loadPinned, restorePinned, savePinned, togglePinned, type PinnedListing } from './pinned'
import { useUndoToast } from '@/components/UndoToast'
import { usePersistedState } from './usePersistedState'

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
   *  the map exists. Toggling it back off (the chip itself, or another
   *  category chip narrowing the row)
   *  writes here too, so the two stay in sync no matter which one changed
   *  it last. */
  filterActive: boolean
  setFilterActive: (value: boolean) => void
}

const PinnedContext = createContext<PinnedContextValue | null>(null)

export function PinnedProvider({ children }: { children: React.ReactNode }) {
  // Starts empty to match the server-rendered markup, then restores from
  // localStorage in a post-mount effect — same hydration-safety reasoning as
  // useStoredLocation. Not a useSyncExternalStore candidate despite the
  // hydration-timing issue looking similar to NearbyList's hoverCapable:
  // `pinned` is subsequently mutated locally (toggle, below) and written
  // back to storage, not purely read from an external source — modeling
  // that as an external store would mean moving the mutation logic out of
  // React entirely, a real redesign of state used by "every screen that
  // shows a pin toggle" (see the comment atop this file), not a lint fix.
  const [pinned, setPinned] = usePersistedState<PinnedListing[]>([], loadPinned, savePinned)
  const [filterActive, setFilterActive] = useState(false)
  const toast = useUndoToast()

  const value = useMemo<PinnedContextValue>(
    () => ({
      pinned,
      isPinned: (id: string) => isPinned(pinned, id),
      toggle: (listing: PinnedListing) => {
        // Saving no longer turns the map's Saved chip on (Oct 14): saving a
        // place from its listing shouldn't narrow a map the visitor hasn't
        // opened. The map shows everything, saved places marked (YouMap).
        setPinned((prev) => togglePinned(prev, listing))
        // "Saved to You · Undo", or "Removed from You · Undo": tapping again
        // to take a place off is safe because of it.
        const at = pinned.findIndex((p) => p.id === listing.id)
        if (at === -1) toast.show('Saved to You', () => setPinned((prev) => prev.filter((p) => p.id !== listing.id)))
        else toast.show('Removed from You', () => setPinned((prev) => restorePinned(prev, listing, at)), false)
      },
      filterActive,
      setFilterActive,
    }),
    // setPinned is stable (it's usePersistedState's underlying useState
    // setter), but that stability isn't visible to eslint across the custom
    // hook boundary.
    [pinned, filterActive, setPinned, toast],
  )

  return <PinnedContext.Provider value={value}>{children}</PinnedContext.Provider>
}

export function usePinned(): PinnedContextValue {
  const ctx = useContext(PinnedContext)
  if (!ctx) throw new Error('usePinned must be used inside a PinnedProvider')
  return ctx
}
