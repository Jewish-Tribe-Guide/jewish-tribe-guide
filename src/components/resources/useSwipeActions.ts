'use client'

import { useCallback, useRef, useState } from 'react'

/** How far past the halfway-ish mark a drag has to get before releasing
 *  snaps it open rather than back. Below this it springs closed, so a
 *  hesitant half-swipe never leaves the row in an ambiguous state. */
const COMMIT_FRACTION = 0.4
/** Movement before the gesture commits to an axis. Small enough to feel
 *  immediate, large enough that the first jittery pixel of a vertical scroll
 *  doesn't read as horizontal. */
const AXIS_LOCK_PX = 8
/** A drag starting this close to the left edge of the SCREEN is the
 *  browser's own back gesture on iOS — and this app is an installed PWA, so
 *  that gesture is live. Ignore it rather than fight it. */
const EDGE_GUARD_PX = 24

type Axis = 'undecided' | 'horizontal' | 'vertical'

/** Swipe-to-reveal for a list row, in the iOS Mail idiom: drag left, action
 *  panels appear from underneath.
 *
 *  Deliberately a SHORTCUT and never the only route to anything it exposes.
 *  A gesture is invisible — nothing on screen advertises it — and it is
 *  unreachable by keyboard or screen reader, so anything reachable only this
 *  way would be, for practical purposes, gone. Everything here also lives in
 *  the fan below an opened listing (see ListingActionsFan), which is where
 *  the accessible path runs.
 *
 *  `touch-action: pan-y` on the element wearing these handlers is
 *  load-bearing, not an optimisation: it hands vertical scrolling back to the
 *  browser natively while leaving horizontal movement to us. Without it this
 *  would be competing with the scroller for every drag, which is the usual
 *  way a swipe row ends up feeling sticky.
 */
export function useSwipeActions(enabled: boolean, revealWidth: number) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; base: number } | null>(null)
  const axis = useRef<Axis>('undecided')
  /** Set the moment a gesture actually moves, and read by the row's own
   *  click handler to swallow the click a drag ends with — otherwise a swipe
   *  would also expand the card it was swiping. */
  const moved = useRef(false)

  const close = useCallback(() => setOffset(0), [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.pointerType === 'mouse') return
      if (e.clientX < EDGE_GUARD_PX) return
      start.current = { x: e.clientX, y: e.clientY, base: offset }
      axis.current = 'undecided'
      moved.current = false
    },
    [enabled, offset],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current
      if (!s) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y

      if (axis.current === 'undecided') {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        // Ties go to vertical: this sits inside a scrolling list, and a
        // scroll that fails is far more annoying than a swipe that fails.
        axis.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
        if (axis.current === 'vertical') {
          start.current = null
          return
        }
        setDragging(true)
      }

      moved.current = true
      // Clamped to the panels' own width in one direction and shut in the
      // other — no rubber-banding past either end, which would imply there's
      // something further along in a direction where there isn't.
      setOffset(Math.max(-revealWidth, Math.min(0, s.base + dx)))
    },
    [revealWidth],
  )

  const finish = useCallback(() => {
    if (!start.current && !dragging) return
    start.current = null
    axis.current = 'undecided'
    setDragging(false)
    setOffset((current) => (current < -revealWidth * COMMIT_FRACTION ? -revealWidth : 0))
  }, [dragging, revealWidth])

  return {
    /** Current translateX, always <= 0. */
    offset,
    isOpen: offset !== 0,
    /** True only while a finger is actually dragging — used to drop the
     *  snap-back transition mid-gesture so the row tracks the finger
     *  exactly, and to restore it for the release. */
    dragging,
    /** Whether the gesture that just ended actually moved. The row's click
     *  handler checks this so a swipe doesn't also count as a tap. Reading
     *  it clears it. */
    consumeDrag: () => {
      const did = moved.current
      moved.current = false
      return did
    },
    close,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  }
}
