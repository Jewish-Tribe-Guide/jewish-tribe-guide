'use client'

import { useEffect, type RefObject } from 'react'

/** Locks page scroll for as long as `locked` is true. Used by LocationControl
 *  so a visitor can't drag the page (or the map underneath, on the desktop
 *  fullscreen map) out from under the open "where should distances be
 *  measured from" popover — it used to just sit there while the content
 *  behind it kept scrolling, which read as the popover drifting around the
 *  screen rather than being anchored to anything.
 *
 *  This locks the ROOT ELEMENT, and does not take `<body>` out of flow.
 *
 *  It used to pin the body with `position: fixed; top: -scrollY`, the usual
 *  recipe. That breaks `position: sticky` inside it: once the body is out of
 *  flow the document scroll resets to 0, the sticky header has no scrollport
 *  to stick to, and it drops back to its natural place at the top of the body
 *  box — `scrollY` pixels above the viewport. Measured on this app at scroll
 *  600, the header went from `top: 0` to `top: -600` the instant the popover
 *  opened, taking the popover anchored to it along for the ride. That is the
 *  "the location panel comes down from the top of the page" bug, and it
 *  happened on mobile as well as desktop.
 *
 *  `overflow: hidden` on `<html>` is what actually stops the viewport
 *  scrolling, because the root element's overflow is the value the viewport
 *  inherits (the same propagation globals.css depends on) — and it disturbs
 *  no layout at all: nothing moves, sticky keeps working, and there is no
 *  scroll position to save and restore.
 *
 *  The original reason for `position: fixed` was iOS: Safari would keep
 *  scrolling the page when a touch drag was ALREADY in progress as the lock
 *  went on. `preventTouchMove` covers that case directly instead — it cancels
 *  touch scrolling outside `allowWithin` while locked, which is the narrow
 *  thing position:fixed was there to buy. Touch inside the popover is left
 *  alone so its own content can still be scrolled and its input used.
 *
 *  NOTE: the iOS half of this could not be verified on a real device from
 *  here; the layout half (no jump, sticky intact) was measured directly. */
export function useScrollLock(locked: boolean, allowWithin?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!locked) return
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    const previousPadding = root.style.paddingRight

    // Hiding the scrollbar narrows the viewport, which shifts the whole page
    // sideways as it opens. Only nonzero where scrollbars take real space —
    // it's 0 with macOS overlay scrollbars and on touch.
    const scrollbar = window.innerWidth - root.clientWidth
    root.style.overflow = 'hidden'
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`

    const preventTouchMove = (e: TouchEvent) => {
      const target = e.target as Node | null
      if (allowWithin?.current && target && allowWithin.current.contains(target)) return
      // Only cancellable listeners can stop a scroll already under way, hence
      // the explicit non-passive registration below.
      if (e.cancelable) e.preventDefault()
    }
    document.addEventListener('touchmove', preventTouchMove, { passive: false })

    return () => {
      root.style.overflow = previousOverflow
      root.style.paddingRight = previousPadding
      document.removeEventListener('touchmove', preventTouchMove)
    }
  }, [locked, allowWithin])
}
