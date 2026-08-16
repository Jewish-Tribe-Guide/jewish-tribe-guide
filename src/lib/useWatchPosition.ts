'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type LivePosition = {
  lat: number
  lng: number
  /** Accuracy radius in meters from the GPS sensor. */
  accuracy: number
}

export type WatchState = {
  position: LivePosition | null
  error: string | null
  /** Whether `error` came from a `start({ silent: true })` call rather than
   *  one the visitor directly triggered — see `start`'s own doc. */
  errorSilent: boolean
  tracking: boolean
  start: (opts?: { silent?: boolean }) => void
  stop: () => void
}

/** Wraps `navigator.geolocation.watchPosition` to give a continuously-updating
 *  live position as the user moves. Call `start()` to begin and `stop()` to end.
 *  Pauses the underlying GPS watch while the tab is hidden/backgrounded (no
 *  point burning battery on fixes nobody's looking at) and transparently
 *  resumes when it becomes visible again, as long as the visitor hasn't
 *  explicitly called `stop()` in the meantime. The watch is always cleaned up
 *  on unmount. */
export function useWatchPosition(): WatchState {
  const [position, setPosition] = useState<LivePosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorSilent, setErrorSilent] = useState(false)
  const [tracking, setTracking] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  // Whether the in-flight `start()` call was silent — read by the error
  // callback below, which fires well after `start` returns.
  const silentRef = useRef(false)
  // Mirrors `tracking` for the visibilitychange listener below, which is only
  // ever attached once — a ref sidesteps re-subscribing that listener every
  // time tracking flips, and stays correct across the pause/resume cycle.
  const wantsTrackingRef = useRef(false)

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const subscribe = useCallback(() => {
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setError(null)
        setErrorSilent(false)
      },
      (err) => {
        wantsTrackingRef.current = false
        setTracking(false)
        watchIdRef.current = null
        setErrorSilent(silentRef.current)
        if (err.code === err.PERMISSION_DENIED) {
          setError(
            'Location permission is blocked. Enable it in your browser settings and try again.',
          )
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError('Location unavailable. Step outside or try again in a moment.')
        } else {
          setError('Could not get your location. Try again.')
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }, [])

  const stop = useCallback(() => {
    wantsTrackingRef.current = false
    clearWatch()
    setTracking(false)
  }, [clearWatch])

  // `silent`: true for useLiveLocation's mount-time auto-resume, which isn't
  // something the visitor just did — a failure there (typically permission
  // having been revoked since the last visit) shouldn't pop any UI open the
  // way a failure from a visitor-pressed "Use my location" button should.
  // The message itself still comes through in `error` either way, for
  // whoever opens the location picker next and wonders why tracking is off.
  const start = useCallback((opts?: { silent?: boolean }) => {
    silentRef.current = !!opts?.silent
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not available on this device.')
      setErrorSilent(silentRef.current)
      return
    }
    setError(null)
    setErrorSilent(false)
    setTracking(true)
    wantsTrackingRef.current = true
    subscribe()
  }, [subscribe])

  // Pause the GPS watch while the tab is hidden/backgrounded, resume it when
  // visible again. The very next fix on resume re-syncs anything downstream
  // (e.g. useLiveLocation's stored coords), so nothing goes stale-looking
  // beyond that first tick back.
  useEffect(() => {
    function onVisibility() {
      if (!wantsTrackingRef.current) return
      if (document.hidden) {
        clearWatch()
      } else if (watchIdRef.current === null) {
        subscribe()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [clearWatch, subscribe])

  // Always clear the watch when the component that owns this hook unmounts.
  useEffect(() => () => { clearWatch() }, [clearWatch])

  return { position, error, errorSilent, tracking, start, stop }
}
