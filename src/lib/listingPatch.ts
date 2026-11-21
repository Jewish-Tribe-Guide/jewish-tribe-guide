import { getAdminClient } from './supabase/admin'
import { schemaMissing } from './supabase/schemaMissing'

// ── A listing's details, changed key by key (Nov 21, the details move) ──
// The site's jobs read a listing, work out its next `details`, and used to
// write the whole of it back. Anything saved in between (an admin's edit, a
// visitor's Yes, another job) was lost. Here only the keys that differ
// between what was read and what's next are sent, to
// patch_resource_details (migration 111), which changes just those in one
// statement. It's also the only site writer that migration 112 lets change
// the site's own keys (SITE_STATE_KEYS), so every job that writes one of
// them comes through here. src/test/siteStateWriters.test.ts fails on a
// whole `details` write anywhere else.
//
// Where 111 hasn't run yet (said once, saySchemaMissing), it writes the
// whole `details` as before.

type Details = Record<string, unknown>

/** The listing's other columns, when the same write changes them. */
export type ListingColumns = {
  name?: string
  phone?: string | null
  address?: string | null
  category?: string
  anchor_id?: string
  distance?: number | null
  reviewed_at?: string
}

/** What changed from `before` to `after`, top-level key by key. */
export function diffDetails(before: Details, after: Details): { set: Details; unset: string[] } {
  const set: Details = {}
  for (const [key, value] of Object.entries(after)) {
    if (value === undefined) continue
    if (JSON.stringify(value) !== JSON.stringify(before[key])) set[key] = value
  }
  const unset = Object.keys(before).filter((key) => before[key] !== undefined && (after[key] === undefined || !(key in after)))
  return { set, unset }
}

/** Writes what changed from `before` to `after`, and `columns`. With `ifStill`,
 *  only if each value (a dotted path into details: 'sectionConfirmed.weekday')
 *  is still what it was read as; null means absent. True when written: false
 *  when the listing is gone or one of `ifStill` moved. Throws on a failed write. */
export async function patchListing(
  community: string,
  id: string,
  before: Details,
  after: Details,
  { columns, ifStill }: { columns?: ListingColumns; ifStill?: Record<string, string | null> } = {},
): Promise<boolean> {
  const { set, unset } = diffDetails(before, after)
  const cols = columns && Object.keys(columns).length > 0 ? columns : null
  if (Object.keys(set).length === 0 && unset.length === 0 && !cols) return true

  const supabase = getAdminClient()
  const { data, error } = await supabase.rpc('patch_resource_details', {
    p_community: community,
    p_id: id,
    p_set: set,
    p_unset: unset,
    p_columns: cols,
    p_if: ifStill ?? null,
  })
  if (!error) return data === true
  if (!schemaMissing('patch_resource_details', error.message)) throw new Error(error.message)

  // 111 not run here: the whole write, guarded the same way.
  let update = supabase.from('resource').update({ ...cols, details: after }).eq('community_id', community).eq('id', id)
  for (const [path, value] of Object.entries(ifStill ?? {})) {
    const parts = path.split('.')
    const column = parts.length === 1 ? `details->>${parts[0]}` : `details->${parts.slice(0, -1).join('->')}->>${parts[parts.length - 1]}`
    update = value === null ? update.is(column, null) : update.eq(column, value)
  }
  const { data: rows, error: writeError } = await update.select('id')
  if (writeError) throw new Error(writeError.message)
  return (rows ?? []).length > 0
}
