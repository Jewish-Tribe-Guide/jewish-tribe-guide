'use client'

import { useEffect } from 'react'
import { useStoredLocation } from './useStoredLocation'
import { useWatchPosition } from './useWatchPosition'

const ENABLED_KEY = 'jpc:live-tracking-enabled'

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

  // Auto-resume on mount if a previous visit turned tracking on.
  useEffect(() => {
    try {
      if (localStorage.getItem(ENABLED_KEY) === '1') watch.start()
    } catch {
      // Storage unavailable — just don't auto-resume.
    }
    // Intentionally once-only: watch.start is stable, and this is a mount-time
    // restore, not a live sync (see the effect below for that).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Every GPS tick updates the same stored coords/address everything else
  // already reads from — this is what makes tracking "site-wide" rather than
  // scoped to whichever screen started it.
  useEffect(() => {
    if (!watch.position) return
    stored.setCoords({ lat: watch.position.lat, lng: watch.position.lng })
    stored.setAddress('Current location')
    // stored.setCoords/setAddress are stable setState setters — omitting them
    // avoids re-running this on unrelated `stored` identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch.position])

  const start = () => {
    try {
      localStorage.setItem(ENABLED_KEY, '1')
    } catch {
      // Best-effort persistence.
    }
    watch.start()
  }

  const stop = () => {
    try {
      localStorage.removeItem(ENABLED_KEY)
    } catch {
      // Best-effort persistence.
    }
    watch.stop()
  }

  return {
    ...stored,
    tracking: watch.tracking,
    geoError: watch.error,
    start,
    stop,
  }
}
