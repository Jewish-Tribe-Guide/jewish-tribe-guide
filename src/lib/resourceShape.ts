import type { ResourceRow, DirectoryResource } from '@/types'

// Flattens a DB row into the shape the display components consume: shared fields
// at the top level, with `details` (category-specific keys like isKosher, hours)
// merged on top. The Google-sync fields (placeId, googleSyncedAt, businessStatus)
// live in `details`, so they surface here automatically via the `...row.details`
// spread — no explicit mapping needed.
export function normalizeRow(row: ResourceRow): DirectoryResource {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    anchorId: row.anchor_id,
    distance: row.distance ?? 0,
    address: row.address ?? '',
    phone: row.phone ?? undefined,
    ...row.details,
  }
}
