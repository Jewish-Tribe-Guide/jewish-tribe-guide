'use client'

import { createContext } from 'react'
import type { DirectoryResource } from '@/types'

/** Opens the "+ Add" box about a listing (agreed Oct 5: Add stays on a
 *  listing). Given by a category page, which owns the box; an open
 *  listing's edit bar shows a "+" beside "Suggest an edit" when it's here.
 *  The Map gives none, so a listing opened there has no "+", as the Map has
 *  no Add. */
export const TellAboutContext = createContext<((item: DirectoryResource) => void) | null>(null)
