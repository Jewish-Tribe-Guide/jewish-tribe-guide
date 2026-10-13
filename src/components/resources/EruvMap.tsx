'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { loadGoogleMaps, MAPS_MAP_ID, onMapsAuthFailure } from '@/lib/loadGoogleMaps'
import { clearEruvim, drawEruvim, emphasizeEruvim, eruvDrawKey, type DrawnEruv, type MapEruv } from '@/components/map/eruvLayer'

// ── The eruvim on a map (Oct 7; their own maps Oct 12) ──────────────────────
// Each eruv's own map, drawn on the site's Google map as the eruv draws it
// (eruvLayer.ts), with its name in its status's colour, and the visitor's
// dot. Tapping an eruv, or its name, opens its listing, and the map comes
// to the eruv opened, as a category page's map comes to its listing (Oct
// 13). Nothing here decides anything. Each eruv carries its name, so the
// map and the list can be matched up; on desktop, pointing at either picks
// out the other. "Full map" opens the Map tab on the eruvim.

export type { MapEruv } from '@/components/map/eruvLayer'
export { mapLabel } from '@/components/map/eruvLayer'

/** Every eruv in view. */
function frameAll(map: google.maps.Map, drawn: Map<string, DrawnEruv>) {
  const frame = new google.maps.LatLngBounds()
  for (const d of drawn.values()) frame.union(d.bounds)
  if (!frame.isEmpty()) map.fitBounds(frame, 24)
}

type Props = {
  eruvim: MapEruv[]
  you: { lat: number; lng: number } | null
  fallbackCenter: { lat: number; lng: number }
  onSelect: (id: string) => void
  /** The eruv to pick out (a row being pointed at), the rest faded. */
  highlightId?: string | null
  /** Pointing at an eruv on the map, or leaving it. */
  onHover?: (id: string | null) => void
  /** The eruv opened: the map comes to it. Closed, it goes back to them all. */
  focusId?: string | null
  /** The Map tab on the eruvim, for the "Full map" button. */
  fullMapHref?: string
  className?: string
}

export default function EruvMap({ eruvim, you, fallbackCenter, onSelect, highlightId = null, onHover, focusId = null, fullMapHref, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const drawnRef = useRef<Map<string, DrawnEruv>>(new Map())
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const framedRef = useRef(false)
  const focusedRef = useRef(false)
  const onSelectRef = useRef(onSelect)
  const onHoverRef = useRef(onHover)
  const eruvimRef = useRef(eruvim)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelect
    onHoverRef.current = onHover
    eruvimRef.current = eruvim
  })

  useEffect(() => {
    let cancelled = false
    const unsubscribe = onMapsAuthFailure(() => setFailed(true))
    loadGoogleMaps()
      .then(() => Promise.all([google.maps.importLibrary('maps'), google.maps.importLibrary('marker')]))
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: fallbackCenter,
          zoom: 12,
          mapId: MAPS_MAP_ID,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        })
        // Drawn and framed after the map's first settle: a fit before it
        // (a link opening one eruv) left its tiles grey. Within a moment
        // either way, as ResourceMap's onIdleOrTimeout.
        const map = mapRef.current
        let settled = false
        const settle = () => {
          if (settled || cancelled) return
          settled = true
          setReady(true)
        }
        google.maps.event.addListenerOnce(map, 'idle', settle)
        setTimeout(settle, 1500)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The page hands over a new list on every render (the clock, each
  // location fix), so the lines are redrawn only when one of them, or a
  // status, actually changed. Redrawing on every render wiped and re-framed
  // the map under the visitor's fingers.
  const drawKey = eruvDrawKey(eruvim)

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    clearEruvim(drawnRef.current)
    drawnRef.current = drawEruvim(map, eruvimRef.current, {
      onSelect: (id) => onSelectRef.current(id),
      onHover: (id) => onHoverRef.current?.(id),
      areasClickable: true,
    })
  }, [ready, drawKey])

  // The eruv being pointed at stands out; the others fade.
  useEffect(() => {
    if (!ready) return
    emphasizeEruvim(drawnRef.current, highlightId)
  }, [ready, drawKey, highlightId])

  // The visitor's dot moves in place.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (!you) {
      if (markerRef.current) markerRef.current.map = null
      markerRef.current = null
      return
    }
    if (markerRef.current) {
      markerRef.current.position = you
      return
    }
    const dot = document.createElement('div')
    dot.style.cssText = 'width:18px;height:18px;border-radius:9px;background:#1d4ed8;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:translateY(50%)'
    markerRef.current = new google.maps.marker.AdvancedMarkerElement({ map, position: you, content: dot, title: 'You' })
  }, [ready, you?.lat, you?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Framed on every eruv once, or on the eruv opened. Anything else leaves
  // the map where the visitor put it. Closed again, it goes back to them
  // all, since that was the map's move, not the visitor's. One fit per
  // change: two at once (all, then the one a link opened) left the map's
  // tiles unloaded.
  const hasLines = drawKey !== ''
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !hasLines) return
    const d = focusId ? drawnRef.current.get(focusId) : null
    if (d && !d.bounds.isEmpty()) {
      map.fitBounds(d.bounds, 32)
      focusedRef.current = true
      framedRef.current = true
    } else if (!framedRef.current || (!focusId && focusedRef.current)) {
      framedRef.current = true
      focusedRef.current = false
      frameAll(map, drawnRef.current)
    }
  }, [ready, hasLines, focusId])

  if (failed) return null
  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="absolute inset-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100" data-testid="eruv-map" aria-label="Map of the eruvim" role="region" />
      {fullMapHref && (
        // As on a category page's map (CategoryMap).
        <Link
          href={fullMapHref}
          aria-label="Open the full map"
          className="absolute right-3 top-3 flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-2.5 text-[13.5px] font-semibold text-slate-700 shadow-md ring-1 ring-slate-900/10 transition-colors hover:bg-slate-50"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
          Full map
        </Link>
      )}
    </div>
  )
}
