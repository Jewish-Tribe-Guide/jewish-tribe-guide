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

// Sort comparator: closest first. Miles take priority when present (address
// mode); otherwise drive time, then walk time (hospital mode). Missing values
// sort last. When neither listing has any travel data (no address entered yet,
// or a category with hasAddress: false, e.g. WhatsApp Groups), falls back to
// alphabetical by name rather than leaving listings in arbitrary storage
// order. Shared by every directory so the ordering never drifts.
export function travelCompare(a: DirectoryResource, b: DirectoryResource): number {
  if (a.milesFromAddress != null || b.milesFromAddress != null) {
    return (a.milesFromAddress ?? Infinity) - (b.milesFromAddress ?? Infinity)
  }
  if (a.driveMinutes != null || b.driveMinutes != null) {
    const drive = (a.driveMinutes ?? Infinity) - (b.driveMinutes ?? Infinity)
    if (drive !== 0) return drive
  }
  if (a.walkMinutes != null || b.walkMinutes != null) {
    return (a.walkMinutes ?? Infinity) - (b.walkMinutes ?? Infinity)
  }
  return a.name.localeCompare(b.name)
}

// The travel chips shown on a card, as separate strings so drive/walk can stack
// vertically instead of being joined on one wide line.
export function travelParts(item: DirectoryResource): string[] {
  if (item.milesFromAddress != null) return [`📍 ${roundMiles(item.milesFromAddress)} mi`]
  const parts: string[] = []
  if (item.driveMinutes != null) parts.push(`🚗 ${item.driveMinutes} min`)
  if (item.walkMinutes != null) parts.push(`🚶 ${item.walkMinutes} min`)
  return parts
}
