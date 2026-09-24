'use client'

import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { PencilIcon } from '@/components/icons'
import ListingActionsFan from './ListingActionsFan'

// ── The one visible way to edit an open listing ──────────────────────────
// A full-width pill that sits BELOW the listing rather than inside it, in
// the same floating layer the directory's Add button already occupies (see
// GenericDirectory's own floating "+" and its doc). That placement is the
// whole point, and it's why this is a component rather than a row each
// surface builds for itself:
//
// Edit used to be reachable two ways, both of which read as "chrome you can
// ignore." It sat in the kebab (ListingActionsMenu), which people open
// expecting Share/Save — never expecting to author anything — and it sat as
// FreshnessFooter's 12px grey "Suggest a correction" link, at the same
// visual weight as the timestamp beside it. Repeated feedback was that the
// site doesn't look editable at all. Anything rendered *inside* the content
// competes with the content and loses; anything in an overflow menu is
// found by accident. So this is neither: it's its own object, below the
// listing, at full width, and it is the only thing in that position.
//
// Deliberately ONE action. "Request removal" is not a peer here — it's rare,
// it sounds destructive, and giving it equal billing makes a visitor stop to
// choose between two things instead of reading one invitation. It keeps the
// home it already had: the last panel of the edit form itself (see
// RemovalRequest in ListingForm), the same trail Google Maps uses for
// "Close or remove."
//
// The label is "Suggest an edit", not "Edit": the second implies authority
// this visitor doesn't need to have, and the first is what people actually
// think ("that's wrong") rendered as something they're allowed to do.
//
// stopPropagation because every surface that shows this has a click handler
// somewhere above it — the dialog's backdrop closes on a click that reaches
// it, and the directory card's row toggles itself.
export default function ListingEditBar({
  onEdit,
  item,
  category,
  path,
  className = '',
}: {
  onEdit: () => void
  item: DirectoryResource
  category: CategoryConfig
  /** The listing's own URL — what the overflow's Share copies. */
  path: string
  /** Surface-specific spacing. The shape itself never varies. */
  className?: string
}) {
  return (
    // A wide primary plus a small round overflow, not two peers. The shape
    // is doing work: it gives the row an end-stop, so the bar sits on a base
    // instead of dangling from the middle of the card above it — and it
    // keeps the one action worth finding visually dominant over three that
    // are merely useful.
    <div className={`flex w-full items-stretch gap-2 ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
        className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg transition-transform active:scale-[0.98]"
      >
        <PencilIcon className="h-4 w-4 shrink-0" />
        Suggest an edit
      </button>
      <ListingActionsFan item={item} category={category} path={path} />
    </div>
  )
}
