'use client'

import { createContext, useContext } from 'react'
import type { DirectoryResource } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Every approved listing for the community, loaded on the server.
//
// Deliberately NOT part of the shared community content in the layout. The
// full set serializes to ~113KB against ~20KB for a single category, so
// putting it in the layout would have loaded all of it into every category
// page to satisfy the two screens that actually need it — the home search and
// the map. Those two provide it; a category directory gets only its own
// listings, passed as a prop.
//
// `null` means the read failed. It is not the same as an empty array, and the
// UI must not present it as one — see FreshnessNotice / the directory's own
// failure state. An empty grocery list that really means "the database was
// unreachable" tells someone there is no kosher grocery near them.
// ─────────────────────────────────────────────────────────────────────────────

const ListingsContext = createContext<DirectoryResource[] | null | undefined>(undefined)

export function ListingsProvider({
  listings,
  children,
}: {
  listings: DirectoryResource[] | null
  children: React.ReactNode
}) {
  return <ListingsContext.Provider value={listings}>{children}</ListingsContext.Provider>
}

/** Every approved listing, or null if the read failed.
 *
 *  Returns null outside a provider too — only the home screen and the map ask
 *  for the full set, and both supply it. */
export function useAllListings(): DirectoryResource[] | null {
  const listings = useContext(ListingsContext)
  return listings === undefined ? null : listings
}
