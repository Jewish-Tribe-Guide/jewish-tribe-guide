'use client'

import { useState } from 'react'
import { PinIcon } from '@/components/icons'

// Shown when no location is set yet. Clicking it fires a custom event that
// tells LocationControl (in the sticky header) to open its dropdown — so the
// user can act without hunting for the pill.
//
// Two variants, picked by the caller rather than a viewport check, since the
// two no longer share a position in the tree: `banner` is mobile's own full-
// width call to action at the very top of the category page (GenericDirectory),
// separated from the search bar below it rather than sitting right above it;
// `inline` is desktop's compact pill, staying put next to the title in
// DirectoryHeader exactly as it always has.
//
// Dismissible in the `banner` variant only, via sessionStorage (not
// localStorage): someone who declines location shouldn't be nagged again
// this visit, but distance sorting is core enough here that it should come
// back next session rather than being silenced forever. `inline` has no
// dismiss — it's a small aside beside the title, not a banner competing for
// space.
const DISMISS_KEY = 'jpc:address-prompt-dismissed'

type Props = {
  variant?: 'banner' | 'inline'
}

export default function AddressPrompt({ variant = 'inline' }: Props) {
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

  if (variant === 'banner') {
    if (dismissed) return null
    return (
      <button
        onClick={handleClick}
        className="relative flex w-full items-center justify-center gap-1.5 rounded-lg border border-caution/30 bg-caution/10 px-3 py-2.5 pr-9 text-sm font-medium text-caution hover:bg-caution/20 hover:border-caution/45 active:bg-caution/30 transition-colors cursor-pointer"
      >
        <PinIcon className="h-4 w-4" />
        Set location to see distances
        <span
          onClick={handleDismiss}
          role="button"
          aria-label="Dismiss"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-caution/20 cursor-pointer"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-caution/30 bg-caution/10 px-2.5 py-1.5 text-xs font-medium text-caution hover:bg-caution/20 hover:border-caution/45 active:bg-caution/30 transition-colors cursor-pointer"
    >
      <PinIcon className="h-3.5 w-3.5" />
      Set location to see distances
    </button>
  )
}
