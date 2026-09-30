'use client'

import { createContext, useContext } from 'react'
import type { DirectoryResource } from '@/types'

/** What an opened listing needs from the list it was opened from, for its
 *  last part (the places nearby, then the whole list): the list's
 *  listings, where each is, and how to open one. Provided by the category
 *  page (GenericDirectory); null anywhere else, such as the map, which has
 *  its own nearby list. */
export type ListingOnwardSource = {
  items: readonly DirectoryResource[]
  place: (item: DirectoryResource) => string | null
  open: (id: string) => void
  /** "All 73 Food places". */
  allLabel: string
}

export const ListingOnwardContext = createContext<ListingOnwardSource | null>(null)

export function useListingOnward(): ListingOnwardSource | null {
  return useContext(ListingOnwardContext)
}
