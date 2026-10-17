'use client'

import { createContext } from 'react'
import type { DirectoryResource } from '@/types'
import type { Highlight } from './CategoryMap'

// ── An open listing's places within a walk, on the map beside it ─────────────
// A hotel's "Within a walk" box opens a kind ("Synagogues · 7") to its list;
// where the category page's map is on screen beside the listing (desktop,
// wide enough, not hidden), that list's places go on the map with the hotel,
// and a row under the pointer lights its pin, as the page's own rows do
// (Oct 6). Where there's no map beside it, the list offers "See them on the
// map" instead. Null where there's no map beside the listing.

export type WalkShown = { categoryId: string; places: readonly DirectoryResource[] }

export type WalkOnMap = {
  /** The open kind's places, or null when none is open. */
  show: (shown: WalkShown | null) => void
  /** The page's own pointer highlight, shared with the map. */
  highlight: Highlight
}

export const WalkOnMapContext = createContext<WalkOnMap | null>(null)
