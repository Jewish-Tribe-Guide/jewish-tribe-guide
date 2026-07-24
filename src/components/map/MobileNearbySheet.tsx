'use client'

import { useRef, useState } from 'react'
import NearbyList, { type ScoredPoint } from './NearbyList'
import MapPlaceDetail from './MapPlaceDetail'
import type { MapPoint } from './ResourceMap'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'

type Snap = 'peek' | 'half' | 'full'
type Point = MapPoint & { filterId: string; raw?: DirectoryResource }

// Collapsed height (handle + one-line summary) and how much room the 'full'
// snap leaves at the top so it never covers the floating search bar above it.
const PEEK_PX = 64
const TOP_INSET_PX = 76

type Props = {
  points: Point[]
  userLocation: { lat: number; lng: number } | null
  onViewListing?: (categoryId: string, listingId: string) => void
  /** Looked up by a selected point's filterId to render its full detail panel
   *  — same category config the directory pages use, so fields/hours/tags
   *  render identically. */
  categories: CategoryConfig[]
  /** Measured px height of the map box this sheet overlays — snap points
   *  (half/full) are computed relative to it, not the viewport, since the
   *  map box itself doesn't always fill the viewport (e.g. desktop, though
   *  this sheet only ever renders on mobile). */
  containerHeight: number
}

/**
 * A draggable bottom sheet laid over the mobile map (Google-Maps-style),
 * replacing the old Map/Nearby toggle there — the map and the nearby list are
 * both always "on screen" now, and dragging the sheet trades space between
 * them instead of navigating away from one to see the other.
 *
 * Three snap points: peek (a collapsed handle + summary), half (partial
 * list, map still mostly visible), full (the list takes over). Drag ends
 * snap to whichever of the three is closest; tapping the peek handle jumps
 * straight to half. Tapping a place shows its full details right here (see
 * MapPlaceDetail) instead of navigating away to the category directory.
 */
export default function MobileNearbySheet({ points, userLocation, onViewListing, categories, containerHeight }: Props) {
  const [snap, setSnap] = useState<Snap>('peek')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragRef = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null)
  const [selected, setSelected] = useState<ScoredPoint | null>(null)

  const heights: Record<Snap, number> = {
    peek: PEEK_PX,
    half: Math.max(PEEK_PX, Math.round(containerHeight * 0.45)),
    full: Math.max(PEEK_PX, containerHeight - TOP_INSET_PX),
  }
  const currentHeight = dragHeight ?? heights[snap]

  function selectPlace(point: ScoredPoint) {
    setSelected(point)
    setSnap('full') // give the details room, same as tapping a pin in Google Maps
  }

  function onPointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startHeight: heights[snap], moved: false }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const delta = drag.startY - e.clientY // dragging up (finger moves up) grows the sheet
    if (Math.abs(delta) > 3) drag.moved = true
    setDragHeight(Math.min(heights.full, Math.max(PEEK_PX, drag.startHeight + delta)))
  }

  function onPointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (!drag.moved) {
      // A tap, not a drag — jump forward one snap point (peek → half → full),
      // or collapse straight back to peek from full.
      setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek')
      setDragHeight(null)
      return
    }
    const settled = dragHeight ?? heights[snap]
    const closest = (Object.entries(heights) as [Snap, number][]).reduce((best, [s, h]) =>
      Math.abs(h - settled) < Math.abs(heights[best] - settled) ? s : best, 'peek' as Snap)
    setSnap(closest)
    setDragHeight(null)
  }

  const selectedCategory = selected ? categories.find((c) => c.id === selected.filterId) : undefined

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.18)] sm:hidden"
      style={{
        height: currentHeight,
        transition: dragHeight === null ? 'height 200ms ease-out' : 'none',
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex shrink-0 touch-none cursor-grab flex-col items-center gap-1.5 py-2.5 active:cursor-grabbing"
        role="button"
        aria-label={snap === 'peek' ? 'Expand nearby list' : 'Drag to resize nearby list'}
      >
        <span className="h-1 w-9 rounded-full bg-slate-300" aria-hidden="true" />
        {snap === 'peek' && !selected && (
          <span className="text-xs font-medium text-slate-500">
            {points.length} place{points.length !== 1 ? 's' : ''} nearby — drag up
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {selected && selected.raw && selectedCategory ? (
          <MapPlaceDetail
            item={selected.raw}
            category={selectedCategory}
            glyph={selected.glyph}
            color={selected.color}
            onBack={() => setSelected(null)}
          />
        ) : (
          <NearbyList points={points} userLocation={userLocation} onViewListing={onViewListing} onSelectPlace={selectPlace} />
        )}
      </div>
    </div>
  )
}
