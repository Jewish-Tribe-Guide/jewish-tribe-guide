'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
  type SetStateAction,
} from 'react'
import { ExternalIcon, ThumbtackIcon } from '@/components/icons'

// ── Swipe-to-reveal for a list row — the ONE implementation ──────────────
//
// Both lists that let you swipe a row use this: the map's nearby list and
// the category directory's cards. The gesture was built and tuned for the
// map list first (NearbyList), against how iMessage and Mail feel, and the
// category cards briefly had a second, separately-written copy with a
// different feel. That was the wrong call — two implementations of one
// gesture drift apart, and every fix has to be made twice. So the map's
// version moved here unchanged, and everything that swipes renders it. A
// change to how a swipe feels or looks happens in this file, once.
//
// Deliberately a SHORTCUT, never the only route to anything it reveals. A
// gesture is invisible and can't be reached by keyboard, so everything here
// also lives in the overflow fan below an opened listing (ListingActionsFan).

/** Width of one revealed action: a circle with its caption under it, the
 *  whole column being the button. Narrower than the full-height boxes this
 *  used to reveal (84px on the map list, 74px on the category cards), which
 *  were reported as too big on a real phone; 52px still clears the 44pt tap
 *  target, since the button is the full column, not just the circle drawn in
 *  it. */
const ACTION_WIDTH = 52

// How far a drag/swipe has to travel before release commits it open, absent
// a fast flick (see FLICK_VELOCITY below), as a fraction of the reveal width.
// 50% made this feel like it needed "swipe far" next to iMessage/Mail's own
// row actions, which commit noticeably sooner. 30% is close to where those
// apps' own reveal visually crosses the halfway point of the FIRST button
// (Pin, at the row's edge), which reads as "I've clearly exposed something"
// well before the whole strip is out. A fraction rather than a pixel count,
// so that reasoning holds at any strip width — which does mean narrowing the
// strip shortened the absolute distance too.
const OPEN_FRACTION = 0.3
// A fast flick commits open/closed regardless of how far the drag actually
// got — the other half of why iMessage/Mail feel quicker: a quick flick that
// only travels a few px still reads as a deliberate swipe, not an aborted
// one. px/ms; ~0.5 is a brisk but ordinary flick, well below a hard fling.
const FLICK_VELOCITY = 0.5

// Whether a finished drag/swipe should leave the row open, given where it
// ended up (dragXValue), where THIS gesture started (startX — 0 if it began
// closed, -revealWidth if it began already open) and its velocity at
// release. The threshold is measured as distance traveled *this gesture*,
// not absolute position, so opening from closed and closing from open both
// need the same threshold worth of travel — using an absolute-position
// midpoint instead ties the two together: lowering it to make opening easier
// makes closing correspondingly harder, since the same line now sits closer
// to the open end.
function resolveOpenState(dragXValue: number, startX: number, velocity: number, revealWidth: number): boolean {
  if (velocity <= -FLICK_VELOCITY) return true
  if (velocity >= FLICK_VELOCITY) return false
  const threshold = revealWidth * OPEN_FRACTION
  const traveled = dragXValue - startX
  return startX === 0 ? traveled < -threshold : !(traveled > threshold)
}

// The settle animation after release, snapping open/closed.
//
// Been through two wrong attempts already:
// - A "back out" curve that dips past the target before easing into it
//   (cubic-bezier(0.34, 1.56, 0.64, 1)) — looked slow and rubbery, the
//   dip-then-correct motion reading as bouncy rather than crisp.
// - An aggressive ease-out (cubic-bezier(0.16, 1, 0.3, 1), "expo out") —
//   effectively full speed the instant it starts, then decelerating hard.
//   Reported live as aggressive and sudden: no ramp-up at all, just an
//   immediate burst of motion.
// This is Material Design's own "decelerate" curve: a moderate
// acceleration at the very start (not an instant burst) into a smooth
// deceleration, at a slightly longer duration so the motion has room to
// read as a glide rather than a snap.
const SETTLE_EASING = 'cubic-bezier(0, 0, 0.2, 1)'
// background-color rides along so a row with its own hover/press tint (the
// category card has one) doesn't lose that transition to this inline style,
// which overrides any transition a class sets.
const SETTLE_TRANSITION = `transform 230ms ${SETTLE_EASING}, background-color 150ms ease-out`

