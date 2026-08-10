'use client'

import { useEffect } from 'react'

/** Locks page scroll for as long as `locked` is true. Used by LocationControl
 *  so a visitor can't drag the page (or the map underneath, on the desktop
 *  fullscreen map) out from under the open "where should distances be
 *  measured from" popover — it used to just sit there while the content
 *  behind it kept scrolling, which read as the popover drifting around the
 *  screen rather than being anchored to anything.
 *
 *  `overflow: hidden` alone is enough on desktop, but iOS Safari ignores it
 *  on `<body>` once a touch drag is already in progress on a scrollable
 *  descendant (a listing list, the map) — only `position: fixed` reliably
 *  stops it there. Pinning the body at its current scroll offset (rather
 *  than letting it snap to 0) and restoring both the inline styles and the
 *  scroll position on unlock is what keeps this invisible to the visitor:
 *  the page looks exactly as it did before the popover opened, on unlock. */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return
    const { body } = document
    const previousOverflow = body.style.overflow
    const previousPosition = body.style.position
    const previousTop = body.style.top
    const previousWidth = body.style.width
    const scrollY = window.scrollY

    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'

    return () => {
      body.style.overflow = previousOverflow
      body.style.position = previousPosition
      body.style.top = previousTop
      body.style.width = previousWidth
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}
