'use client'

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps, MAPS_MAP_ID, onMapsAuthFailure } from '@/lib/loadGoogleMaps'
import { shapeOf } from '@/lib/eruvShape'
import type { EruvLineFile } from '@/lib/eruvLine'
import type { EruvTone } from '@/lib/eruv'

// ── The eruvim on a map (Oct 7) ─────────────────────────────────────────────
// Each eruv's own line, drawn on the site's Google map in its status's
// colour, its enclosed area faintly filled, and the visitor's dot. Tapping
// an eruv opens its listing. Nothing here decides anything: the lines are
// the eruvim's, as an admin approved them, and the colour is their status.

export type MapEruv = { id: string; name: string; tone: EruvTone; line: EruvLineFile }

const COLOR: Record<EruvTone, string> = { green: '#15803d', amber: '#b45309', red: '#b91c1c', grey: '#475569' }

type Props = {
  eruvim: MapEruv[]
  you: { lat: number; lng: number } | null
  /** Frame this eruv (yours), or every eruv when null. */
  focusId: string | null
  fallbackCenter: { lat: number; lng: number }
  onSelect: (id: string) => void
  className?: string
}

export default function EruvMap({ eruvim, you, focusId, fallbackCenter, onSelect, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const drawnRef = useRef<{ setMap: (m: google.maps.Map | null) => void }[]>([])
  const onSelectRef = useRef(onSelect)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

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

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    for (const d of drawnRef.current) d.setMap(null)
    drawnRef.current = []
    const bounds = new google.maps.LatLngBounds()
    const focusBounds = new google.maps.LatLngBounds()
    for (const e of eruvim) {
      const color = COLOR[e.tone]
      const select = () => onSelectRef.current(e.id)
      for (const area of shapeOf(e.line).areas) {
        const poly = new google.maps.Polygon({ map, paths: area.map(([lat, lng]) => ({ lat, lng })), strokeOpacity: 0, fillColor: color, fillOpacity: 0.1, clickable: true })
        poly.addListener('click', select)
        drawnRef.current.push(poly)
      }
      for (const l of e.line.lines) {
        const path = l.points.map(([lat, lng]) => ({ lat, lng }))
        const line = new google.maps.Polyline({ map, path, strokeColor: color, strokeOpacity: 0.95, strokeWeight: 3, clickable: true })
        line.addListener('click', select)
        drawnRef.current.push(line)
        for (const p of path) {
          bounds.extend(p)
          if (e.id === focusId) focusBounds.extend(p)
        }
      }
    }
    if (you) {
      const dot = document.createElement('div')
      dot.style.cssText = 'width:18px;height:18px;border-radius:9px;background:#1d4ed8;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:translateY(50%)'
      const marker = new google.maps.marker.AdvancedMarkerElement({ map, position: you, content: dot, title: 'You' })
      drawnRef.current.push({ setMap: (m) => (marker.map = m) })
      if (focusId) focusBounds.extend(you)
    }
    const frame = focusId && !focusBounds.isEmpty() ? focusBounds : bounds
    if (!frame.isEmpty()) map.fitBounds(frame, 24)
  }, [ready, eruvim, you, focusId])

  if (failed) return null
  return <div ref={containerRef} className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${className}`} data-testid="eruv-map" aria-label="Map of the eruvim" role="region" />
}
