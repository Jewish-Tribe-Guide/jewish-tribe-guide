'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { haversineMiles } from '@/lib/geo'
import CategoryIcon from '@/components/CategoryIcon'
import { PinIcon } from '@/components/icons'
import { PHOTO_FIELD_KEY } from '@/lib/categories'
import { usePinned } from '@/lib/pinnedContext'
import type { MapPoint } from './ResourceMap'
import type { DirectoryResource } from '@/types'

// Width of the pin/unpin action revealed behind a row when it's swiped left,
// matching the reveal-and-tap pattern iOS Mail uses for its row actions —
// swiping exposes the button rather than firing the action at a drag
// threshold, so a visitor scrolling the sheet vertically can't pin something
// by accident.
const REVEAL_WIDTH = 84

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
  const { toggle } = usePinned()
  // Only one row's pin action stays revealed at a time — opening a second
  // row snaps the first shut, same as iOS Mail's swipe actions.
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  const sorted = useMemo<ScoredPoint[]>(() => {
    const scored = points.map((p) => ({
      ...p,
      miles: userLocation ? haversineMiles(userLocation, { lat: p.lat, lng: p.lng }) : null,
    }))
    return scored.sort((a, b) => {
      // Pinned listings always float to the top, ahead of distance/upvote
      // ordering — that's the whole point of pinning something from here.
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
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
        const canViewListing = !!(onSelectPlace || onViewListing) && p.filterId !== HOSPITALS_FILTER_ID
        // Hospitals have no directory entry, so there's nothing to pin either.
        const canPin = p.filterId !== HOSPITALS_FILTER_ID

        return (
          <NearbyRow
            key={p.id}
            point={p}
            canViewListing={canViewListing}
            canPin={canPin}
            isOpen={openRowId === p.id}
            onOpenChange={(open) => setOpenRowId(open ? p.id : null)}
            onSelect={() => (onSelectPlace ? onSelectPlace(p) : onViewListing!(p.filterId, p.id))}
            onTogglePin={() => {
              toggle({ id: p.id, categoryId: p.filterId })
              setOpenRowId(null)
            }}
          />
        )
      })}
    </div>
  )
}

type RowProps = {
  point: ScoredPoint
  canViewListing: boolean
  canPin: boolean
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSelect: () => void
  onTogglePin: () => void
}

function NearbyRow({ point: p, canViewListing, canPin, isOpen, onOpenChange, onSelect, onTogglePin }: RowProps) {
  const [dragX, setDragX] = useState(0)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const startXRef = useRef(0)
  const startDragXRef = useRef(0)

  // Keeps the row in sync when it's closed externally (another row opened,
  // or a pin action just fired) without fighting an in-progress drag.
  useEffect(() => {
    if (!draggingRef.current) setDragX(isOpen ? -REVEAL_WIDTH : 0)
  }, [isOpen])

  function onPointerDown(e: React.PointerEvent) {
    if (!canPin) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startXRef.current = e.clientX
    startDragXRef.current = dragX
    draggingRef.current = false
    movedRef.current = false
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!canPin || startXRef.current === undefined) return
    const delta = e.clientX - startXRef.current
    if (!draggingRef.current) {
      // Only claims the gesture once it's clearly horizontal, so vertical
      // scrolling of the sheet still works normally.
      if (Math.abs(delta) < 8) return
      draggingRef.current = true
      movedRef.current = true
      // Can throw if the pointer was already released between events (fast
      // flicks) — capture is a nicety here, not required for the drag math.
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
    }
    setDragX(Math.min(0, Math.max(-REVEAL_WIDTH, startDragXRef.current + delta)))
  }

  function endDrag() {
    if (draggingRef.current) {
      const shouldOpen = dragX < -REVEAL_WIDTH / 2
      onOpenChange(shouldOpen)
      setDragX(shouldOpen ? -REVEAL_WIDTH : 0)
    }
    draggingRef.current = false
  }

  function onRowClickCapture(e: React.MouseEvent) {
    // Swallow the click that follows a drag, and use a tap on an already-open
    // row to close it instead of firing the row's normal action.
    if (movedRef.current || isOpen) {
      e.preventDefault()
      e.stopPropagation()
      movedRef.current = false
      if (isOpen) onOpenChange(false)
    }
  }

  return (
    <div className="relative overflow-hidden bg-white">
      {canPin && (
        <button
          onClick={onTogglePin}
          aria-label={p.pinned ? `Unpin ${p.name}` : `Pin ${p.name}`}
          className="absolute inset-y-0 right-0 flex w-[84px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-white"
          style={{ backgroundColor: p.pinned ? '#64748b' : '#2563eb' }}
        >
          <PinIcon filled={p.pinned} className="h-4 w-4" />
          {p.pinned ? 'Unpin' : 'Pin'}
        </button>
      )}
      <div
        className="relative flex items-stretch gap-2 bg-white px-4 py-3 touch-pan-y"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: draggingRef.current ? 'none' : 'transform 200ms ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onRowClickCapture}
      >
        {/* Name + category + address — tappable when a directory exists.
            Icon lives inside the button too so the whole left cluster is
            one tap target, Google-Maps-style, not just the text. */}
        <button
          onClick={canViewListing ? onSelect : undefined}
          disabled={!canViewListing}
          className={`flex min-w-0 flex-1 items-center gap-3 text-left ${canViewListing ? 'cursor-pointer group' : 'cursor-default'}`}
        >
          <CategoryIcon
            icon={p.glyph ?? '📍'}
            iconImageUrl={
              (typeof p.raw?.[PHOTO_FIELD_KEY] === 'string' && (p.raw[PHOTO_FIELD_KEY] as string).trim()
                ? (p.raw[PHOTO_FIELD_KEY] as string)
                : p.glyphSrc) ?? undefined
            }
            color={p.color}
            className="h-9 w-9 text-lg"
            sizePx={36}
          />
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

        {/* A small category badge + distance — a quiet color-tinted
            glyph, not a directions shortcut: the row's own tap already
            opens full details (including a real directions link), so a
            second action here just competed with it. The badge repeats
            the left icon's color/glyph in miniature purely so the
            category still reads at a glance once the photo/logo (not
            always present) isn't what's showing on the left. Badge on
            top, distance below — the badge is the more glanceable of the
            two (color/shape read faster than digits), same as the pin
            markers on the map themselves sit above their labels. */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 ml-1">
          <span
            className="relative flex h-6 w-6 items-center justify-center rounded-full text-xs"
            style={{ backgroundColor: p.color + '22' }}
            aria-hidden="true"
          >
            {p.glyph ?? '📍'}
            {/* Same small badge, same blue, as the pinned marker gets on
                the map itself (see ResourceMap's buildPin) — this row's
                own category badge is the closest equivalent spot to
                overlay it here, so "pinned" reads the same way in both
                places. */}
            {p.pinned && (
              <span
                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white text-[8px] leading-none text-white"
                style={{ backgroundColor: '#2563eb' }}
              >
                📌
              </span>
            )}
          </span>
          {p.miles !== null && (
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: p.color }}>
              {distanceLabel(p.miles)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
