import { revalidateTag } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { TAGS } from '@/lib/cacheTags'

// ─────────────────────────────────────────────────────────────────────────────
// A watch that read its source today and found a listing just as the guide
// has it moves the listing's date forward: "Confirmed by Keystone-K, Oct 19".
// Before, only an approved suggestion dated a listing, so agreement, the
// usual case, left no trace: the watches ran every day and the dates sat at
// the day of the last approval (the user, Oct 19). Server-only.
//
// The same fields an approval from a named source writes (withConfirmedNow in
// submissionStore.ts), so the date line reads the same either way.
// ─────────────────────────────────────────────────────────────────────────────

const HOUR = 3_600_000

/** The listing's details dated by `named` at `now`, or null when there's
 *  nothing to move: already dated by it in the last half day (a second run,
 *  "Check now"), or dated later than now. */
export function datedBySource(details: Record<string, unknown>, named: string, now: string): Record<string, unknown> | null {
  const at = typeof details.confirmedAt === 'string' ? Date.parse(details.confirmedAt) : NaN
  const since = Date.parse(now) - at
  if (since < 0) return null
  const from = (details.confirmedFrom as { from?: unknown } | undefined)?.from
  if (from === named && since < 12 * HOUR) return null
  const next: Record<string, unknown> = { ...details, confirmedAt: now, confirmedFrom: { from: named, at: now } }
  delete next.confirmedBy
  return next
}

/** Dates each of these live listings by `named` (datedBySource), and says
 *  how many it dated. Each is written only if its date hasn't moved since
 *  it was read: an approval or a visitor's Yes landing in between keeps
 *  theirs, and the next day's run dates it. */
export async function confirmFromSource(community: string, ids: readonly string[], named: string, now = new Date().toISOString()): Promise<number> {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return 0
  const supabase = getAdminClient()
  const { data, error } = await supabase.from('resource').select('id,details').eq('community_id', community).eq('status', 'approved').in('id', wanted)
  if (error) {
    console.error(`[source-confirm] couldn’t read listings for ${named}:`, error.message)
    return 0
  }
  let dated = 0
  for (const row of (data ?? []) as { id: string; details: Record<string, unknown> | null }[]) {
    const details = row.details ?? {}
    const next = datedBySource(details, named, now)
    if (!next) continue
    const update = supabase.from('resource').update({ details: next }).eq('id', row.id)
    const unchanged = typeof details.confirmedAt === 'string' ? update.eq('details->>confirmedAt', details.confirmedAt) : update.is('details->>confirmedAt', null)
    const { data: done, error: writeError } = await unchanged.select('id')
    if (writeError) console.error(`[source-confirm] couldn’t date ${row.id} by ${named}:`, writeError.message)
    else dated += (done ?? []).length
  }
  // The same cached listings every page reads (as a visitor's Yes does).
  // Outside Next (the daily test-project job, scripts/run-test-watches.mts)
  // there is no cache to refresh and revalidateTag throws; the dates are
  // written by then, so the run goes on.
  if (dated > 0) {
    try {
      revalidateTag(TAGS.resources(community), 'max')
    } catch (e) {
      console.error(`[source-confirm] dated ${dated} by ${named}, but couldn’t refresh the cached listings:`, (e as Error).message)
    }
  }
  return dated
}
