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
    const { data, error } = await getAdminClient()
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
        })),
      )
      .select('id')
    if (error) throw new Error(error.message)
    return ((data ?? []) as { id: number }[]).map((d) => d.id)
  } catch (err) {
    console.error('[activity] could not record:', err)
    return []
  }
}

/** Removes a visitor's own confirmation from the log when they undo it. Only
 *  ever a `listing_confirmed` row from a visitor, on that listing, from the
 *  last day, so the id a browser sends back can't be used to delete anything
 *  else. */
export async function removeVisitorConfirmation(activityId: number, resourceId: string): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { error } = await getAdminClient()
      .from('activity')
      .delete()
      .eq('id', activityId)
      .eq('resource_id', resourceId)
      .eq('kind', 'listing_confirmed')
      .eq('source', 'visitor')
      .gte('created_at', since)
    if (error) throw new Error(error.message)
  } catch (err) {
    console.error('[activity] could not remove confirmation:', err)
  }
}
