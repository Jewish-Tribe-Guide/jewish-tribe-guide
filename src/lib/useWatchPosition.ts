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
  tracking: boolean
  start: () => void
  stop: () => void
}

/** Wraps `navigator.geolocation.watchPosition` to give a continuously-updating
 *  live position as the user moves. Call `start()` to begin and `stop()` to end.
 *  The watch is always cleaned up on unmount. */
export function useWatchPosition(): WatchState {
  const [position, setPosition] = useState<LivePosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tracking, setTracking] = useState(false)
  const watchIdRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setTracking(false)
  }, [])

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not available on this device.')
      return
    }
    setError(null)
    setTracking(true)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setError(null)
      },
      (err) => {
        setTracking(false)
        watchIdRef.current = null
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

  // Always clear the watch when the component that owns this hook unmounts.
  useEffect(() => () => { stop() }, [stop])

  return { position, error, tracking, start, stop }
}
