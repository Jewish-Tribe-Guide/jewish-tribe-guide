'use client'

import { useEffect, useState } from 'react'
import type { ZmanimData } from '@/types'
import { community } from '@/community.config'

/** 'no-location' means no coords were passed at all — a distinct state from
 *  'error', since the fix is the visitor entering an address rather than a
 *  retry. */
export type ZmanimStatus = 'loading' | 'no-location' | 'error' | 'ready'

/** Fetches zmanim for the given coordinates. Shared by the full Zmanim &
 *  Shabbos page (ZmanimCard) and the desktop home screen's compact week strip
 *  (ZmanimStrip) so the two can't drift on how they call the API or which
 *  states they distinguish.
 *
 *  Deliberately not module-cached like useCategories/useHomeSections: zmanim
 *  are location- AND time-sensitive, so a cache keyed on nothing would hand a
 *  stale evening's candle-lighting time to someone who changed their address. */
export function useZmanim(coords?: { lat: number; lng: number } | null): {
  data: ZmanimData | null
  status: ZmanimStatus
} {
  const [data, setData] = useState<ZmanimData | null>(null)
  // Only the fetch's own lifecycle. "No location" is derived below rather than
  // stored — it's a fact about the arguments, not something the fetch
  // discovers, so setting it from inside the effect would just be a cascading
  // render for something already knowable at render time.
  const [fetchStatus, setFetchStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const hasCoords = coords?.lat != null && coords?.lng != null

  useEffect(() => {
    let cancelled = false

    if (coords?.lat == null || coords?.lng == null) return
    const url = `/api/zmanim?lat=${coords.lat}&lng=${coords.lng}&tzid=${encodeURIComponent(community.timezone)}`

    fetch(url)
      .then((res) => res.json())
      .then((json: { ok: boolean; data?: ZmanimData }) => {
        if (cancelled) return
        if (json.ok && json.data) {
          setData(json.data)
          setFetchStatus('ready')
        } else {
          setFetchStatus('error')
        }
      })
      .catch(() => {
        if (!cancelled) setFetchStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [coords?.lat, coords?.lng])

  return { data, status: hasCoords ? fetchStatus : 'no-location' }
}
