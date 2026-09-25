'use client'

/** Back as a chevron alone, for a step inside a dialog or sheet (from an
 *  edit to the listing, from removal to the edit, from Add's second step to
 *  its search). The chevron says "back" without the word, in a site that's
 *  already heavy on text, and in a dialog it pairs with the Close ✕ in the
 *  other corner: two icons with the title between them. Same size, colour
 *  and hover circle as that ✕. Screen readers still hear "Back". A 44px tap
 *  area around the 28px circle, so it's easy to hit on a phone. */
export default function BackIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      className="relative -m-1 inline-flex cursor-pointer items-center justify-center rounded-full p-1 text-muted transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}
