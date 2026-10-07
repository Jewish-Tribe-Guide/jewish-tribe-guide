'use client'

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps, MAPS_MAP_ID, onMapsAuthFailure } from '@/lib/loadGoogleMaps'
import { labelPoint, shapeOf } from '@/lib/eruvShape'
import type { EruvLineFile } from '@/lib/eruvLine'
import type { EruvTone } from '@/lib/eruv'

// ── The eruvim on a map (Oct 7) ─────────────────────────────────────────────
// Each eruv's own line, drawn on the site's Google map in its status's
// colour, its enclosed area faintly filled, and the visitor's dot. Tapping
// an eruv, or its name, opens its listing. Nothing here decides anything:
// the lines are the eruvim's, as an admin approved them, and the colour is
// their status. Each eruv carries its name, so the map and the list can be
// matched up; on desktop, pointing at either picks out the other.

export type MapEruv = { id: string; name: string; tone: EruvTone; line: EruvLineFile }

const COLOR: Record<EruvTone, string> = { green: '#15803d', amber: '#b45309', red: '#b91c1c', grey: '#475569' }

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

/** "University City" for the University City Eruv: the map is all eruvim. */
export const mapLabel = (name: string) => name.replace(/\s+eruv$/i, '')

type Drawn = { lines: google.maps.Polyline[]; areas: google.maps.Polygon[]; label: google.maps.marker.AdvancedMarkerElement | null }

/** One eruv picked out ('on'), faded behind another ('off'), or as drawn. */
function emphasize(d: Drawn, how: 'on' | 'off' | 'plain') {
  for (const l of d.lines) l.setOptions({ strokeWeight: how === 'on' ? 5 : 3, strokeOpacity: how === 'off' ? 0.35 : 0.95, zIndex: how === 'on' ? 2 : 1 })
  for (const a of d.areas) a.setOptions({ fillOpacity: how === 'on' ? 0.22 : how === 'off' ? 0.04 : 0.1 })
  if (d.label) {
    d.label.zIndex = how === 'on' ? 2 : 1
    ;(d.label.content as HTMLElement).style.opacity = how === 'off' ? '0.45' : '1'
  }
}

export default function EruvMap({ eruvim, you, focusId, fallbackCenter, onSelect, highlightId = null, onHover, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const drawnRef = useRef<Map<string, Drawn>>(new Map())
  const boundsRef = useRef<Map<string, google.maps.LatLngBounds>>(new Map())
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
  const drawKey = eruvim.map((e) => `${e.id}:${e.tone}:${e.line.lines.map((l) => `${l.name}/${l.points.length}/${l.points[0]}`).join(',')}`).join('|')

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    for (const d of drawnRef.current.values()) {
      for (const x of [...d.lines, ...d.areas]) x.setMap(null)
      if (d.label) d.label.map = null
    }
    drawnRef.current = new Map()
    boundsRef.current = new Map()
    for (const e of eruvimRef.current) {
      const color = COLOR[e.tone]
      const select = () => onSelectRef.current(e.id)
      const enter = () => onHoverRef.current?.(e.id)
      const leave = () => onHoverRef.current?.(null)
      const bounds = new google.maps.LatLngBounds()
      const drawn: Drawn = { lines: [], areas: [], label: null }
      for (const area of shapeOf(e.line).areas) {
        const poly = new google.maps.Polygon({ map, paths: area.map(([lat, lng]) => ({ lat, lng })), strokeOpacity: 0, fillColor: color, fillOpacity: 0.1, clickable: true })
        poly.addListener('click', select)
        poly.addListener('mouseover', enter)
        poly.addListener('mouseout', leave)
        drawn.areas.push(poly)
      }
      for (const l of e.line.lines) {
        const path = l.points.map(([lat, lng]) => ({ lat, lng }))
        const line = new google.maps.Polyline({ map, path, strokeColor: color, strokeOpacity: 0.95, strokeWeight: 3, clickable: true })
        line.addListener('click', select)
        line.addListener('mouseover', enter)
        line.addListener('mouseout', leave)
        drawn.lines.push(line)
        for (const p of path) bounds.extend(p)
      }
      const at = labelPoint(e.line)
      if (at) {
        const tag = document.createElement('div')
        tag.textContent = mapLabel(e.name)
        tag.style.cssText = `padding:2px 7px;border-radius:999px;background:#fff;border:1.5px solid ${color};color:#0f172a;font:700 11.5px/1.25 system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.2);transform:translateY(50%);cursor:pointer`
        tag.addEventListener('mouseenter', enter)
        tag.addEventListener('mouseleave', leave)
        const label = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: at[0], lng: at[1] },
          content: tag,
          title: e.name,
          gmpClickable: true,
          collisionBehavior: 'OPTIONAL_AND_HIDES_LOWER_PRIORITY' as google.maps.CollisionBehavior,
        })
        label.addListener('gmp-click', select)
        drawn.label = label
      }
      drawnRef.current.set(e.id, drawn)
      boundsRef.current.set(e.id, bounds)
    }
  }, [ready, drawKey])

  // The eruv being pointed at stands out; the others fade.
  useEffect(() => {
    if (!ready) return
    for (const [id, d] of drawnRef.current) emphasize(d, highlightId === id ? 'on' : highlightId != null ? 'off' : 'plain')
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
    const focus = focusId ? boundsRef.current.get(focusId) : undefined
    if (focus && !focus.isEmpty()) {
      frame.union(focus)
      if (you) frame.extend(you)
    } else {
      for (const b of boundsRef.current.values()) frame.union(b)
    }
    if (!frame.isEmpty()) map.fitBounds(frame, 24)
  }, [ready, hasLines, focusId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return null
  return <div ref={containerRef} className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${className}`} data-testid="eruv-map" aria-label="Map of the eruvim" role="region" />
}
