'use client'

import { useCallback, useEffect } from 'react'
import { useStoredLocation } from './useStoredLocation'
import { useWatchPosition } from './useWatchPosition'

const ENABLED_KEY = 'jpc:live-tracking-enabled'

// Placeholder `address` a live GPS tick stores alongside the real coords (see
// the effect below) — a human-readable label, not a real address, so nothing
// that needs an actual geocodable string (directionsOrigin, most obviously)
// should ever treat it as one. Stopping tracking doesn't clear it: that's
// what lets a visitor "share live location" just long enough to capture a
// fix, then stop, and keep a readable "Current location" label on the frozen
// spot instead of raw coordinates — see locationContext's directionsOrigin
// for the one place that already needs to tell the two apart.
export const CURRENT_LOCATION_LABEL = 'Current location'

/** Site-wide live location: layers a continuously-updating GPS watch
 *  (useWatchPosition) on top of the persisted address/coords
 *  (useStoredLocation), so once a visitor shares their location every GPS
 *  tick updates the same coords/address that drive distance sorting
 *  everywhere — search, category directories, and the map — not just a
 *  single one-time fix, the way `getCurrentPosition` used to.
 *
 *  Whether tracking is on persists across reloads/return visits (a plain
 *  localStorage flag) so it auto-resumes without re-prompting — calling
 *  `start()` when the browser has already granted permission re-uses that
 *  grant silently, no prompt reappears. */
export function useLiveLocation() {
  const stored = useStoredLocation()
  const watch = useWatchPosition()
  // All stable: useCallback setters, and the watch's own useCallbacks.
  const { setCoords, setAddress } = stored
  const { start: watchStart, stop: watchStop, position } = watch

  // Auto-resume on mount if a previous visit turned tracking on. Silent: the
  // visitor isn't doing anything at this instant, so if permission has since
  // been revoked, that failure shouldn't pop the location picker open on a
  // page they just loaded — see useWatchPosition's `start` and
  // LocationControl's geoError effect.
  useEffect(() => {
    try {
      if (localStorage.getItem(ENABLED_KEY) === '1') watchStart({ silent: true })
    } catch {
      // Storage unavailable — just don't auto-resume.
    }
    // Once: watchStart is stable, and this is a mount-time restore, not a
    // live sync (see the effect below for that).
  }, [watchStart])

  // Every GPS tick updates the same stored coords/address everything else
  // already reads from — this is what makes tracking "site-wide" rather than
  // scoped to whichever screen started it.
  //
  // Both setters also clear `listingId` (see useStoredLocation), which is what
  // stops a listing anchor from going stale here: without that, a visitor who
  // tapped "I'm here" at their hotel and then turned on GPS would keep seeing
  // the hotel marked as their location while the coordinates walked away from
  // it.
  useEffect(() => {
    if (!position) return
    setCoords({ lat: position.lat, lng: position.lng })
    setAddress(CURRENT_LOCATION_LABEL)
  }, [position, setCoords, setAddress])

  const start = useCallback(() => {
    try {
      localStorage.setItem(ENABLED_KEY, '1')
    } catch {
      // Best-effort persistence.
    }
    watchStart()
  }, [watchStart])

  const stop = useCallback(() => {
    try {
      localStorage.removeItem(ENABLED_KEY)
    } catch {
      // Best-effort persistence.
    }
    watchStop()
  }, [watchStop])

  return {
    ...stored,
    // How far off the phone says its fix may be, in metres, while it's the
    // live fix being shown; null for a typed address or a listing.
    accuracy: watch.tracking && watch.position ? watch.position.accuracy : null,
    tracking: watch.tracking,
    geoError: watch.error,
    geoErrorSilent: watch.errorSilent,
    start,
    stop,
  }
}