// Mouse/trackpad users get a trackpad swipe instead of a touch drag (see the
// wheel handler below) — there's no natural "release" moment for a held
// mouse the way lifting a finger reads as committing. useSyncExternalStore
// (not state+effect) because this is genuinely reading an external source of
// truth — starts false to match SSR, then the real value on the client.
const HOVER_QUERY = '(hover: hover) and (pointer: fine)'
function subscribeHoverCapable(callback: () => void) {
  const mql = window.matchMedia(HOVER_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}
const getHoverCapableSnapshot = () => window.matchMedia(HOVER_QUERY).matches
const getHoverCapableServerSnapshot = () => false

export type SwipeAction = {
  id: 'pin' | 'share'
  /** The caption under the circle — "Pin"/"Unpin", "Share"/"Copied!". */
  label: string
  /** The caption plus the listing's name. Every row in a list has a "Pin",
   *  so the caption alone doesn't say which listing it acts on. */
  ariaLabel: string
  active: boolean
  onSelect: () => void
}

// The colours these actions have always had on the map list — carried over
// as they were rather than chosen afresh. How the pinned state should look
// (colour, fill) is a design conversation still to be had; until it is,
// nothing here should look different from what shipped.
const SHARE_COLOR = '#0f172a'
const PIN_COLOR = '#2563eb'
const UNPIN_COLOR = '#64748b'

function actionColor(action: SwipeAction) {
  if (action.id === 'share') return SHARE_COLOR
  return action.active ? UNPIN_COLOR : PIN_COLOR
}

function ActionGlyph({ action }: { action: SwipeAction }) {
  // The thumbtack, never the map-marker PinIcon: that teardrop is reserved
  // for "set as location" (see ThumbtackIcon's own doc), and the map list
  // drew Pin with it until it moved onto this component. Always the outline
  // variant too — ThumbtackIcon's filled one is the literal 📌 emoji, which
  // PinnedBadge already puts on the row's avatar once it's pinned. The state
  // is carried by the caption and the circle's colour instead.
  if (action.id === 'pin') return <ThumbtackIcon className="h-4 w-4" />
  return <ExternalIcon className="h-4 w-4" />
}

// ── One-open-at-a-time ───────────────────────────────────────────────────
// Only one row's actions stay revealed within a list — opening a second row
// snaps the first shut, same as iOS Mail's swipe actions. A row outside any
// group keeps its own open state instead.
type Group = { openId: string | null; setOpenId: Dispatch<SetStateAction<string | null>> }
const SwipeRowGroupContext = createContext<Group | null>(null)

export function SwipeRowGroup({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const value = useMemo(() => ({ openId, setOpenId }), [openId])
  return <SwipeRowGroupContext.Provider value={value}>{children}</SwipeRowGroupContext.Provider>
}

export default function SwipeRow({
  rowId,
  actions,
  enabled = true,
  className = '',
  contentClassName = '',
  contentRef,
  onContentClick,
  children,
}: {
  /** Identifies this row within its SwipeRowGroup. */
  rowId: string
  actions: SwipeAction[]
  /** False renders the row with no gesture at all — for a surface that
   *  reveals these actions some other way (the category card's desktop
   *  hover row), or a row with nothing to act on (a hospital). */
  enabled?: boolean
  /** Classes for the wrapper, which spans the content and the revealed
   *  strip both. The component adds what the gesture itself depends on. */
  className?: string
  /** The sliding element — the row itself, which moves to reveal the strip.
   *  It must paint an opaque background, or the strip shows through it. */
  contentClassName?: string
  contentRef?: Ref<HTMLDivElement>
  /** The row's own tap. Never fires for the click a swipe ends with, or for
   *  a tap on a row that's open — that tap closes it instead. */
  onContentClick?: () => void
  children: ReactNode
}) {
  // Share sits left of Pin, which stays at the row's edge — that's the
  // button a visitor already has muscle memory for, so a small swipe still
  // reveals it first.
  const ordered = useMemo(() => [...actions].sort((a, b) => (a.id === 'pin' ? 1 : 0) - (b.id === 'pin' ? 1 : 0)), [actions])
  const revealWidth = ordered.length * ACTION_WIDTH
  const active = enabled && ordered.length > 0

  const group = useContext(SwipeRowGroupContext)
  const [localOpen, setLocalOpen] = useState(false)
  const isOpen = group ? group.openId === rowId : localOpen
  const setGroupOpenId = group?.setOpenId
  const onOpenChange = useCallback(
    (open: boolean) => {
      // Closing only clears the group if THIS row is the open one, so a
      // stale close from one row can't shut another that was opened since.
      if (setGroupOpenId) setGroupOpenId((prev) => (open ? rowId : prev === rowId ? null : prev))
      else setLocalOpen(open)
    },
    [setGroupOpenId, rowId],
  )

  const hoverCapable = useSyncExternalStore(subscribeHoverCapable, getHoverCapableSnapshot, getHoverCapableServerSnapshot)

  const [dragX, setDragX] = useState(0)
  const dragXRef = useRef(0)
  // True while a touch drag or a trackpad swipe gesture is actively moving
  // the row — covers both so the sync effect below doesn't fight either one.
  const activeGestureRef = useRef(false)
  // The same fact as activeGestureRef, as state, for RENDERING only — it
  // drops the settle transition while a finger or trackpad is moving the
  // row, so the row tracks it exactly. The ref keeps driving the drag maths:
  // reading state in the pointer-event closures can lag behind rapid-fire
  // move events across renders in a way a ref never does, and that's exactly
  // the math this file's comments are tuned around. Setting this changes
  // nothing about the gesture; it's written only when a gesture is claimed
  // and when it ends, both moments that re-render anyway.
  const [gestureLive, setGestureLive] = useState(false)
  const movedRef = useRef(false)
  const startXRef = useRef<number | undefined>(undefined)
  const startYRef = useRef(0)
  const startDragXRef = useRef(0)
  // Instantaneous velocity of the most recent pointer move (px/ms, negative
  // = moving left/opening), for the flick-commits-regardless-of-distance
  // check in endDrag — see FLICK_VELOCITY.
  const velocityRef = useRef(0)
  const lastMoveXRef = useRef(0)
  const lastMoveTimeRef = useRef(0)
  // Trackpad-path equivalent of startDragXRef — see the wheel handler below.
  const wheelStartXRef = useRef(0)
  const wheelSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Keeps the row in sync when it's closed externally (another row opened,
  // an action fired, or an outside click landed) without fighting an
  // in-progress drag/swipe.
  useEffect(() => {
    if (!activeGestureRef.current) {
      dragXRef.current = isOpen ? -revealWidth : 0
      setDragX(dragXRef.current)
    }
  }, [isOpen, revealWidth])

  // Closes the row when a swipe has left it open and the visitor clicks
  // anywhere else on the page — the trackpad-swipe equivalent of iOS Mail's
  // "tap elsewhere to dismiss," since desktop has no separate tap-to-close.
  useEffect(() => {
    if (!active || !hoverCapable || !isOpen) return
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener('click', onDocClick, true)
    return () => document.removeEventListener('click', onDocClick, true)
  }, [active, hoverCapable, isOpen, onOpenChange])

  function onPointerDown(e: React.PointerEvent) {
    // Desktop uses a trackpad swipe (the wheel handler below), not a
    // held-mouse drag.
    if (hoverCapable || !active) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    startDragXRef.current = dragX
    activeGestureRef.current = false
    movedRef.current = false
    velocityRef.current = 0
    lastMoveXRef.current = e.clientX
    lastMoveTimeRef.current = e.timeStamp
  }

  function onPointerMove(e: React.PointerEvent) {
    if (hoverCapable || !active || startXRef.current === undefined) return
    const delta = e.clientX - startXRef.current
    if (!activeGestureRef.current) {
      // Claims the gesture only once it's CLEARLY horizontal — not just past
      // a flat threshold, but past it with more horizontal movement than
      // vertical. A plain `abs(delta) >= 8` check still let a
      // mostly-vertical drag claim the row the moment its horizontal
      // component ticked past 8px, even while the same drag was also moving
      // the list up/down — exactly the "swiping left still triggers the
      // up/down scroll" feel Spotify/WhatsApp don't have. Comparing against
      // deltaY is what actually locks the two apart: a vertical-dominant
      // drag never satisfies this, so it never captures here and never
      // calls stopPropagation below, leaving any ancestor's own vertical
      // handling (the map sheet's) completely unaffected for that gesture.
      const deltaY = e.clientY - startYRef.current
      if (Math.abs(delta) < 8 || Math.abs(delta) <= Math.abs(deltaY)) return
      activeGestureRef.current = true
      setGestureLive(true)
      movedRef.current = true
      // Can throw if the pointer was already released between events (fast
      // flicks) — capture is a nicety here, not required for the drag math.
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
    }
    // Claimed as horizontal (this event or an earlier one in the same
    // gesture) — stop it from also bubbling to an ancestor's vertical-drag
    // listener (the map sheet's): once a gesture is horizontal, it should
    // never also read as a vertical drag/scroll.
    e.stopPropagation()
    dragXRef.current = Math.min(0, Math.max(-revealWidth, startDragXRef.current + delta))
    setDragX(dragXRef.current)
    // Instantaneous, not averaged over the whole gesture — a drag that
    // starts slow and ends in a fast flick should commit on that flick, not
    // get diluted by the slow start.
    const dt = e.timeStamp - lastMoveTimeRef.current
    if (dt > 0) velocityRef.current = (e.clientX - lastMoveXRef.current) / dt
    lastMoveXRef.current = e.clientX
    lastMoveTimeRef.current = e.timeStamp
  }

  function endDrag(e: React.PointerEvent) {
    if (hoverCapable || !active) return
    startXRef.current = undefined
    if (activeGestureRef.current) {
      // Same reasoning as onPointerMove's own stopPropagation — without it,
      // an ancestor's pointerup (the map sheet's) could still resolve a
      // snap-point change from whatever small residual vertical delta it
      // saw before this gesture locked itself to horizontal.
      e.stopPropagation()
      const shouldOpen = resolveOpenState(dragX, startDragXRef.current, velocityRef.current, revealWidth)
      onOpenChange(shouldOpen)
      dragXRef.current = shouldOpen ? -revealWidth : 0
      setDragX(dragXRef.current)
    }
    activeGestureRef.current = false
    setGestureLive(false)
  }

  // Registered as a native, non-passive listener rather than React's onWheel
  // prop — React attaches wheel handlers passively by default, which
  // silently ignores preventDefault() and lets the list scroll sideways
  // underneath the swipe.
  //
  // On the wrapper, not the content — once a row is open, the content has
  // slid out from under the cursor, and a swipe-to-close gesture starting
  // over the revealed buttons would land on them and never reach a
  // content-level handler at all. The wrapper spans the whole row (content
  // and the revealed strip both), so a swipe closes the row no matter where
  // over it it starts.
  useEffect(() => {
    if (!active || !hoverCapable) return
    const el = wrapperRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      // Any real horizontal component gets prevented, not just events where
      // it dominates deltaY — Chrome/Safari decide whether to hijack the
      // *whole* gesture as swipe-navigation from its first couple of ticks,
      // which often start diagonal before settling into a clean horizontal
      // swipe. Waiting for deltaX to clearly win before calling
      // preventDefault() left those opening ticks unconsumed, which was
      // enough on its own to trigger the browser's back gesture — most
      // noticeable swiping right to close a row that's already open. A tiny
      // noise floor keeps genuine vertical scrolling (deltaX ~ 0) untouched.
      if (Math.abs(e.deltaX) < 2) return
      e.preventDefault()
      // The first tick since the last settle is this gesture's baseline for
      // resolveOpenState's traveled-distance check.
      if (!activeGestureRef.current) wheelStartXRef.current = dragXRef.current
      activeGestureRef.current = true
      setGestureLive(true)
      // Trackpad "swipe left" reports positive deltaX under macOS's default
      // natural-scrolling direction — subtracting it moves the row left, the
      // same direction the fingers moved, mirroring the touch-drag math above.
      dragXRef.current = Math.min(0, Math.max(-revealWidth, dragXRef.current - e.deltaX))
      setDragX(dragXRef.current)
      if (wheelSettleTimer.current) clearTimeout(wheelSettleTimer.current)
      // Wheel events have no discrete "end" the way pointerup does — treat a
      // short gap since the last tick as the gesture finishing, then snap
      // open or closed the same way a touch drag resolves on release. No
      // velocity signal on this path (trackpad ticks don't carry timestamps
      // worth trusting the way pointermove's do), so it's distance-only.
      wheelSettleTimer.current = setTimeout(() => {
        activeGestureRef.current = false
        setGestureLive(false)
        const shouldOpen = resolveOpenState(dragXRef.current, wheelStartXRef.current, 0, revealWidth)
        onOpenChange(shouldOpen)
        dragXRef.current = shouldOpen ? -revealWidth : 0
        setDragX(dragXRef.current)
      }, 150)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [active, hoverCapable, onOpenChange, revealWidth])

  function onContentClickCapture(e: ReactMouseEvent) {
    // Swallow the click that follows a drag/swipe, and use a click on an
    // already-open row to close it instead of firing the row's normal
    // action — same "dismiss before you can act again" rule on both touch
    // and desktop.
    if (movedRef.current || isOpen) {
      e.preventDefault()
      e.stopPropagation()
      movedRef.current = false
      if (isOpen) onOpenChange(false)
    }
  }

  if (!active) {
    return (
      <div className={`relative ${className}`}>
        <div ref={contentRef} className={contentClassName} onClick={onContentClick}>
          {children}
        </div>
      </div>
    )
  }

  const displaced = dragX !== 0 || isOpen
  const contentStyle: CSSProperties = {
    // Only while displaced. A transform — even translateX(0) — makes the
    // content its own stacking context, and the category card has a hover
    // tooltip on its cert badge that has to paint over the card below it;
    // scoped to the row, the next card in the list covers it.
    transform: dragX ? `translateX(${dragX}px)` : undefined,
    transition: gestureLive ? 'none' : SETTLE_TRANSITION,
  }

  return (
    <div
      ref={wrapperRef}
      // overscroll-x-none opts this element's own axis out of the browser's
      // native horizontal overscroll handling — its swipe-navigation
      // recognizer (the elastic full-page slide during a trackpad swipe)
      // isn't a scroll-chaining question at all, and doesn't reliably back
      // off just because the wheel event was preventDefault()'d down here.
      // Gmail and X suppress the same "whole page rubber-bands during a
      // horizontal gesture" glitch the same way.
      //
      // touch-pan-y hands vertical scrolling back to the browser natively
      // and keeps only horizontal movement for the gesture. It's here on the
      // wrapper, with the pointer handlers, for the same reason the wheel
      // listener is: a drag starting over the revealed buttons has to close
      // the row too.
      //
      // overflow-hidden only while displaced: at rest this element is
      // transparent to layout, which the category card needs, since its cert
      // badge's hover tooltip spills past the card and clipping would cut it
      // off. Nobody hovers a badge mid-swipe.
      className={`relative overscroll-x-none touch-pan-y ${displaced ? 'overflow-hidden' : ''} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Mounted only while there's a displacement to reveal it. An
          always-mounted strip behind an opaque row is invisible either way,
          but it isn't gone: its buttons stay in the tab order and the
          accessibility tree, so a keyboard or screen-reader visitor would
          land on controls nobody can see — the map list did exactly that
          until it moved onto this component. NOT aria-hidden while it's up,
          though: a VoiceOver user performs this swipe like anyone else, and
          hiding what it reveals would leave them holding controls their
          screen reader says aren't there. */}
      {displaced && (
        <div className="absolute inset-y-0 right-0 flex bg-slate-50" style={{ width: revealWidth }}>
          {ordered.map((action) => (
            <button
              key={action.id}
              type="button"
              aria-label={action.ariaLabel}
              onClick={(e) => {
                e.stopPropagation()
                action.onSelect()
                // Share doesn't close the row: the clipboard fallback's
                // "Copied!" is its own caption, and closing would hide it
                // before anyone reads it.
                if (action.id !== 'share') onOpenChange(false)
              }}
              className="group/act flex flex-1 cursor-pointer flex-col items-center justify-center gap-1"
            >
              {/* active:brightness-90, a filter, not an active:bg-* class:
                  the circle's colour is an inline style, which a Tailwind
                  background class can't darken. A filter darkens whatever's
                  painted regardless of how the colour got there. */}
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm transition-[filter] group-active/act:brightness-90"
                style={{ backgroundColor: actionColor(action) }}
              >
                <ActionGlyph action={action} />
              </span>
              <span className="text-[10px] font-semibold leading-none text-slate-600">{action.label}</span>
            </button>
          ))}
        </div>
      )}
      <div
        ref={contentRef}
        className={contentClassName}
        style={contentStyle}
        onClickCapture={onContentClickCapture}
        onClick={onContentClick}
      >
        {children}
      </div>
    </div>
  )
}
