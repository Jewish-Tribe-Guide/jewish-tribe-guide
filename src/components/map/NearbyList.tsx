'use client'

import { useMemo } from 'react'
import { haversineMiles } from '@/lib/geo'
import { directionsUrl } from '@/lib/googleMapsLinks'
import { DirectionsIcon } from '@/components/icons'
import type { MapPoint } from './ResourceMap'
import type { DirectoryResource } from '@/types'

type LatLng = { lat: number; lng: number }
type InputPoint = MapPoint & { filterId: string; raw?: DirectoryResource }
export type ScoredPoint = InputPoint & { miles: number | null }

// Hospitals are curated data — they have no directory listing to open.
const HOSPITALS_FILTER_ID = '__hospitals__'

type Props = {
  points: InputPoint[]
  userLocation: LatLng | null
  /** Called when the user taps a listing row — opens that listing's detail card
   *  in the category directory. Not fired for hospitals (no directory entry).
   *  Ignored when `onSelectPlace` is provided. */
  onViewListing?: (categoryId: string, listingId: string) => void
  /** When provided, tapping a row calls this instead of onViewListing — the
   *  mobile map's bottom sheet uses it to show details inline over the map
   *  instead of navigating away to the category directory. Desktop's Nearby
   *  tab leaves this unset and keeps the normal navigate-away behavior. */
  onSelectPlace?: (point: ScoredPoint) => void
}

function distanceLabel(miles: number): string {
  if (miles < 0.05) return 'You are here'
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`
  return `${(Math.round(miles * 10) / 10).toFixed(1)} mi`
}

export default function NearbyList({ points, userLocation, onViewListing, onSelectPlace }: Props) {
  const sorted = useMemo<ScoredPoint[]>(() => {
    const scored = points.map((p) => ({
      ...p,
      miles: userLocation ? haversineMiles(userLocation, { lat: p.lat, lng: p.lng }) : null,
    }))
    return scored.sort((a, b) => {
      if (a.miles === null && b.miles === null) {
        return (b.raw?.upvotes ?? 0) - (a.raw?.upvotes ?? 0) || a.name.localeCompare(b.name)
      }
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
        const canViewListing = !!(onSelectPlace || onViewListing) && p.filterId !== HOSPITALS_FILTER_ID

        return (
          <div key={p.id} className="flex items-stretch gap-2 px-4 py-3">
            {/* Name + category + address — tappable when a directory exists.
                Icon lives inside the button too so the whole left cluster is
                one tap target, Google-Maps-style, not just the text. */}
            <button
              onClick={canViewListing ? () => (onSelectPlace ? onSelectPlace(p) : onViewListing!(p.filterId, p.id)) : undefined}
              disabled={!canViewListing}
              className={`flex min-w-0 flex-1 items-center gap-3 text-left ${canViewListing ? 'cursor-pointer group' : 'cursor-default'}`}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: p.color + '22' }}
                aria-hidden="true"
              >
                {p.glyph ?? '📍'}
              </span>
              <span className="min-w-0 flex-1">
                <p className={`text-sm font-semibold leading-tight ${canViewListing ? 'text-slate-900 group-hover:text-blue-600 transition-colors' : 'text-slate-900'}`}>
                  {p.name}
                  {canViewListing && (
                    <span className="ml-1 text-slate-300 group-hover:text-blue-400 transition-colors text-xs">›</span>
                  )}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {p.categoryLabel}
                  {p.address ? ` · ${p.address}` : ''}
                </p>
              </span>
            </button>

            {/* Distance + Directions — a quiet round icon button, not a
                labeled blue pill, so it reads like Google Maps' understated
                directions shortcut instead of competing with the row tap target. */}
            <div className="flex shrink-0 flex-col items-center justify-center gap-1 ml-1">
              {p.miles !== null && (
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: p.color }}>
                  {distanceLabel(p.miles)}
                </span>
              )}
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Directions to ${p.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300 transition-colors"
              >
                <DirectionsIcon className="h-4 w-4" />
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}
