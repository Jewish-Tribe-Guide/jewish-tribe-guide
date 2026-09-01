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
type ContentDragState = DragState & { active: boolean }

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
   *  making it clear which listing on the map the sheet is showing. `frame`
   *  says whether this selection should also reframe the map's camera (a
   *  list row tap) or leave it where it was (a pin tapped on the map). */
  onSelectionChange?: (point: Point | null, frame?: boolean) => void
  /** Reports the sheet's current (target, not mid-drag) px height upward —
   *  ResourceMapView forwards this to ResourceMap so it can center a newly
   *  selected pin within the visible strip of map ABOVE the sheet, instead of
   *  the whole container's center (which the sheet mostly covers at half/full). */
  onHeightChange?: (px: number) => void
}

export type MobileNearbySheetHandle = {
  /** Selects a place, raising the sheet to 'half' only if it's currently
   *  collapsed — called when a marker is tapped directly on the map, so a
   *  pin tap and a list-row tap land in the same spot (see ResourceMapView's
   *  onSelectPoint wiring to ResourceMap). `frame` defaults to true; pass
   *  false for a pin tapped on the map, so the camera stays put. */
  selectPoint: (point: Point, frame?: boolean) => void
  /** Clears the selected place without touching the snap point — called when
   *  a second tap lands on the pin that's already selected, so the sheet
   *  falls back to the nearby list at whatever height it was already at
   *  (same as swiping left on the place's card). */
  deselectPoint: () => void
  /** Collapses the sheet and clears any selected place — called both when
   *  clearing the search box (resets back to the default browse state) and
   *  when the visitor taps empty map while viewing a place's card (see
   *  ResourceMap's onBackgroundClick) — that tap counts as unselecting the
   *  place, same as tapping its pin again would. */
  collapse: () => void
  /** Drops the sheet to 'peek' WITHOUT clearing a selected place — used
   *  while the visitor is actively typing in the search box, so the sheet
   *  gets out from under the search box/dropdown without losing whatever
   *  place was already selected; dismissing the keyboard brings it right
   *  back to where it was (see the mobile search input's onFocus). */
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
  { points, userLocation, onViewListing, categories, containerHeight, onSelectionChange, onHeightChange },
  ref,
) {
  const [snap, setSnap] = useState<Snap>('peek')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const contentDragRef = useRef<ContentDragState | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Point | null>(null)
  // Read via a ref, like ResourceMap's own callback props, so this effect
  // only re-fires when the selection itself changes, not on every parent
  // render that happens to pass a new inline function identity.
  const onSelectionChangeRef = useRef(onSelectionChange)
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange }, [onSelectionChange])
  // Set synchronously by selectPlace, just before setSelected — by the time
  // this effect runs (after the resulting commit), it already holds the
  // frame decision for whichever selection just landed.
  const selectedFrameRef = useRef(true)
  useEffect(() => {
    onSelectionChangeRef.current?.(selected, selectedFrameRef.current)
  }, [selected])

  const heights: Record<Snap, number> = {
    peek: PEEK_PX,
    half: Math.max(PEEK_PX, Math.round(containerHeight * 0.45)),
    full: Math.max(PEEK_PX, containerHeight - TOP_INSET_PX),
  }
  const currentHeight = dragHeight ?? heights[snap]

  // Report the settled (target, not mid-drag) height upward — deliberately
  // keyed off `snap`/`heights[snap]`, not the live `currentHeight`, so a
  // finger-drag doesn't spam the parent with a value mid-gesture; it only
  // updates once a drag actually settles on a new snap point.
  //
  // Capped at `half` even when the sheet is actually `full`: selecting a
  // place while full only leaves the sliver above TOP_INSET_PX visible, so
  // "centered in what's left" would cram the pin into a few dozen px at the
  // very top of the map. In practice a visitor who picks a place while full
  // drags the sheet back down to see it, landing at (or below) half anyway —
  // so centering as if it were already at half gives a sane result for where
  // they're about to end up, instead of an unusable one for where they are
  // right now.
  const onHeightChangeRef = useRef(onHeightChange)
  useEffect(() => { onHeightChangeRef.current = onHeightChange }, [onHeightChange])
  useEffect(() => {
    onHeightChangeRef.current?.(snap === 'full' ? heights.half : heights[snap])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, containerHeight])

  // Selecting a place gets its own history entry, so a swipe-back/browser-
  // back gesture returns to the list instead of leaving the map screen
  // entirely — same pattern the admin category editor's preview mode uses
  // (see CategoryEditor's openPreview/closePreview). Only pushed on the
  // null → selected transition: tapping a DIFFERENT place while one's
  // already open swaps it in place, it doesn't stack a second entry —
  // "back" means "back to the list", one step, not "back through every
  // place visited". MapPlaceDetail's own Edit/Report forms push a second,
  // nested entry the same way, so a swipe back from there lands on this
  // place's detail, not the list.
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      if (!(e.state as { mapSheetOpen?: boolean } | null)?.mapSheetOpen) setSelected(null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function selectPlace(point: Point, frame = true) {
    selectedFrameRef.current = frame
    if (selected === null) history.pushState({ ...(window.history.state ?? {}), mapSheetOpen: true }, '')
    setSelected(point)
    // Only raise a collapsed sheet — if it's already half or full (the
    // visitor deliberately expanded it, e.g. browsing the full list), picking
    // a place shouldn't shrink it back down, same as the Google Maps app.
    setSnap((prev) => (prev === 'peek' ? 'half' : prev))
  }

  // Leaving the selected-place state undoes the history entry selectPlace
  // pushed instead of clearing `selected` directly — history.back() is what
  // fires the popstate listener above, which is the one place that actually
  // clears it, so a real swipe-back and tapping "Back to list" go through
  // the exact same path and can't drift apart from each other.
  function clearSelection() {
    if ((window.history.state as { mapSheetOpen?: boolean } | null)?.mapSheetOpen) history.back()
    else setSelected(null)
  }

  function deselectPoint() {
    clearSelection()
  }

  function collapse() {
    clearSelection()
    setSnap('peek')
  }

  function lower() {
    setSnap('peek')
  }

  function raise() {
    // Clears any previously-selected place — a new search that resolves to
    // several results should show that list, not leave an old place's card
    // sitting on screen from before this search started.
    clearSelection()
    setSnap((prev) => (prev === 'peek' ? 'half' : prev))
  }

  useImperativeHandle(ref, () => ({ selectPoint: selectPlace, deselectPoint, collapse, lower, raise }))

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

  // A cancel is not a completed gesture — the browser is saying it took the
  // touch over for something else (most commonly: recognizing an edge swipe
  // as its own back-navigation, mid-drag). Committing it the same way a real
  // release commits — cycling the snap point on what onPointerUp would read
  // as "just a tap", or resolving a partial vertical wobble into a snap
  // change — is what used to make swiping back visibly jump the sheet to
  // a different height than a plain "Back to list" tap leaves it at, even
  // though both end up clearing the same selection afterward. Just drop the
  // drag instead: `snap` (and so the sheet's rendered height) never changed,
  // so leaving dragHeight null lands it back exactly where it started.
  function onPointerCancel() {
    dragRef.current = null
    setDragHeight(null)
  }

  /** Google Maps' bottom sheet swallows all vertical drags until it's fully
   *  expanded — dragging over the list just grows the sheet instead of
   *  scrolling it. Only once full does the list scroll normally, and even
   *  then, dragging down once you're already scrolled to the top hands
   *  control back to the sheet so it collapses instead of doing nothing.
   *
   *  (A leftward swipe over this area used to also act as "back to list"
   *  while a place was selected, as a gesture alternative to the button. It
   *  was removed: on a real phone it competes with the browser/OS's own
   *  "swipe to go back" navigation gesture, which can win the race and
   *  navigate away entirely instead of just deselecting — confusing and not
   *  reliably fixable from here. "Back to list" is the one way back now.) */
  function onContentPointerDown(e: React.PointerEvent) {
    // Deliberately NOT capturing here (unlike the handle's own
    // onPointerDown) — a previous attempt at that broke NearbyList's own
    // swipe-to-reveal-pin/share gesture on each row. That gesture defers its
    // own setPointerCapture until it's clearly horizontal (see its
    // onPointerMove), specifically so a vertical drag over a row still
    // reaches this handler instead of being stolen. Capturing here
    // unconditionally on every touchdown wins that race before the row ever
    // gets to decide, so every row-swipe attempt got treated as a sheet-drag
    // instead. Pointer capture is one-winner-takes-all per pointer id, and
    // bubbling still reaches this ancestor either way, so leaving it to
    // whichever gesture actually claims itself (this one via `active`
    // becoming true, the row's via clear horizontal movement) is what lets
    // both live on the same touch surface.
    contentDragRef.current = { ...startDrag(e.clientY, e.timeStamp), active: snap !== 'full' }
  }

  function onContentPointerMove(e: React.PointerEvent) {
    const drag = contentDragRef.current
    if (!drag) return
    trackDrag(drag, e.clientY, e.timeStamp)

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

  function onContentPointerUp() {
    const drag = contentDragRef.current
    contentDragRef.current = null
    if (!drag) return
    if (!drag.moved || !drag.active) return
    setSnap(resolveSnap(drag, dragHeight ?? heights[snap]))
    setDragHeight(null)
  }

  // Same reasoning as the drag-handle's own onPointerCancel: a cancel means
  // the browser took the touch over mid-gesture (an edge swipe recognized as
  // back-navigation is the common case here, since this content area spans
  // right up to the screen edge) — drop the drag without resolving it into a
  // snap change, so the sheet's height is untouched by a gesture that never
  // actually completed as a resize.
  function onContentPointerCancel() {
    contentDragRef.current = null
    setDragHeight(null)
  }

  const selectedCategory = selected ? categories.find((c) => c.id === selected.filterId) : undefined

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.18)] desktop:hidden"
      style={{
        height: currentHeight,
        transition: dragHeight === null ? 'height 280ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
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
        onPointerCancel={onContentPointerCancel}
        style={{ touchAction: snap === 'full' ? 'pan-y' : 'none' }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        {selected && selected.raw && selectedCategory ? (
          <MapPlaceDetail
            item={selected.raw}
            category={selectedCategory}
            color={selected.color}
            onBack={clearSelection}
          />
        ) : (
          <NearbyList points={points} userLocation={userLocation} onViewListing={onViewListing} onSelectPlace={selectPlace} />
        )}
      </div>
    </div>
  )
})

export default MobileNearbySheet
