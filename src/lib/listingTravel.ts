import type { DirectoryResource } from '@/types'

// Shared travel/distance helpers for directory listings. A listing carries
// either straight-line miles from the visitor's typed address
// (`milesFromAddress`) or precomputed drive/walk minutes from a hospital
// (`driveMinutes`/`walkMinutes`), depending on the anchor — see ResourceLoader.

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
  if (item.milesFromAddress != null) return [`📍 ${item.milesFromAddress} mi`]
  const parts: string[] = []
  if (item.driveMinutes != null) parts.push(`🚗 ${item.driveMinutes} min`)
  if (item.walkMinutes != null) parts.push(`🚶 ${item.walkMinutes} min`)
  return parts
}
