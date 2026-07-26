'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import NearbyList from './NearbyList'
import MapPlaceDetail from './MapPlaceDetail'
import type { MapPoint } from './ResourceMap'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'

type Snap = 'peek' | 'half' | 'full'
type Point = MapPoint & { filterId: string; raw?: DirectoryResource }
type DragState = { startY: number; startHeight: number; moved: boolean; lastY: number; lastT: number; velocity: number }

// Collapsed height (handle + one-line summary) and how much room the 'full'
// snap leaves at the top so it never covers the floating search bar above it.
const PEEK_PX = 64
const TOP_INSET_PX = 76
const SNAP_ORDER: Snap[] = ['peek', 'half', 'full']
// Google Maps' sheet advances an extra snap point on a fast flick even if you
// release well short of it — px/ms measured over the last pointer move.
const FLING_VELOCITY = 0.5
// 'half' only claims this fraction of the full peek↔full drag range around
// its own height — see resolveSnap.
const HALF_BAND_FRACTION = 0.14

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
  /** Reports the currently-selected place (or null) upward — ResourceMapView
   *  forwards this to ResourceMap so it can highlight the matching marker,
   *  making it clear which listing on the map the sheet is showing. */
  onSelectionChange?: (point: Point | null) => void
}

export type MobileNearbySheetHandle = {
  /** Selects a place, raising the sheet to 'half' only if it's currently
   *  collapsed — called when a marker is tapped directly on the map, so a
   *  pin tap and a list-row tap land in the same spot (see ResourceMapView's
   *  onSelectPoint wiring to ResourceMap). */
  selectPoint: (point: Point) => void
  /** Collapses the sheet and clears any selected place — called when
   *  clearing the search box, so it resets back to the default browse state. */
  collapse: () => void
  /** Drops the sheet to 'peek' WITHOUT clearing a selected place — called
   *  when the visitor taps empty map while viewing a place's card. Dragging
   *  back up brings the same place back, rather than losing it in favor of
   *  the plain nearby list (see ResourceMap's onBackgroundClick). */
  lower: () => void
  /** Clears any selected place and raises a collapsed sheet to 'half' —
   *  called when a search narrows to several results, so the list becomes
   *  visible (instead of staying hidden behind the peek handle) and replaces
   *  whatever single place's card might have been showing from a previous
   *  search. */
  raise: () => void
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
 * straight to half. Selecting a place — from the list or by tapping its pin
 * — shows its full details right here (see MapPlaceDetail) instead of
 * navigating away to the category directory, snapping to 'half' so the map
 * is still visible underneath.
 */
const MobileNearbySheet = forwardRef<MobileNearbySheetHandle, Props>(function MobileNearbySheet(
  { points, userLocation, onViewListing, categories, containerHeight, onSelectionChange },
  ref,
) {
  const [snap, setSnap] = useState<Snap>('peek')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const contentDragRef = useRef<(DragState & { active: boolean; startX: number; lockedDir: 'horizontal' | 'vertical' | null }) | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Point | null>(null)
  // Read via a ref, like ResourceMap's own callback props, so this effect
  // only re-fires when the selection itself changes, not on every parent
  // render that happens to pass a new inline function identity.
  const onSelectionChangeRef = useRef(onSelectionChange)
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange }, [onSelectionChange])
  useEffect(() => {
    onSelectionChangeRef.current?.(selected)
  }, [selected])
  const selectedRef = useRef(selected)
  useEffect(() => { selectedRef.current = selected }, [selected])

  const heights: Record<Snap, number> = {
    peek: PEEK_PX,
    half: Math.max(PEEK_PX, Math.round(containerHeight * 0.45)),
    full: Math.max(PEEK_PX, containerHeight - TOP_INSET_PX),
  }
  const currentHeight = dragHeight ?? heights[snap]

  function selectPlace(point: Point) {
    setSelected(point)
    // Only raise a collapsed sheet — if it's already half or full (the
    // visitor deliberately expanded it, e.g. browsing the full list), picking
    // a place shouldn't shrink it back down, same as the Google Maps app.
    setSnap((prev) => (prev === 'peek' ? 'half' : prev))
  }

  function collapse() {
    setSelected(null)
    setSnap('peek')
  }

  function lower() {
    setSnap('peek')
  }

  function raise() {
    // Clears any previously-selected place — a new search that resolves to
    // several results should show that list, not leave an old place's card
    // sitting on screen from before this search started.
    setSelected(null)
    setSnap((prev) => (prev === 'peek' ? 'half' : prev))
  }

  useImperativeHandle(ref, () => ({ selectPoint: selectPlace, collapse, lower, raise }))

  function startDrag(clientY: number, timeStamp: number): DragState {
    return { startY: clientY, startHeight: heights[snap], moved: false, lastY: clientY, lastT: timeStamp, velocity: 0 }
  }

  /** Advances a drag state to a new pointer position, returning the
   *  startY-relative delta (positive = finger moved up). */
  function trackDrag(drag: DragState, clientY: number, timeStamp: number): number {
    const delta = drag.startY - clientY
    if (Math.abs(delta) > 3) drag.moved = true
    const dt = timeStamp - drag.lastT
    if (dt > 0) drag.velocity = (drag.lastY - clientY) / dt // px/ms, positive = growing
    drag.lastY = clientY
    drag.lastT = timeStamp
    return delta
  }

  /** Picks the snap point a drag settles on. 'half' only claims a narrow band
   *  around its own height — everywhere else in the drag range resolves to
   *  peek or full instead, so a drag from full mostly falls straight to peek
   *  (the common "close the sheet" gesture) and only a careful release right
   *  near half actually stops there, same asymmetry Google Maps' sheet has.
   *  A fast-enough flick then nudges one step further in its direction. */
  function resolveSnap(drag: DragState, settled: number): Snap {
    const band = (heights.full - heights.peek) * HALF_BAND_FRACTION
    let index = settled < heights.half - band ? 0 : settled > heights.half + band ? 2 : 1
    if (drag.velocity > FLING_VELOCITY) index = Math.min(index + 1, SNAP_ORDER.length - 1)
    else if (drag.velocity < -FLING_VELOCITY) index = Math.max(index - 1, 0)
    return SNAP_ORDER[index]
  }

  function onPointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = startDrag(e.clientY, e.timeStamp)
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const delta = trackDrag(drag, e.clientY, e.timeStamp)
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
    setSnap(resolveSnap(drag, dragHeight ?? heights[snap]))
    setDragHeight(null)
  }

  /** Google Maps' bottom sheet swallows all vertical drags until it's fully
   *  expanded — dragging over the list just grows the sheet instead of
   *  scrolling it. Only once full does the list scroll normally, and even
   *  then, dragging down once you're already scrolled to the top hands
   *  control back to the sheet so it collapses instead of doing nothing.
   *
   *  This same content area also catches a leftward swipe as "back to list"
   *  while a place is selected — same action as tapping "Back to list", but
   *  as a gesture. It's handled here (covering the sheet's full content
   *  area) rather than inside MapPlaceDetail itself, so it still works over
   *  blank space below a short place's card, not just over its text. */
  function onContentPointerDown(e: React.PointerEvent) {
    contentDragRef.current = { ...startDrag(e.clientY, e.timeStamp), active: snap !== 'full', startX: e.clientX, lockedDir: null }
  }

  function onContentPointerMove(e: React.PointerEvent) {
    const drag = contentDragRef.current
    if (!drag) return
    trackDrag(drag, e.clientY, e.timeStamp)

    // Decide, once, whether this gesture is the swipe-back (horizontal) or
    // the sheet's usual vertical drag/scroll. A real thumb swipe often has a
    // few px of vertical wobble before it straightens out, so horizontal
    // only locks in once it's clearly (not just barely) the dominant axis;
    // vertical keeps the sheet's normal quick response since that's the
    // common case. Left unlocked, small ambiguous movement falls through to
    // the vertical handling below same as before, until one side wins.
    if (drag.lockedDir === null) {
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)
      if (selected && adx > 16 && adx > ady * 1.3) drag.lockedDir = 'horizontal'
      else if (ady > 10 && ady >= adx) drag.lockedDir = 'vertical'
    }
    if (drag.lockedDir === 'horizontal') return // resolved at pointerup

    if (!drag.active) {
      // Only armed when snap === 'full' (see onContentPointerDown) — hand
      // control to the sheet once the list is scrolled to the top and the
      // drag continues downward.
      const atTop = (contentRef.current?.scrollTop ?? 0) <= 0
      if (atTop && drag.startY - e.clientY < -3) {
        drag.active = true
        drag.startY = e.clientY
        drag.startHeight = heights.full
      }
      return
    }

    if (contentRef.current) contentRef.current.scrollTop = 0
    setDragHeight(Math.min(heights.full, Math.max(PEEK_PX, drag.startHeight + (drag.startY - e.clientY))))
  }

  function onContentPointerUp(e: React.PointerEvent) {
    const drag = contentDragRef.current
    contentDragRef.current = null
    if (!drag) return
    if (drag.lockedDir === 'horizontal') {
      if (selected && e.clientX - drag.startX < -60) setSelected(null)
      setDragHeight(null)
      return
    }
    if (!drag.moved || !drag.active) return
    setSnap(resolveSnap(drag, dragHeight ?? heights[snap]))
    setDragHeight(null)
  }

  // On a real phone, a horizontal drag here can otherwise be hijacked by the
  // browser's own "swipe to go back" navigation gesture (landing you on the
  // previous page entirely, not our in-app back-to-list) — React's onTouchMove
  // is passive by default so calling preventDefault from a JSX handler is a
  // silent no-op; only a manually-attached, non-passive native listener can
  // actually cancel it. Deliberately more eager than the pointermove lock
  // above (which decides whether WE treat it as a swipe-back): better to
  // suppress the browser's gesture a little early than let it hijack the
  // touch before our own logic finishes deciding.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    function onTouchMove(e: TouchEvent) {
      if (!selectedRef.current) return
      const drag = contentDragRef.current
      const touch = e.touches[0]
      if (!drag || !touch) return
      const dx = touch.clientX - drag.startX
      const dy = touch.clientY - drag.startY
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const selectedCategory = selected ? categories.find((c) => c.id === selected.filterId) : undefined

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.18)] sm:hidden"
      style={{
        height: currentHeight,
        transition: dragHeight === null ? 'height 280ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
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
      <div
        ref={contentRef}
        onPointerDown={onContentPointerDown}
        onPointerMove={onContentPointerMove}
        onPointerUp={onContentPointerUp}
        onPointerCancel={onContentPointerUp}
        style={{ touchAction: snap === 'full' ? 'pan-y' : 'none' }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
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
})

export default MobileNearbySheet
