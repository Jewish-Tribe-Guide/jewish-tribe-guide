'use client'

import type { SiteSettings } from './siteSettings'
import type { DraftHomeSection, HomeSection } from './homeSections'

// ─────────────────────────────────────────────────────────────────────────────
// Admin preview handoff.
//
// The admin's Preview opens the REAL site in an iframe rather than re-rendering
// a copy of the home screen. That buys two things a hand-built preview can't:
// it's genuinely navigable (the app inside gets its own window and its own
// history, so clicking a card, opening the map, or backing out all just work),
// and it can never drift from what visitors see, because it IS what visitors
// see.
//
// The one thing a real page load loses is the admin's *unsaved* draft — it
// would fetch the saved settings like any other visitor. So the admin drops a
// snapshot of the draft in sessionStorage first and opens the frame with
// ?preview=1; the settings hooks below pick it up instead of fetching.
//
// Deliberately narrow: same-origin sessionStorage, read-only, and only when
// the flag is on the URL. Without the flag this is inert — a visitor landing
// on /?preview=1 with nothing stored just gets the normal site.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'jpc:adminPreviewDraft'
const PREVIEW_PARAM = 'preview'

export type PreviewDraft = {
  settings: SiteSettings
  /** The editor's own draft shape — order is array position, and ids may still
   *  be client-only. `readPreviewSections` restores the `sortOrder` the app's
   *  hook expects. */
  sections: DraftHomeSection[]
}

/** The URL the admin's preview iframe points at. Relative so it inherits the
 *  origin (and therefore access to the sessionStorage written just before). */
export const PREVIEW_URL = `/?${PREVIEW_PARAM}=1`

/** True when this page was opened as an admin preview. Always false on the
 *  server, so it can't affect SSR output. */
export function isPreviewMode(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get(PREVIEW_PARAM) === '1'
}

/** Admin side — snapshot the draft just before opening the frame. */
export function writePreviewDraft(draft: PreviewDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Private-mode or quota failure: the preview simply shows saved settings
    // rather than the draft. Not worth blocking the preview over.
  }
}

/** Preview side — the snapshot, or null if there isn't a usable one. Returns
 *  null outside preview mode without touching storage. */
export function readPreviewDraft(): PreviewDraft | null {
  if (!isPreviewMode()) return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PreviewDraft
    if (!parsed?.settings || !Array.isArray(parsed.sections)) return null
    return parsed
  } catch {
    return null
  }
}

/** The draft sections as the app's `HomeSection[]`, with `sortOrder` rebuilt
 *  from array position — the editor drops it because its list order *is* the
 *  order, but the rest of the app still reads the field. */
export function draftSectionsAsHomeSections(sections: DraftHomeSection[]): HomeSection[] {
  return sections.map((s, i) => ({ ...s, sortOrder: i }))
}
