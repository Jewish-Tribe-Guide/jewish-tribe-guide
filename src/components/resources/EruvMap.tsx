'use client'

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps, MAPS_MAP_ID, onMapsAuthFailure } from '@/lib/loadGoogleMaps'
import { clearEruvim, drawEruvim, emphasizeEruvim, eruvDrawKey, type DrawnEruv, type MapEruv } from '@/components/map/eruvLayer'

// ── The eruvim on a map (Oct 7) ─────────────────────────────────────────────
// Each eruv's own line, drawn on the site's Google map in its status's
// colour, its enclosed area faintly filled, and the visitor's dot. Tapping
// an eruv, or its name, opens its listing. Nothing here decides anything:
// the lines are the eruvim's, as an admin approved them, and the colour is
// their status. Each eruv carries its name, so the map and the list can be
// matched up; on desktop, pointing at either picks out the other.

export type { MapEruv } from '@/components/map/eruvLayer'
export { mapLabel } from '@/components/map/eruvLayer'

type Props = {
  eruvim: MapEruv[]
  you: { lat: number; lng: number } | null
  /** Frame this eruv (yours), or every eruv when null. */
  focusId: string | null
  fallbackCenter: { lat: number; lng: number }
  onSelect: (id: string) => void
  /** The eruv to pick out (a row being pointed at), the rest faded. */
  highlightId?: string | null
  /** Pointing at an eruv on the map, or leaving it. */
  onHover?: (id: string | null) => void
  className?: string
}

export default function EruvMap({ eruvim, you, focusId, fallbackCenter, onSelect, highlightId = null, onHover, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const drawnRef = useRef<Map<string, DrawnEruv>>(new Map())
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const framedRef = useRef<string | null>(null)
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
        setReady(true)
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

  // Framed once: on the visitor's eruv, or on every eruv; again only when
  // that changes. Anything else leaves the map where the visitor put it.
  const hasLines = drawKey !== ''
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !hasLines) return
    const target = focusId ?? ''
    if (framedRef.current === target) return
    framedRef.current = target
    const frame = new google.maps.LatLngBounds()
    const focus = focusId ? drawnRef.current.get(focusId)?.bounds : undefined
    if (focus && !focus.isEmpty()) {
      frame.union(focus)
      if (you) frame.extend(you)
    } else {
      for (const d of drawnRef.current.values()) frame.union(d.bounds)
    }
    if (!frame.isEmpty()) map.fitBounds(frame, 24)
  }, [ready, hasLines, focusId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return null
  return <div ref={containerRef} className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${className}`} data-testid="eruv-map" aria-label="Map of the eruvim" role="region" />
}
