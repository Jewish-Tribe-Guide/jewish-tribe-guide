'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
   *  glance at, only "bigger" or "gone"). Off by default: a short form
   *  has no real use for the extra height `full` would give it,
   *  so it keeps the plain fixed-to-content sizing this shell always had.
   *  FindResources turns it on for Edit/Report, where a longer form
   *  benefits from the extra room. See this component's own doc below for
   *  why the drag math itself isn't shared with MobileNearbySheet's. */
  draggable?: boolean
  /** Drops the header row, leaving only the drag handle, for content that
   *  opens with its own heading: a listing, whose name at the top of its
   *  own view is the title (see GenericListingCard's mobile sheet). `title`
   *  still names the dialog for a screen reader. Only meaningful together
   *  with `draggable` — without it there'd be nothing left to close the
   *  sheet with but the backdrop and Escape, since the header is where the
   *  non-draggable ✕ lives. */
  titleHidden?: boolean
}

type Snap = 'half' | 'full'
// 'open': fully visible, driven by the header/handle/content drags below.
// 'closing': isOpen just went false — still mounted and rendering, height
// shrinking to 0 via the same transition the open/snap states already use
// (see currentHeight below), until the timeout in the phase effect flips it
// to 'closed'. 'closed': unmounted (returns null). Three states instead of a
// plain isOpen boolean because a close needs to stay ON SCREEN long enough
// to animate off it — see this file's own note on why "poofs away" was the
// bug: this component used to unmount the instant isOpen went false, well
// before an exit transition could ever be seen.
type Phase = 'open' | 'closing' | 'closed'
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
type ContentDragState = DragState & { active: boolean }

// `half` claims roughly the bottom of the screen. `full` used to be a flat
// 85% of the viewport (matching the 85vh cap ActionDialog's own
// non-draggable sizing uses), but that reads as leaving an oddly large gap
// at the top — ~120px on a typical phone, well past what an actual sheet
// needs to still read as a sheet rather than a full screen. TOP_INSET_PX
// below is the same fixed inset MobileNearbySheet's own 'full' already
// uses (see that file's own constant), for the same reason: a flat
// percentage grows/shrinks the gap with screen height for no purpose, where
// a fixed inset stays a consistent-looking sliver of backdrop regardless of
// device.
const HALF_FRACTION = 0.5
const TOP_INSET_PX = 76
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
// The one height-transition duration this file uses, for every height
// change that isn't a raw finger drag: opening, snapping between half/full
// on release, AND closing (height 0) — a single constant rather than a
// separate "close" duration, same as MobileNearbySheet uses one duration
// for all of ITS height snaps. Also doubles as the unmount timer below, so
// the close transition and the moment this actually leaves the DOM agree.
const SNAP_DURATION_MS = 280
// Same decay/threshold constants as MobileNearbySheet's own momentum coast
// — see startMomentum's doc for what they mean and why a real physics sim
// isn't needed here either.
const MOMENTUM_FRICTION = 0.996
const MOMENTUM_MIN_VELOCITY = 0.02

/** Mobile's shared bottom-sheet shell — a fixed-height panel sliding up over
 *  the still-visible (dimmed) screen underneath. Used by FindResources' own
 *  mobile Add/Edit (and originally by a since-removed non-draggable Report
 *  sheet — see `draggable`'s own doc), which used to be a flat
 *  full-screen overlay before the map's own in-sheet Edit made the mismatch
 *  obvious — see FindResources' own doc.
 *
 *  The drag math (`draggable: true`) used to be its own, deliberately NOT
 *  shared with MobileNearbySheet's — this only ever dragged from a dedicated
 *  handle, so there was no handoff to arbitrate and the content underneath
 *  just scrolled natively. That stopped being true once a real visitor
 *  compared the two side by side: pulling down from inside the form, once
 *  already scrolled to its top, tried to rubber-band the form's own content
 *  instead of resizing/dismissing the sheet the way the map's list already
 *  does — see onContentPointerDown's own doc for why the fix is the same
 *  hand-driven-scroll takeover MobileNearbySheet uses, not a smaller one. */
