// A listing's details, changed key by key, for scripts (Nov 21, the details
// move). The scripts' copy of src/lib/listingPatch.ts: since migration 112,
// a plain `update({ details })` has its changes to the site's own keys
// (googleSyncedAt, businessStatus, googleFields, verifiedPlaceId, …: 110's
// site_state_keys) ignored. patch_resource_details (111) is the writer that
// may change them, and it changes only what differs, so nothing saved since
// the script read the listing is lost. src/test/siteStateWriters.test.ts
// fails on a whole `details` write in scripts/ too.

/** What changed from `before` to `after`, top-level key by key. */
export function diffDetails(before, after) {
  const set = {}
  for (const [key, value] of Object.entries(after)) {
    if (value === undefined) continue
    if (JSON.stringify(value) !== JSON.stringify(before[key])) set[key] = value
  }
  const unset = Object.keys(before).filter((key) => before[key] !== undefined && after[key] === undefined)
  return { set, unset }
}

/** Writes what changed from `row.details` to `after`, and `columns` (name, phone,
 *  address, category, …). Throws on a failed write.
 *  @param {Record<string, unknown> | null} [columns] */
export async function patchListing(supabase, row, after, columns = null) {
  const { set, unset } = diffDetails(row.details ?? {}, after)
  const cols = columns && Object.keys(columns).length > 0 ? columns : null
  if (Object.keys(set).length === 0 && unset.length === 0 && !cols) return
  const { error } = await supabase.rpc('patch_resource_details', {
    p_community: row.community_id,
    p_id: row.id,
    p_set: set,
    p_unset: unset,
    p_columns: cols,
    p_if: null,
  })
  if (error) throw new Error(`${row.name ?? row.id}: ${error.message}`)
}
