'use client'

import { useState } from 'react'
import { PinIcon } from '@/components/icons'

// Shown under a category title when no location is set yet. Clicking it
// fires a custom event that tells LocationControl (in the sticky header) to
// open its dropdown — so the user can act without hunting for the pill.
//
// Full-width and centered on mobile, compact/inline on desktop: on mobile
// this is the ONLY thing left in DirectoryHeader's row once a location IS
// set (the resolved address itself is desktop-only there now — see that
// component's own doc), so the unset state deserves the same real estate
// rather than reading as a small aside. Desktop keeps the original compact
// pill; it sits beside the count/Add there and has never had this problem.
//
// Dismissible on mobile via sessionStorage (not localStorage): someone who
// declines location shouldn't be nagged again this visit, but distance
// sorting is core enough here that it should come back next session rather
// than being silenced forever. Desktop's compact pill has no dismiss — it's
// a small inline aside there, not a full-width banner competing for space.
const DISMISS_KEY = 'jpc:address-prompt-dismissed'

export default function AddressPrompt() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  function handleClick() {
    document.dispatchEvent(new CustomEvent('jpc:open-location'))
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // sessionStorage unavailable (private mode, etc.) — dismissal just won't persist
    }
    setDismissed(true)
  }

  if (dismissed) return null

  return (
    <button
      onClick={handleClick}
      className="relative mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-caution/30 bg-caution/10 px-3 py-1.5 pr-8 text-xs font-medium text-caution hover:bg-caution/20 hover:border-caution/45 active:bg-caution/30 transition-colors cursor-pointer desktop:inline-flex desktop:w-auto desktop:justify-start desktop:gap-1.5 desktop:px-2.5 desktop:py-1.5 desktop:pr-2.5"
    >
      <PinIcon className="h-3.5 w-3.5" />
      Set location to see distances
      <span
        onClick={handleDismiss}
        role="button"
        aria-label="Dismiss"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-caution/20 cursor-pointer desktop:hidden"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    </button>
  )
}
