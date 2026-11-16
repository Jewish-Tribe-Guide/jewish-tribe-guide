'use client'

import { useEffect, useEffectEvent, type RefObject } from 'react'

/** Search results under a box close on a tap or click anywhere outside
 *  `inside`, and on Escape, while `open`. Shared by the home's search
 *  (HeroHeading) and You's (Nov 16: You's results stayed open on a click
 *  away). A tap or click, since a phone's tap reaches the page as a
 *  mousedown too. */
export function useCloseOnTapAway(open: boolean, inside: readonly RefObject<HTMLElement | null>[], onClose: () => void): void {
  const close = useEffectEvent(onClose)
  const isInside = useEffectEvent((target: Node) => inside.some((r) => r.current?.contains(target)))
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      // A click in a dialog open over the page (the "Share your live
      // location?" prompt) is an answer to the dialog, not a click away from
      // the results. It used to close them: a shared answer
      // (/philly/ask/…) opened, the visitor tapped "Not now", and the answer
      // was gone.
      if (document.querySelector('[aria-modal="true"]')) return
      if (isInside(e.target as Node)) return
      close()
      // The tap that closes the results does only that. It used to go on to
      // whatever was under it: search "hospital", tap away, and Grocery
      // opened. The click follows this tap's mouseup; nothing else is eaten.
      document.addEventListener('click', swallow, true)
      document.addEventListener('mouseup', () => setTimeout(() => document.removeEventListener('click', swallow, true)), { once: true, capture: true })
    }
    function swallow(e: MouseEvent) {
      e.preventDefault()
      e.stopPropagation()
      document.removeEventListener('click', swallow, true)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
}
