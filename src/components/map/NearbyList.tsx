'use client'

import { useMemo } from 'react'
import { haversineMiles } from '@/lib/geo'
import { directionsUrl } from '@/lib/googleMapsLinks'
import type { MapPoint } from './ResourceMap'

type LatLng = { lat: number; lng: number }
type ScoredPoint = MapPoint & { filterId: string; miles: number | null }

// Hospitals are curated data — they have no directory listing to open.
const HOSPITALS_FILTER_ID = '__hospitals__'

type Props = {
  points: (MapPoint & { filterId: string })[]
  userLocation: LatLng | null
  /** Called when the user taps a listing row — opens that listing's detail card
   *  in the category directory. Not fired for hospitals (no directory entry). */
  onViewListing?: (categoryId: string, listingId: string) => void
}

function distanceLabel(miles: number): string {
  if (miles < 0.05) return 'You are here'
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`
  return `${(Math.round(miles * 10) / 10).toFixed(1)} mi`
}

export default function NearbyList({ points, userLocation, onViewListing }: Props) {
  const sorted = useMemo<ScoredPoint[]>(() => {
    const scored = points.map((p) => ({
      ...p,
      miles: userLocation ? haversineMiles(userLocation, { lat: p.lat, lng: p.lng }) : null,
    }))
    return scored.sort((a, b) => {
      if (a.miles === null && b.miles === null) return a.name.localeCompare(b.name)
      if (a.miles === null) return 1
      if (b.miles === null) return -1
      return a.miles - b.miles
    })
  }, [points, userLocation])

  if (sorted.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        No places to show. Turn on a category above.
      </p>
    )
  }

  return (
    <div className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-900/5 bg-white overflow-hidden">
      {sorted.map((p) => {
        const dest = p.address || `${p.lat},${p.lng}`
        const href = directionsUrl(dest)
        const canViewListing = !!onViewListing && p.filterId !== HOSPITALS_FILTER_ID

        return (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
            {/* Category dot */}
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
              style={{ backgroundColor: p.color + '22' }}
              aria-hidden="true"
            >
              {p.glyph ?? '📍'}
            </span>

            {/* Name + category + address — tappable when a directory exists */}
            <button
              onClick={canViewListing ? () => onViewListing(p.filterId, p.id) : undefined}
              disabled={!canViewListing}
              className={`min-w-0 flex-1 text-left ${canViewListing ? 'cursor-pointer group' : 'cursor-default'}`}
            >
              <p className={`truncate text-sm font-semibold leading-tight ${canViewListing ? 'text-slate-900 group-hover:text-blue-600 transition-colors' : 'text-slate-900'}`}>
                {p.name}
                {canViewListing && (
                  <span className="ml-1 text-slate-300 group-hover:text-blue-400 transition-colors text-xs">›</span>
                )}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {p.categoryLabel}
                {p.address ? ` · ${p.address}` : ''}
              </p>
            </button>

            {/* Distance + Directions */}
            <div className="flex shrink-0 flex-col items-end gap-1.5 ml-2">
              {p.miles !== null && (
                <span className="text-xs font-semibold tabular-nums" style={{ color: p.color }}>
                  {distanceLabel(p.miles)}
                </span>
              )}
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-1.5 py-0.5 text-[10px] sm:px-2.5 sm:py-1 sm:text-xs font-semibold text-white hover:bg-blue-700 active:bg-blue-800"
              >
                <span className="sm:hidden">↗</span>
                <span className="hidden sm:inline">Directions ↗</span>
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}
