'use client'

import { useMemo } from 'react'
import type { DirectoryResource, DirectoryAnchor, MapFilters } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { withMilesFromAddress } from '@/lib/listingTravel'
import { useOptionalLocation } from '@/lib/locationContext'
import GenericDirectory from './GenericDirectory'
import UpButton from '@/components/UpButton'

type Props = {
  category: CategoryConfig
  /** This category's approved listings, loaded on the server by the route.
   *
   *  `null` means the read FAILED — it is not an empty category. Keeping those
   *  two apart is the whole point: this component used to fetch its own list
   *  and a failure rendered as "no results", which tells someone standing in a
   *  hospital that there is no kosher grocery near them. */
  items: DirectoryResource[] | null
  anchor: DirectoryAnchor
  /** When returning from a form, re-expand this listing's card. */
  reopenItemId?: string | null
  /** Pre-fill the directory's search box (from a landing "Places" result). */
  initialSearch?: string
  onUp: () => void
  /** What `onUp` actually goes to — "Home" on mobile (the home grid IS the
   *  index there), "All resources" on desktop (a separate index page). See
   *  FindResources' upToAllResources, which this mirrors. */
  upLabel?: string
  onAdd: () => void
  onEdit: (item: DirectoryResource) => void
  onReport: (item: DirectoryResource) => void
  /** Navigate to the map screen, carrying the directory's active search + field
   *  filters so the map opens showing the same results. */
  onViewMap?: (query?: string, filters?: MapFilters) => void
}

// Every category renders via the generic, hint-driven card renderer (badges,
// filters, kosher-item tags + search, and upvotes — all from category config).
export default function ResourceLoader({ category, items, anchor, reopenItemId, initialSearch, onUp, upLabel = 'All resources', onAdd, onEdit, onReport, onViewMap }: Props) {
  const title = category.pluralLabel

  // Extract a stable dep from the anchor object (anchor itself is re-created
  // each parent render).
  const anchorCoords = anchor.coords
  // The listing "I'm here" is currently anchored to, if any — see
  // withMilesFromAddress for why it needs this. Optional, not useLocation:
  // this also renders inside the admin's category preview, which has no
  // LocationProvider on purpose (see useOptionalLocation's own note).
  const anchorListingId = useOptionalLocation()?.anchorListingId ?? null

  // Distance to the visitor's anchor: straight-line miles (haversine) from their
  // typed address to each listing's geocoded coordinates.
  const withDistance = useMemo(() => {
    if (!items) return items
    if (category.hasAddress === false) return items
    return withMilesFromAddress(items, anchorCoords, anchorListingId)
  }, [items, anchorCoords, category.hasAddress, anchorListingId])

  // The listings failed to load. Said plainly, because the alternative — an
  // empty directory — is a confident, wrong answer: it tells someone there are
  // no kosher groceries here rather than that we couldn't check.
  //
  // There's no "loading" branch any more. The listings arrive with the page, so
  // by the time this renders they are either here or they failed.
  if (withDistance === null || withDistance === undefined) {
    return (
      <div>
        <UpButton label={upLabel} onClick={onUp} />
        {/* h1, matching DirectoryHeader's real (successfully-loaded) title —
            this is the same page's heading, just its load-failed state. */}
        <h1 className="text-xl font-semibold text-slate-800 mb-4">{title}</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            We couldn’t load {title.toLowerCase()} just now.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            This is a problem on our end, not a sign that there aren’t any. Please try again in a
            moment.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-white cursor-pointer"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  // Subtitle shown under the category title — the visitor's typed location.
  const anchorLabel = anchor.label || undefined

  // Distance-sorted categories prompt for a location when none is set yet.
  // Categories with no address (e.g. WhatsApp groups) aren't distance-based, so skip it.
  const addressPrompt = !anchor.label && category.hasAddress !== false

  return (
    <GenericDirectory category={category} items={withDistance} anchorLabel={anchorLabel} addressPrompt={addressPrompt} reopenItemId={reopenItemId} initialSearch={initialSearch} onUp={onUp} upLabel={upLabel} onAdd={onAdd} onEdit={onEdit} onReport={onReport} onViewMap={onViewMap} />
  )
}
