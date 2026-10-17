'use client'

import { useCallback } from 'react'
import { usePersistedState } from './usePersistedState'

// Which campaign banners this browser has closed — a visitor who dismisses
// "Sukkah Map" shouldn't see it again on return visits, but a DIFFERENT
// future campaign (a different banner id) should still show. Same
// hydration-safe shape as useStoredLocation.ts/pinned.ts: state starts empty
// (matching the server-rendered markup, which never knows what this browser
// has dismissed), then the saved list is restored in a post-mount effect.

const STORAGE_KEY = 'jpc:dismissed-campaign-banners'

const EMPTY: string[] = []

/** Parses a raw localStorage string into a list of dismissed banner ids —
 *  pulled out of loadDismissedCampaignBanners so the corrupt/malformed-input
 *  handling is unit-testable without a DOM. Same pattern as parsePinned
 *  (lib/pinned.ts) and parseStoredLocation (lib/useStoredLocation.ts). */
export function parseDismissedCampaignBanners(raw: string | null): string[] {
  try {
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY
    return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    return EMPTY
  }
}

// Module-level (not defined inside the hook) so usePersistedState sees a
// referentially stable function across renders, same as loadPinned/savePinned.
function loadDismissedCampaignBanners(): string[] {
  try {
    return parseDismissedCampaignBanners(localStorage.getItem(STORAGE_KEY))
  } catch {
    return EMPTY
  }
}

function saveDismissedCampaignBanners(ids: string[]): void {
  try {
    if (ids.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Storage unavailable (private mode, quota) — persistence is best-effort,
    // same as everywhere else this app touches localStorage.
  }
}

export function useDismissedCampaignBanners() {
  const [dismissed, setDismissed] = usePersistedState<string[]>(
    EMPTY,
    loadDismissedCampaignBanners,
    saveDismissedCampaignBanners,
  )

  const isDismissed = useCallback((id: string) => dismissed.includes(id), [dismissed])

  const dismiss = useCallback(
    (id: string) => setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id])),
    [setDismissed],
  )

  return { isDismissed, dismiss }
}
