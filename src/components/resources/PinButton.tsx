'use client'

import { PinIcon } from '@/components/icons'
import { usePinned } from '@/lib/pinnedContext'

/** Toggles a listing on the visitor's personal "Pinned" shortlist (this
 *  browser only — see lib/pinned.ts). Same tappable-header-row concern as
 *  UpvoteButton: this sits inside a row whose whole header is itself
 *  clickable (to expand the card), so a tap here must never also toggle
 *  that. */
export default function PinButton({ id, categoryId, name }: { id: string; categoryId: string; name: string }) {
  const { isPinned, toggle } = usePinned()
  const pinned = isPinned(id)
  const label = pinned ? `Unpin ${name}` : `Pin ${name}`

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        toggle({ id, categoryId })
      }}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      className={[
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer',
        pinned ? 'text-primary' : 'text-slate-300 hover:text-slate-500',
      ].join(' ')}
    >
      <PinIcon filled={pinned} className="h-4 w-4" />
    </button>
  )
}
