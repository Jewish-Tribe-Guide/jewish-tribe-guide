'use client'

import { useEffect, useState } from 'react'
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

  // Whether a mount-time silent auto-resume is in flight — true from the
  // instant we decide to attempt one until it actually resolves (tracking
  // starts, or an error comes back). `watchPosition`'s callback is always
  // asynchronous, even for an already-denied permission that fails
  // "immediately" — so on the very first render, before that callback has
  // had a chance to run, `tracking` and `errorSilent` both still read their
  // initial `false`. A consumer computing "should I invite this visitor to
  // share their location" from those alone (see LiveLocationPrompt) would
  // read that first render as a fresh, un-decided visitor and flash its
  // prompt open for a beat before the real (silent) failure lands and hides
  // it again — exactly the kind of glitch this flag exists to prevent.
  const [resumingSilently, setResumingSilently] = useState(false)

  // Auto-resume on mount if a previous visit turned tracking on. Silent: the
  // visitor isn't doing anything at this instant, so if permission has since
  // been revoked, that failure shouldn't pop the location picker open on a
  // page they just loaded — see useWatchPosition's `start` and
  // LocationControl's geoError effect.
  // Recently tuned (see git history) to fix the exact glitch resumingSilently
  // exists to prevent — not touching either effect below beyond the
  // required-for-CI lint suppression.
  useEffect(() => {
    try {
      if (localStorage.getItem(ENABLED_KEY) === '1') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setResumingSilently(true)
        watch.start({ silent: true })
      }
    } catch {
      // Storage unavailable — just don't auto-resume.
    }
    // Intentionally once-only: watch.start is stable, and this is a mount-time
    // restore, not a live sync (see the effect below for that).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The attempt above has resolved — one way or the other — once either a
  // position or an error comes back.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (resumingSilently && (watch.position || watch.error)) setResumingSilently(false)
  }, [resumingSilently, watch.position, watch.error])

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
    if (!watch.position) return
    stored.setCoords({ lat: watch.position.lat, lng: watch.position.lng })
    stored.setAddress('Current location')
    // stored.setCoords/setAddress are stable useCallback setters — omitting
    // them avoids re-running this on unrelated `stored` identity changes.
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
    geoErrorSilent: watch.errorSilent,
    resumingSilently,
    start,
    stop,
  }
}
