import { getAdminClient } from './supabase/admin'
import type { ActivityInput } from './activity'

// Writes to the activity log. Best-effort by design: the log is a record of
// what happened, never a gate on it, so a failed insert is reported and
// swallowed. An approval or a "Mark as current" must never fail because the
// history of it couldn't be written.

/** Inserts the rows and returns their ids, in order, or [] on failure. */
export async function recordActivity(rows: ActivityInput[]): Promise<number[]> {
  if (rows.length === 0) return []
  try {
    const insert = (withChanges: boolean) =>
      getAdminClient()
        .from('activity')
        .insert(
          rows.map((r) => ({
            community_id: r.community,
            resource_id: r.resourceId ?? null,
            kind: r.kind,
            source: r.source,
            field_key: r.fieldKey ?? null,
            item: r.item ?? null,
            actor_email: r.actorEmail ?? null,
            submission_id: r.submissionId ?? null,
            ...(withChanges && r.changes ? { changes: r.changes } : {}),
          })),
        )
        .select('id')
    const withChanges = rows.some((r) => r.changes)
    let { data, error } = await insert(withChanges)
    // Before migration 069 the log has no `changes`: the row still goes in,
    // and What changed says "updated" for it, as for any older edit.
    if (error && withChanges && /changes/.test(error.message)) ({ data, error } = await insert(false))
    if (error) throw new Error(error.message)
    return ((data ?? []) as { id: number }[]).map((d) => d.id)
  } catch (err) {
    console.error('[activity] could not record:', err)
    return []
  }
}

/** Removes a visitor's own one-tap from the log when they undo it: a
 *  "Mark as current", an item's "Still here" or "Not anymore". Only ever a
 *  row of that kind from a visitor, on that listing, from the last day, so
 *  the id a browser sends back can't be used to delete anything else. */
export async function removeVisitorActivity(
  activityId: number,
  resourceId: string,
  kind: 'listing_confirmed' | 'item_confirmed' | 'item_reported_gone',
): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { error } = await getAdminClient()
      .from('activity')
      .delete()
      .eq('id', activityId)
      .eq('resource_id', resourceId)
      .eq('kind', kind)
      .eq('source', 'visitor')
      .gte('created_at', since)
    if (error) throw new Error(error.message)
  } catch (err) {
    console.error('[activity] could not remove a visitor’s tap:', err)
  }
}

/** The "Mark as current" undo (removeVisitorActivity). */
export function removeVisitorConfirmation(activityId: number, resourceId: string): Promise<void> {
  return removeVisitorActivity(activityId, resourceId, 'listing_confirmed')
}
