'use client'

import { useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// A listing's editor, opened over the listing, as history entries: the editor
// is one entry on top of the listing's, and its Request removal screen one
// more, so Back, Escape and the phone's back swipe step out of removal into
// the edit (what was typed there still there), then out to the listing,
// never off the page. The removal screen has no Cancel of its own.
//
// The computer's listing dialog (ListingDetailModal) and the map's place
// sheet (MapPlaceDetail) each had their own copy of this, the same 40 lines
// under different state keys (Nov 18, review item 42). The keys stay as they
// were (`<prefix>Form`, `<prefix>Removal`), since other screens read the
// map's: ListingColumn, EruvInfo, EruvListing and ResourceMapView's back.
//
// These entries carry no address of their own: they are written with
// history.pushState on top of the listing's, as they always were. Moving
// them onto Next's router (AGENTS.md, "A screen of its own is an entry in
// the browser's history") is a change of its own.
// ─────────────────────────────────────────────────────────────────────────────

export type EditFormHistory = {
  formOpen: 'edit' | null
  removalOpen: boolean
  /** Opens the editor: one entry. */
  openForm: (mode: 'edit') => void
  /** The edit bar's Request removal: straight to that screen, one entry,
   *  so Back returns to the listing. */
  openRemoval: () => void
  /** One step back: from removal to the edit, from the edit to the listing. */
  stepBack: () => void
  /** All the way out of the editor: two entries back once a removal
   *  request has been sent from its own screen. */
  closeForm: () => void
  /** The editor's own switch to and from its removal screen. */
  changeRemovalOpen: (open: boolean) => void
  /** Forgets an editor left open by an earlier opening, for a host that
   *  stays mounted while closed. Safe to call during render. */
  reset: () => void
}

/** The same function on every render, so an effect can list it. */
const stepBack = () => history.back()

export function useEditFormHistory(prefix: 'detailModal' | 'mapSheet'): EditFormHistory {
  const formKey = `${prefix}Form`
  const removalKey = `${prefix}Removal`
  const [formOpen, setFormOpen] = useState<'edit' | null>(null)
  const [removalOpen, setRemovalOpen] = useState(false)

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as Record<string, unknown> | null
      const open = state?.[formKey] === 'edit'
      setFormOpen(open ? 'edit' : null)
      setRemovalOpen(open && !!state?.[removalKey])
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [formKey, removalKey])

  const push = (entry: Record<string, unknown>) => history.pushState({ ...(window.history.state ?? {}), ...entry }, '')

  return {
    formOpen,
    removalOpen,
    openForm: (mode) => {
      push({ [formKey]: mode })
      setFormOpen(mode)
    },
    openRemoval: () => {
      push({ [formKey]: 'edit', [removalKey]: true })
      setFormOpen('edit')
      setRemovalOpen(true)
    },
    stepBack,
    closeForm: () => (removalOpen ? history.go(-2) : history.back()),
    changeRemovalOpen: (open) => {
      if (open === removalOpen) return
      if (open) {
        push({ [removalKey]: true })
        setRemovalOpen(true)
      } else stepBack()
    },
    reset: () => {
      setFormOpen(null)
      setRemovalOpen(false)
    },
  }
}
