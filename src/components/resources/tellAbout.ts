'use client'

import { createContext } from 'react'
import type { DirectoryResource } from '@/types'

/** Opens the "+ Add" box about a listing. Given by a category page, which
 *  owns the box; an open listing's Suggest an edit opens it when it's here
 *  (Oct 6). `editYourself`: what that Suggest an edit opened before, the
 *  listing's own editor where the listing is, for the box's "Edit the
 *  details myself". The Map gives none, so Suggest an edit there opens the
 *  editor itself. `times`: opened from a shul's "Update their times", so
 *  the box asks for their schedule (Oct 6). */
export const TellAboutContext = createContext<((item: DirectoryResource, editYourself?: () => void, opts?: { times?: boolean }) => void) | null>(null)
