'use client'

import { PinIcon } from '@/components/icons'
import { useActiveCommunity } from '@/lib/communityContext'

/** "Distances from central Philadelphia · Use my location", above a list
 *  whose distances are measured from the community's centre because the
 *  visitor hasn't set a location (see withMilesFromCenter).
 *
 *  It replaces a rust-coloured "Set location to see distances" banner with a
 *  dismiss button, which read as an error on every category page, and a
 *  "Distance" chip with no number on every row. The distances are real now,
 *  so this only has to say where they're from and offer the better
 *  version. */
export default function DistanceNote({ className = '' }: { className?: string }) {
  const { community } = useActiveCommunity()
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted ${className}`}>
      <PinIcon className="h-3.5 w-3.5 shrink-0" />
      <span>Distances from central {community.region}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={() => document.dispatchEvent(new CustomEvent('jpc:open-location'))}
        // -my-1 py-1: a taller tap target without moving the line.
        className="-my-1 cursor-pointer py-1 font-semibold text-primary hover:text-primary-dark hover:underline"
      >
        Use my location
      </button>
    </p>
  )
}
