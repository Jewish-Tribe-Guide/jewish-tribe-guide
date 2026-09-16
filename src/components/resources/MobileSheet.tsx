'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

type Props = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Opts into a drag handle that resizes the sheet between a 'half' and
   *  'full' snap point, with a drag-down-past-half gesture closing it —
   *  the same three-outcome shape MobileNearbySheet's own handle resolves
   *  to (its 'peek' just isn't one of them: that state exists there so a
   *  place stays glanceable while browsing the map, which has no
   *  equivalent for a form you explicitly opened — there's nothing to
   *  glance at, only "bigger" or "gone"). Off by default: ReportSheet's
   *  short form has no real use for the extra height `full` would give it,
   *  so it keeps the plain fixed-to-content sizing this shell always had.
   *  FindResources turns it on for Edit/Report, where a longer form
   *  benefits from the extra room. See this component's own doc below for
   *  why the drag math itself isn't shared with MobileNearbySheet's. */
  draggable?: boolean
}

type Snap = 'half' | 'full'
// `history`: recent (y, t) samples, oldest first, pruned to the last
// VELOCITY_WINDOW_MS — same windowed-velocity approach as MobileNearbySheet's
// own trackDrag, for the same reason (see that file's comment): a flick's
// very last sample is often a small settling motion, so instantaneous
// (two-sample) velocity reads slower than the flick actually was.
type DragState = {
  startY: number
  startHeight: number
  moved: boolean
  lastY: number
  lastT: number
  velocity: number
  history: { y: number; t: number }[]
}

// Fractions of the viewport, matching the 85vh cap this shell (and
// ActionDialog/ReportSheet) already use for their own non-draggable "full"
// sizing — full stays visually consistent with that, half just claims
// roughly the bottom of the screen.
const HALF_FRACTION = 0.5
const FULL_FRACTION = 0.85
// Below this fraction of `half`'s own height, a released drag closes the
// sheet instead of snapping back to `half` — roughly "dragged down to about
// a quarter of the screen", the same ballpark iOS's own sheet dismiss
// threshold sits at.
const DISMISS_FRACTION = 0.5
const FLING_VELOCITY = 0.5
const VELOCITY_WINDOW_MS = 80
// Floor so a fast drag never collapses the sheet to (or past) zero height
// before onPointerUp gets a chance to resolve the gesture into a dismiss.
const MIN_DRAG_PX = 80

/** Mobile's shared bottom-sheet shell — a fixed-height panel sliding up over
 *  the still-visible (dimmed) screen underneath. Used by ReportSheet (its
 *  original, only caller — always non-draggable, see `draggable`'s own doc)
 *  and by FindResources' own mobile Edit/Report, which used to be a flat
 *  full-screen overlay before the map's own in-sheet Edit made the mismatch
 *  obvious — see FindResources' own doc.
 *
 *  The drag math (`draggable: true`) is its own, deliberately NOT extracted
 *  to share with MobileNearbySheet's: that one also has to arbitrate between
 *  dragging the sheet and scrolling a list inside it (a real map underneath,
 *  worth trading space with, needing its own momentum-scroll physics once
 *  handed off) — this one only ever drags from a dedicated handle, so
 *  there's no handoff to arbitrate and the content underneath just scrolls
 *  natively. Smaller problem, smaller solution; forcing them through one
 *  shared implementation would mean the simple case carrying the complex
 *  one's machinery for no benefit. */
