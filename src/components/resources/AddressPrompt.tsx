'use client'

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
export default function AddressPrompt() {
  function handleClick() {
    document.dispatchEvent(new CustomEvent('jpc:open-location'))
  }

  return (
    <button
      onClick={handleClick}
      className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-caution/30 bg-caution/10 px-3 py-2.5 text-sm font-medium text-caution hover:bg-caution/20 hover:border-caution/45 active:bg-caution/30 transition-colors cursor-pointer desktop:inline-flex desktop:w-auto desktop:justify-start desktop:px-2.5 desktop:py-1.5 desktop:text-xs"
    >
      <PinIcon className="h-4 w-4 desktop:h-3.5 desktop:w-3.5" />
      Set location to see distances
    </button>
  )
}
