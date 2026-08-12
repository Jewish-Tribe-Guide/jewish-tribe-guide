'use client'

import { PinIcon } from '@/components/icons'
import { usePinned } from '@/lib/pinnedContext'

/** Toggles a listing on the visitor's personal "Pinned" shortlist (this
 *  browser only — see lib/pinned.ts).
 *
 *  Labelled rather than icon-only: a bare pin sitting next to a place's name
 *  doesn't say whether it's a button or a decoration, and this is the only
 *  place the shortlist can be added to. "Pinned" is the same word the map's
 *  own filter chip uses for the resulting list, so the two read as one
 *  feature. The icon fills when on, the way a bookmark does — that's the
 *  state indicator, so the label doesn't need a check the way
 *  SetLocationButton's does.
 *
 *  Styled to match SetLocationButton: both are small per-listing toggles in
 *  the same place-detail panel, so they should look like siblings.
 *
 *  Same tappable-header-row concern as UpvoteButton: this sits inside a row
 *  whose whole header is itself clickable (to expand the card), so a tap here
 *  must never also toggle that. */
export default function PinButton({
  id,
  categoryId,
  name,
  className,
}: {
  id: string
  categoryId: string
  name: string
  /** Extra classes appended after the button's own — e.g. `self-start` when
   *  it sits in a flex row alongside taller content (see MapPlaceDetail). */
  className?: string
}) {
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
        'flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium transition-colors cursor-pointer',
        // -m-1.5 p-1.5 grows the tap target to ~32px on touch without moving
        // anything around it — same trick UpvoteButton's inline variant uses.
        '-m-1.5 p-1.5',
        pinned ? 'text-primary' : 'text-slate-400 hover:text-primary',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <PinIcon filled={pinned} className="h-3.5 w-3.5" />
      {pinned ? 'Pinned' : 'Pin'}
    </button>
  )
}
