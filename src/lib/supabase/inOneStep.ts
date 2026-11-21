import { getAdminClient } from './admin'
import { schemaMissing } from './schemaMissing'

// ── Deletes that go all at once (Nov 21, the save survey's item 6) ──
// Migration 109 adds delete_category, delete_form and delete_community:
// each runs its deletes in one transaction, so a failure partway leaves
// nothing half-deleted. Until it has run on a project, the store keeps its
// old step-by-step delete; schemaMissing says once that 109 is missing.

/** Runs SQL function `fn`: true when it ran, false when this database
 *  doesn't have it yet (do it the old way), and throws on any other error,
 *  with nothing deleted. */
export async function inOneStep(fn: string, args: Record<string, unknown>, failed: string): Promise<boolean> {
  const { error } = await getAdminClient().rpc(fn, args)
  if (!error) return true
  if (schemaMissing(fn, error.message)) return false
  throw new Error(`${failed}: ${error.message}`)
}
