import type { DirectoryResource } from '@/types'

// Shared travel/distance helpers for directory listings. A listing carries
// either straight-line miles from the visitor's typed address
// (`milesFromAddress`) or precomputed drive/walk minutes from a hospital
// (`driveMinutes`/`walkMinutes`), depending on the anchor — see ResourceLoader.

// Sort comparator: closest first. Miles take priority when present (address
// mode); otherwise drive time, then walk time (hospital mode). Missing values
// sort last. Shared by every directory so the ordering never drifts.
export function travelCompare(a: DirectoryResource, b: DirectoryResource): number {
  if (a.milesFromAddress != null || b.milesFromAddress != null) {
    return (a.milesFromAddress ?? Infinity) - (b.milesFromAddress ?? Infinity)
  }
  const drive = (a.driveMinutes ?? Infinity) - (b.driveMinutes ?? Infinity)
  if (drive !== 0) return drive
  return (a.walkMinutes ?? Infinity) - (b.walkMinutes ?? Infinity)
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
