'use client'

// Shown under a category title when no location is set yet. Clicking it
// fires a custom event that tells LocationControl (in the sticky header) to
// open its dropdown — so the user can act without hunting for the pill.
export default function AddressPrompt() {
  function handleClick() {
    document.dispatchEvent(new CustomEvent('jpc:open-location'))
  }

  return (
    <button
      onClick={handleClick}
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-caution/30 bg-caution/10 px-2.5 py-1.5 text-xs font-medium text-caution hover:bg-caution/20 hover:border-caution/45 active:bg-caution/30 transition-colors cursor-pointer"
    >
      <span aria-hidden="true">📍</span>
      Set location to see distances
    </button>
  )
}