export default function MobileSheet({ isOpen, onClose, title, children, draggable = false, titleHidden = false }: Props) {
  const [phase, setPhase] = useState<Phase>(isOpen ? 'open' : 'closed')
  useBodyScrollLock(phase !== 'closed')

  const [snap, setSnap] = useState<Snap>('half')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const contentDragRef = useRef<ContentDragState | null>(null)
  const momentumFrameRef = useRef<number | null>(null)
  const [viewportH, setViewportH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))

  // Resets to `half` every time the sheet opens — same as an iOS sheet
  // returning to its default detent rather than remembering where a
  // PREVIOUS open left it, which would read as the sheet "forgetting" to
  // open at a sane size. Adjusted during render (the React-docs-recommended
  // way to reset state on a prop change) rather than in an effect, which
  // would commit one frame at the stale snap/height before its setState
  // took effect — a flash from `full` back down to `half` on every open,
  // not just a lint preference. The close side can't follow the same
  // render-time pattern — going straight to 'closed' here would be exactly
  // the "poofs away" bug this exists to fix — so it goes through the
  // effect below instead, timed to the exit transition.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setPhase('open')
      setSnap('half')
      setDragHeight(null)
    } else {
      setPhase('closing')
    }
  }

  useEffect(() => {
    if (phase !== 'closing') return
    const timer = setTimeout(() => setPhase('closed'), SNAP_DURATION_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // Every dismiss gesture in this file (the close button, a backdrop tap,
  // Escape, dragging past the threshold) goes through this instead of
  // calling `onClose` directly. `onClose` is FindResources' own
  // goToCategoryList — it clears local state AND pushes a URL change
  // (?form=null), and that URL change is what eventually flips the `isOpen`
  // PROP this component reads. Waiting for that prop to come back around
  // before starting the exit transition (the `isOpen !== wasOpen` check
  // below still exists for exactly that path) meant the sheet just sat
  // there, fully open, for however long the round trip through
  // FindResources' router.push and its own re-render actually took —
  // confirmed live as a real, measurable gap (the sheet's own height was
  // still untouched 150ms after tapping Close), not a rendering illusion.
  // What reads as "it still kind of fades instead of sliding" is that gap:
  // the close animation was starting late, and often lost its own frames to
  // whatever heavier work (the list re-rendering underneath) landed in the
  // same tick once the prop finally did flip. Starting the local animation
  // immediately, in the same event that decided to dismiss, makes the
  // visible motion depend on nothing but this component's own timer.
  const close = useCallback(() => {
    setPhase('closing')
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!draggable) return
    const onResize = () => setViewportH(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draggable])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  const halfPx = Math.round(viewportH * HALF_FRACTION)
  // max: on a short viewport, viewportH - TOP_INSET_PX could fall below
  // half — a fixed viewport-independent inset has no such floor built in
  // the way a fraction naturally would. Same guard MobileNearbySheet's own
  // full-height calc has (there against its own peek).
  const heights = { half: halfPx, full: Math.max(halfPx, viewportH - TOP_INSET_PX) }
  // Closing shrinks height to 0 rather than switching to some other
  // mechanism (a transform-based slide, say) — see close()'s own doc for
  // why: whatever height a drag-to-dismiss was ALREADY mid-shrinking
  // through when it crossed the threshold is exactly where this continues
  // from, with nothing to jump or snap back to first.
  const currentHeight = phase === 'closing' ? 0 : (dragHeight ?? heights[snap])

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

  function stopMomentum() {
    if (momentumFrameRef.current !== null) {
      cancelAnimationFrame(momentumFrameRef.current)
      momentumFrameRef.current = null
    }
  }

  // Coasts the form content the rest of the way on a flick, the way native
  // momentum scrolling would — needed because onContentPointerMove now
  // drives scrollTop by hand instead of letting the browser's own
  // touch-action: pan-y panning do it (see that function's own comment on
  // why). Not a real physics simulation — exponential decay until it's
  // imperceptible or the content runs out of room. Copied from
  // MobileNearbySheet's own startMomentum rather than shared with it for the
  // same reason the rest of this file's drag math isn't: same shape, no
  // caller in common to justify the extraction.
  function startMomentum(initialVelocity: number) {
    stopMomentum()
    let velocity = initialVelocity
    let lastT = performance.now()
    function step(now: number) {
      const dt = now - lastT
      lastT = now
      velocity *= Math.pow(MOMENTUM_FRICTION, dt)
      const el = contentRef.current
      if (!el || Math.abs(velocity) < MOMENTUM_MIN_VELOCITY) {
        momentumFrameRef.current = null
        return
      }
      const max = el.scrollHeight - el.clientHeight
      const next = el.scrollTop + velocity * dt
      if (next <= 0 || next >= max) {
        el.scrollTop = Math.max(0, Math.min(next, max))
        momentumFrameRef.current = null
        return
      }
      el.scrollTop = next
      momentumFrameRef.current = requestAnimationFrame(step)
    }
    momentumFrameRef.current = requestAnimationFrame(step)
  }

  useEffect(() => stopMomentum, [])

  // The handle bar alone is a real but small target — noticeably smaller
  // than what dragging the map's own sheet actually feels like, which gets
  // its "grab anywhere" feel from handing a scrolled-to-top list's own drag
  // off to the sheet (see onContentPointerDown below), not from a bigger
  // handle there either. This has no such list to hand off from at the
  // header, so the same feel comes from making the whole header a drag
  // surface instead — the same "grab the header/art area" affordance
  // Spotify's now-playing sheet has. The button guard predates the header
  // losing its own close button (draggable sheets don't render one — see
  // the header's own doc below) but stays regardless, harmlessly, in case
  // a future draggable header ever adds one back.
  function onHandlePointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    stopMomentum()
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
    if (resolved === 'dismiss') close()
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

  /** Google Maps' own bottom sheet swallows all vertical drags over its list
   *  until it's fully expanded — dragging the content just grows the sheet
   *  instead of scrolling it, and only once full does the list scroll
   *  normally (see MobileNearbySheet's identically-named handler, which
   *  this now matches exactly instead of only partially). A form has no
   *  "browse without committing to full height" case the way a map's
   *  nearby-list does, so the same rule applies here unchanged: `active`
   *  starts true whenever snap isn't already 'full', meaning ANY drag over
   *  the form at `half` resizes the sheet, never scrolls it — the only way
   *  to actually scroll a form taller than `half` is to drag it open to
   *  `full` first. At `full`, this starts passive (an ordinary scroll) and
   *  only hands back to the sheet once the content is at scrollTop 0 AND
   *  the drag keeps pulling down past it — never on the way IN to that
   *  boundary, so an ordinary scroll through a long form, or tapping/
   *  selecting text inside a field, is untouched there. The form's own
   *  scrolling is driven by hand here too (contentRef.scrollTop), not left
   *  to native touch-action: pan-y panning, for the same WebKit-rubber-
   *  band-races-a-JS-handler reason MobileNearbySheet's own
   *  onContentPointerDown documents — the handoff below has to see every
   *  increment as it happens, not after a native bounce animation has
   *  already started somewhere it can't see. */
  function onContentPointerDown(e: React.PointerEvent) {
    stopMomentum()
    // Deliberately NOT capturing here, same reasoning as
    // MobileNearbySheet's own onContentPointerDown: capturing unconditionally
    // on every touchdown would win the pointer before a field's own native
    // behavior (tapping to place a caret, long-pressing to select text) gets
    // a chance to happen at all.
    contentDragRef.current = { ...startDrag(e.clientY, performance.now()), active: snap !== 'full' }
  }

  function onContentPointerMove(e: React.PointerEvent) {
    const drag = contentDragRef.current
    if (!drag) return
    // Captured before trackDrag overwrites drag.lastY with the new position —
    // both the handoff check and the manual scroll below need the finger's
    // most recent increment, not its position relative to wherever this
    // touch originally landed.
    const prevY = drag.lastY
    trackDrag(drag, e.clientY, performance.now())
    const localDelta = e.clientY - prevY // positive = finger moved down since the last move event

    if (!drag.active) {
      const content = contentRef.current
      // Checked against the PREVIOUS move event (localDelta), not
      // drag.startY — see MobileNearbySheet's identical comment: a real
      // gesture can scroll down then back up past the top in one continuous
      // touch, and the boundary should hand off the moment THIS motion is
      // downward, regardless of which way the finger was moving earlier in
      // the same touch.
      const atTop = (content?.scrollTop ?? 0) <= 0
      if (atTop && localDelta > 1) {
        drag.active = true
        drag.startY = e.clientY
        drag.startHeight = heights[snap]
        return
      }
      // Still scrolling the form, not yet at the boundary — move it
      // ourselves instead of the browser's native pan (see this function's
      // own top-level doc). Assigning past either end just clamps, same as
      // native scrollTop already does, so no manual bounds-checking here.
      if (content) content.scrollTop -= localDelta
      return
    }

    if (contentRef.current) contentRef.current.scrollTop = 0
    setDragHeight(Math.min(heights.full, Math.max(MIN_DRAG_PX, drag.startHeight + (drag.startY - e.clientY))))
  }

  function onContentPointerUp() {
    const drag = contentDragRef.current
    contentDragRef.current = null
    if (!drag) return
    if (!drag.active) {
      // Ended as a plain content-scroll, never handed off to the sheet —
      // coast the release velocity the way native panning's own momentum
      // would have (see onContentPointerDown's doc on why that's now this
      // component's job instead of the browser's).
      if (drag.moved && Math.abs(drag.velocity) > MOMENTUM_MIN_VELOCITY) startMomentum(drag.velocity)
      return
    }
    if (!drag.moved) return
    const resolved = resolveSnap(drag, dragHeight ?? heights[snap])
    setDragHeight(null)
    if (resolved === 'dismiss') close()
    else setSnap(resolved)
  }

  // Same reasoning as onHandlePointerCancel: the browser took the touch over
  // mid-gesture (an edge swipe recognized as back-navigation is the common
  // case) — drop the drag without resolving it into a snap change or a
  // dismiss the visitor never actually completed.
  function onContentPointerCancel() {
    contentDragRef.current = null
    setDragHeight(null)
  }

  if (phase === 'closed') return null

  const isClosing = phase === 'closing'
  // draggable: height is the one thing this sheet's size/position is ever
  // expressed through — open, drag, snap-on-release, AND close (see
  // currentHeight's own doc) — so there's only ever one transition to
  // reason about, same as MobileNearbySheet never needing a second
  // mechanism for ITS own close-to-peek. Suppressed only while a finger is
  // actively driving dragHeight by hand (that path needs 1:1 tracking, not
  // a lagging transition) — closing always gets one regardless, since a
  // released drag's dragHeight has already gone back to null by the time
  // close() runs (see onHandlePointerUp/onContentPointerUp).
  //
  // Non-draggable has no height detents to shrink through (a short
  // form sizes itself to its content, not to half/full), so it keeps
  // the plain slide-down-by-its-own-height transform this shell always used
  // for closing — a fallback with no live caller today (everything real
  // currently opts into draggable), kept only because `draggable: false` is
  // still this component's own documented, supported shape.
  const style: React.CSSProperties = draggable
    ? { height: currentHeight, transition: isClosing || dragHeight === null ? `height ${SNAP_DURATION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)` : 'none' }
    : { transform: isClosing ? 'translateY(100%)' : 'translateY(0)', transition: `transform ${SNAP_DURATION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)` }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end bg-slate-900/40 transition-opacity duration-[280ms] ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
      role="presentation"
    >
      <div
        className={`flex w-full flex-col rounded-t-2xl bg-white shadow-xl ${isClosing ? '' : 'animate-[sheetUp_220ms_ease-out]'} ${draggable ? '' : 'max-h-[85vh]'}`}
        style={style}
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
        {/* draggable: the whole header is a drag surface too, not just the
            handle above it — see onHandlePointerDown's own doc for why.
            touch-none here (not just on the handle) is load-bearing: without
            it, a touch starting on the title text tries to scroll/select
            first and the drag reads as sluggish to start, exactly the
            "not smooth" gap this exists to close. No close button of its
            own — a backdrop tap, Escape, or the drag-to-dismiss this whole
            surface already offers cover it, and a redundant X read as
            visual noise once every caller here had the drag (see close()'s
            own callers for the non-pointer paths). Non-draggable (a plain
            header WITH a real close button, same affordance
            ListingDetailModal and ActionDialog give desktop — it has no
            drag to fall back on) gets none of this — nothing here to
            grab, and it keeps its own X below. */}
        {!(draggable && titleHidden) && (
          <div
            {...(draggable
              ? {
                  onPointerDown: onHandlePointerDown,
                  onPointerMove: onHandlePointerMove,
                  onPointerUp: onHandlePointerUp,
                  onPointerCancel: onHandlePointerCancel,
                }
              : {})}
            className={`flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0 ${draggable ? 'touch-none select-none cursor-grab active:cursor-grabbing' : ''}`}
          >
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {!draggable && (
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-m-2 flex cursor-pointer items-center justify-center rounded-full p-2 text-muted hover:text-slate-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div
          ref={contentRef}
          {...(draggable
            ? {
                onPointerDown: onContentPointerDown,
                onPointerMove: onContentPointerMove,
                onPointerUp: onContentPointerUp,
                onPointerCancel: onContentPointerCancel,
              }
            : {})}
          // The bottom padding clears the phone's home indicator, the way the
          // map's sheet already does: this panel runs to the screen's bottom
          // edge, and whatever ends its content (a form's Submit, a
          // listing's "Suggest an edit") would otherwise sit under it.
          className={`overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] ${draggable ? 'touch-none' : ''}`}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
