'use client'

import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { PencilIcon } from '@/components/icons'
import { mainThing } from '@/lib/listingView'
import ListingActionsFan from './ListingActionsFan'
import type { ListingAction } from './useListingActions'

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
// choose between two things instead of reading one invitation. It's last in
// the overflow (Oct 11): at the foot of the edit it was one more thing
// beside Send.
//
// It opens the listing's editor itself, everywhere (the user, Oct 15: "when
// you click edit on a listing we should show actual edit. Not AI"). It used
// to open the "+ Add" box about the listing on a category page, with "Edit
// the details myself" a second step to the editor.
//
// On a listing that is one link (a WhatsApp group's Join, a network's
// website), the pill is outlined rather than filled (Oct 6): the listing's
// own big button is already right above it, and two filled pills stacked
// read as two equal choices.
//
// The label is "Edit listing" (Oct 15): every box above it has its own
// plain "Edit" for that box alone, so this one says it's the whole
// listing. It was "Suggest an edit" while it was the only way in; that an
// admin checks it is said on the screen after Send.
//
// stopPropagation because every surface that shows this has a click handler
// somewhere above it — the dialog's backdrop closes on a click that reaches
// it, and the directory card's row toggles itself.
//
// Rendered even when the listing can't be edited, as the overflow alone.
// It used to be gated on edit wholesale, which looked harmless and wasn't:
// this overflow is the only place Set-as-location lives, and the only route
// to Pin/Share that a keyboard or screen reader can reach — the card's own
// swipe and hover-reveal are deliberately pointer-only BECAUSE this exists.
// A category with editing turned off lost all three for those visitors.
export default function ListingEditBar({
  onEdit,
  onRequestRemoval,
  item,
  category,
  path,
  className = '',
  fanPlacement = 'auto',
  omit,
}: {
  /** Omitted when the listing can't be edited — the bar then renders the
   *  overflow on its own. See above for why it never disappears outright. */
  onEdit?: () => void
  /** The overflow's Request removal: see ListingActionsFan. */
  onRequestRemoval?: () => void
  item: DirectoryResource
  category: CategoryConfig
  /** The listing's own URL — what the overflow's Share copies. */
  path: string
  /** Surface-specific spacing. The shape itself never varies. */
  className?: string
  /** Passed through to the overflow — `stack` where there's no scrim behind
   *  the bar (the map). See ListingActionsFan's own `placement` prop. */
  fanPlacement?: 'auto' | 'stack'
  /** Passed through to the overflow: see ListingActionsFan's `omit`. */
  omit?: ListingAction['id'][]
}) {
  const quiet = mainThing(item, category) === 'join'
  return (
    // A wide primary plus a small round overflow, not two peers. The shape
    // is doing work: it gives the row an end-stop, so the bar sits on a base
    // instead of dangling from the middle of the card above it — and it
    // keeps the one action worth finding visually dominant over three that
    // are merely useful.
    //
    // Without the pill the row shrinks to the overflow's own size and sits at
    // the trailing edge (ml-auto works whether the parent is a flex strip or
    // plain block flow). It must not stay w-full: the dialog hangs this in a
    // pointer-events-none strip and re-enables pointers on this element, so
    // a full-width row with nothing in most of it would swallow the clicks
    // that are meant to reach the backdrop and close the dialog.
    <div className={`flex items-stretch gap-2 ${onEdit ? 'w-full' : 'ml-auto w-fit'} ${className}`}>
      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-transform active:scale-[0.98] ${
            quiet ? 'border border-slate-300 bg-white text-slate-900' : 'bg-primary text-white shadow-lg'
          }`}
          data-quiet={quiet || undefined}
        >
          <PencilIcon className="h-4 w-4 shrink-0" />
          Edit listing
        </button>
      )}
      <ListingActionsFan item={item} category={category} path={path} placement={fanPlacement} omit={omit} onRequestRemoval={onRequestRemoval} />
    </div>
  )
}
