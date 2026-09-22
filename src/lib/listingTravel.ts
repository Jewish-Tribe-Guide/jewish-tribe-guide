import type { DirectoryResource } from '@/types'
import { haversineMiles, roundMiles, type LatLng } from './geo'

// Shared travel/distance helpers for directory listings. A listing carries
// either straight-line miles from the visitor's typed address
// (`milesFromAddress`) or precomputed drive/walk minutes from a hospital
// (`driveMinutes`/`walkMinutes`), depending on the anchor — see ResourceLoader.
//
// `milesFromAddress` is stored UNROUNDED — see roundMiles in geo.ts for why:
// two listings a couple hundred feet apart round to the same 0.1-mile bucket
// and would otherwise tie in travelCompare below, falling back to whatever
// order they loaded in. Only travelParts, which renders the label, rounds.

/** Stamps unrounded straight-line `milesFromAddress` on every listing that
 *  has coordinates, measured from `coords`. `anchorListingId` — the listing
 *  "I'm here" (see SetLocationButton) is currently anchored to, if any — is
 *  forced to exactly 0 rather than trusting the haversine math to land
 *  there: it's the point every other distance is measured FROM, so it must
 *  sort first by definition, not by coincidence of floating-point
 *  precision or a stored `geo` that's drifted a hair from what set the
 *  anchor. */
export function withMilesFromAddress<T extends DirectoryResource>(
  items: T[],
  coords: LatLng | null | undefined,
  anchorListingId?: string | null,
): T[] {
  if (!coords) return items
  return items.map((item) => {
    if (!item.geo) return item
    const miles = item.id === anchorListingId ? 0 : haversineMiles(coords, item.geo)
    return { ...item, milesFromAddress: miles }
  })
}

// Sort comparator: closest first. Miles (address mode) is the only live
// travel signal — see DirectoryResource's own comment on why driveMinutes/
// walkMinutes are dormant fields, never populated on a general listing, so
// there was never a real tie for them to break here. When neither listing
// has any travel data (no address entered yet, or a category with
// hasAddress: false, e.g. WhatsApp Groups), falls back to alphabetical by
// name rather than leaving listings in arbitrary storage order. Shared by
// every directory so the ordering never drifts.
export function travelCompare(a: DirectoryResource, b: DirectoryResource): number {
  if (a.milesFromAddress != null || b.milesFromAddress != null) {
    return (a.milesFromAddress ?? Infinity) - (b.milesFromAddress ?? Infinity)
  }
  return a.name.localeCompare(b.name)
}

// The travel chip shown on a card. `kind` used to distinguish distance from
// drive/walk minutes (a dormant, never-populated pair of fields — see
// DirectoryResource's own comment), which this file no longer renders at
// all; kept as a single-key union rather than dropped outright so a future
// travel kind (e.g. transit) has an obvious place to join it, and so the
// caller's `kind === 'distance'` check (GenericListingCard) still documents
// what this value actually is rather than just being a bare string.
export type TravelPart = { kind: 'distance'; text: string }

export function travelParts(item: DirectoryResource): TravelPart[] {
  if (item.milesFromAddress != null) return [{ kind: 'distance', text: `${roundMiles(item.milesFromAddress)} mi` }]
  return []
}
