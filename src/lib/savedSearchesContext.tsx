'use client'

import { createContext, useContext, useMemo } from 'react'
import { isSearchSaved, loadSavedSearches, restoreSavedSearch, storeSavedSearches, toggleSavedSearch, type SavedSearch } from './savedSearches'
import { usePersistedState } from './usePersistedState'
import { useUndoToast } from '@/components/UndoToast'

// The visitor's saved searches, shared by every bookmark that saves one (a
// home line, a category page's box) and by You — one localStorage-backed
// value at the top of the tree, as PinnedProvider is for places.

type SavedSearchesValue = {
  searches: SavedSearch[]
  isSaved: (key: string) => boolean
  /** Saves it, or takes it off; either way with Undo. */
  toggle: (search: SavedSearch) => void
}

const SavedSearchesContext = createContext<SavedSearchesValue | null>(null)

export function SavedSearchesProvider({ children }: { children: React.ReactNode }) {
  const [searches, setSearches] = usePersistedState<SavedSearch[]>([], loadSavedSearches, storeSavedSearches)
  const toast = useUndoToast()

  const value = useMemo<SavedSearchesValue>(
    () => ({
      searches,
      isSaved: (key: string) => isSearchSaved(searches, key),
      toggle: (search: SavedSearch) => {
        setSearches((prev) => toggleSavedSearch(prev, search))
        const at = searches.findIndex((s) => s.key === search.key)
        if (at === -1) toast.show('Saved to You', () => setSearches((prev) => prev.filter((s) => s.key !== search.key)))
        else toast.show('Removed from You', () => setSearches((prev) => restoreSavedSearch(prev, searches[at], at)), false)
      },
    }),
    [searches, setSearches, toast],
  )

  return <SavedSearchesContext.Provider value={value}>{children}</SavedSearchesContext.Provider>
}

/** Null outside the provider (the admin's category preview): no bookmark
 *  is drawn there, since there's nowhere for a saved search to go. */
export function useSavedSearches(): SavedSearchesValue | null {
  return useContext(SavedSearchesContext)
}
