'use client'

import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { useOptionalLocation } from '@/lib/locationContext'
import { CheckIcon, CrosshairIcon } from '@/components/icons'

/** "I'm here" — anchors every distance on the site to this listing.
 *
 *  For the visitor staying at a hotel or sitting in a hospital: the listing
 *  already carries exact coordinates, so marking yourself at one beats typing
 *  your own address into the header pill. Once set, the pill reads this
 *  listing's name, the directory flips to Distance sort, and every mileage
 *  recomputes from here.
 *
 *  Same tappable-row concern as PinButton/UpvoteButton: this sits inside a
 *  card whose whole body is itself clickable (to collapse it), so a tap here
 *  must never also toggle that.
 *
 *  Tapping it again clears the anchor. That doubles as the undo — this app has
 *  no toast, and the established way to confirm an action is the control
 *  swapping state in place (see PinButton, FreshnessFooter). */
export default function SetLocationButton({
  item,
  category,
}: {
  item: DirectoryResource
  category: CategoryConfig
}) {
  // Optional, not useLocation(): this renders inside the admin's category
  // preview too, which has no LocationProvider on purpose. See the hook's own
  // note — the throwing version would take that screen down.
  const location = useOptionalLocation()

  // `geo`, not `address` — a listing whose address failed to geocode at
  // approval time has no geo key at all (submissionStore only writes it
  // `if (geo)`), and anchoring to it would produce NaN distances everywhere.
  // The category gate matches showAddress in PlaceDetailBody: a WhatsApp-group
  // style category has no physical place to stand in.
  if (!location || category.hasAddress === false || !item.geo) return null

  const active = location.anchorListingId === item.id
  const label = active
    ? `You're here — ${item.name} is where distances are measured from. Tap to undo.`
    : `I'm here — measure distances from ${item.name}`

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        // unsetListingAnchor, not clearAnchor: tapping this off is an undo, so
        // it restores whatever address this listing displaced. The picker's
        // own Clear button is the one that means "no location at all".
        if (active) location.unsetListingAnchor()
        else location.setListingAnchor({ id: item.id, name: item.name, coords: item.geo! })
      }}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={[
        'flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium transition-colors cursor-pointer',
        // -m-1.5 p-1.5 grows the tap target to ~32px on touch without moving
        // anything around it — same trick UpvoteButton's inline variant uses.
        '-m-1.5 p-1.5',
        // Docks to the row's right edge rather than sitting wherever the
        // address text happens to end — the same right edge Pin already
        // docks to in the header above, so the two read as one action
        // column running down the card instead of two unrelated controls.
        'ml-auto',
        active ? 'text-primary' : 'text-slate-400 hover:text-primary',
      ].join(' ')}
    >
      {active ? <CheckIcon className="h-3.5 w-3.5" /> : <CrosshairIcon className="h-3.5 w-3.5" />}
      {active ? "You're here" : "I'm here"}
    </button>
  )
}