export default function MobileSheet({ isOpen, onClose, title, children, draggable = false }: Props) {
  useBodyScrollLock(isOpen)

  const [snap, setSnap] = useState<Snap>('half')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [viewportH, setViewportH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))

  // Resets to `half` every time the sheet opens — same as an iOS sheet
  // returning to its default detent rather than remembering where a
  // PREVIOUS open left it, which would read as the sheet "forgetting" to
  // open at a sane size. Adjusted during render (the React-docs-recommended
  // way to reset state on a prop change) rather than in an effect, which
  // would commit one frame at the stale snap/height before its setState
  // took effect — a flash from `full` back down to `half` on every open,
  // not just a lint preference.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setSnap('half')
      setDragHeight(null)
    }
  }

  useEffect(() => {
    if (!draggable) return
    const onResize = () => setViewportH(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draggable])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const heights = { half: Math.round(viewportH * HALF_FRACTION), full: Math.round(viewportH * FULL_FRACTION) }
  const currentHeight = dragHeight ?? heights[snap]

  function startDrag(clientY: number, timeStamp: number): DragState {
    return { startY: clientY, startHeight: heights[snap], moved: false, lastY: clientY, lastT: timeStamp, velocity: 0, history: [{ y: clientY, t: timeStamp }] }
  }

  function trackDrag(drag: DragState, clientY: number, timeStamp: number): number {
    const delta = drag.startY - clientY
    if (Math.abs(delta) > 3) drag.moved = true
    drag.history.push({ y: clientY, t: timeStamp })
    while (drag.history.length > 2 && timeStamp - drag.history[1]!.t >= VELOCITY_WINDOW_MS) drag.history.shift()
    const oldest = drag.history[0]!
    const windowDt = timeStamp - oldest.t
    if (windowDt > 0) drag.velocity = (oldest.y - clientY) / windowDt
    drag.lastY = clientY
    drag.lastT = timeStamp
    return delta
  }

  // Three outcomes, not MobileNearbySheet's three snap points — 'dismiss'
  // stands in for the 'peek' rung it doesn't have (see this file's own
  // top-of-file doc on why). A fast-enough flick nudges one rung further in
  // its direction, same as MobileNearbySheet's own resolveSnap.
  function resolveSnap(drag: DragState, settled: number): Snap | 'dismiss' {
    const dismissPx = heights.half * DISMISS_FRACTION
    if (settled < dismissPx) return 'dismiss'
    const mid = (heights.half + heights.full) / 2
    let target: Snap | 'dismiss' = settled < mid ? 'half' : 'full'
    if (drag.velocity > FLING_VELOCITY) target = 'full'
    else if (drag.velocity < -FLING_VELOCITY) target = target === 'full' ? 'half' : 'dismiss'
    return target
  }

  function onHandlePointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = startDrag(e.clientY, performance.now())
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const delta = trackDrag(drag, e.clientY, performance.now())
    setDragHeight(Math.min(heights.full, Math.max(MIN_DRAG_PX, drag.startHeight + delta)))
  }

  function onHandlePointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (!drag.moved) {
      // A tap, not a drag — toggle between the two snap points, same
      // "tap the handle" affordance MobileNearbySheet's own handle has.
      setSnap((prev) => (prev === 'half' ? 'full' : 'half'))
      setDragHeight(null)
      return
    }
    const resolved = resolveSnap(drag, dragHeight ?? heights[snap])
    setDragHeight(null)
    if (resolved === 'dismiss') onClose()
    else setSnap(resolved)
  }

  // Same reasoning as MobileNearbySheet's own onPointerCancel: the browser
  // took the touch over mid-gesture (most commonly an edge swipe recognized
  // as back-navigation) — drop the drag without resolving it into a snap
  // change or a dismiss, so a gesture that never actually completed can't
  // close the sheet out from under an unrelated back-navigation.
  function onHandlePointerCancel() {
    dragRef.current = null
    setDragHeight(null)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-slate-900/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        className={`flex w-full flex-col rounded-t-2xl bg-white shadow-xl animate-[sheetUp_220ms_ease-out] ${draggable ? '' : 'max-h-[85vh]'}`}
        style={draggable ? { height: currentHeight, transition: dragHeight === null ? 'height 280ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none' } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {draggable && (
          <div
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerCancel}
            className="flex shrink-0 touch-none cursor-grab justify-center py-2 active:cursor-grabbing"
            role="button"
            aria-label="Drag to resize"
          >
            <span className="h-1 w-9 rounded-full bg-slate-300" aria-hidden="true" />
          </div>
        )}
        {/* A drag handle above (when `draggable`) would otherwise promise a
            drag gesture the header itself doesn't have — a plain header
            with a real close button either way, same affordance
            ListingDetailModal and ActionDialog give desktop, and the one
            thing here that still works with a keyboard/screen reader
            regardless of the handle. */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 flex cursor-pointer items-center justify-center rounded-full p-2 text-muted hover:text-slate-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
