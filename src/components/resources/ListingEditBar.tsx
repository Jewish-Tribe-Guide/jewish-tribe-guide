'use client'

import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { PencilIcon, TrashIcon } from '@/components/icons'
import { mainThing } from '@/lib/listingView'

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
// listing, at full width, and nothing beside it competes with it.
//
// Request removal sits beside it (the user, Oct 15) as a round button with a
// red bin in it, the size the ••• trigger was (46px, white, shadow-lg): a
// wide primary plus a small round end-stop, not two peers, so Edit stays the
// obvious one. Red because it's the one thing here that takes something
// away — the same red as the Request removal screen it opens and the admin's
// own Delete links. It was briefly an outlined "Request removal" text pill,
// which the user found too heavy beside Edit. With no words on it, the name
// is in aria-label (for screen readers, and what the tests and e2e find it
// by) and title (a hover tooltip on a desktop).
// It used to be last in a ••• fan here, with Share, Save and Set as location
// — but each of those now has a button of its own on the listing (Share
// among Directions and Call, Save beside the name, Set as my location under
// the address), so the fan opened onto one thing that wasn't anywhere else.
// Before the fan (Oct 11) it was at the foot of the edit, one more thing
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
// Nothing at all where the listing can't be edited: removal needs edit too,
// and there's nothing else left to show.
export default function ListingEditBar({
  onEdit,
  onRequestRemoval,
  item,
  category,
  className = '',
}: {
  /** Omitted when the listing can't be edited — then nothing renders. */
  onEdit?: () => void
  /** Opens the editor's Request removal screen. Omitted where the category
   *  takes no removal requests. */
  onRequestRemoval?: () => void
  item: DirectoryResource
  category: CategoryConfig
  /** Surface-specific spacing. The shape itself never varies. */
  className?: string
}) {
  if (!onEdit) return null
  const quiet = mainThing(item, category) === 'join'
  return (
    <div className={`flex w-full items-stretch gap-2 ${className}`}>
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
      {onRequestRemoval && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRequestRemoval()
          }}
          aria-label="Request removal"
          title="Request removal"
          className="flex h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-red-600 shadow-lg transition-colors hover:bg-red-50 active:scale-[0.96]"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
