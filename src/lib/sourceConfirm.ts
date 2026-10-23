import { revalidateTag } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { TAGS } from '@/lib/cacheTags'

// ─────────────────────────────────────────────────────────────────────────────
// A watch that read its source today and found a place just as the guide
// has it moves the date of what it read forward: "Confirmed by Keystone-K,
// Oct 19". Before, only an approved suggestion dated a listing, so
// agreement, the usual case, left no trace: the watches ran every day and
// the dates sat at the day of the last approval (the user, Oct 19).
//
// Only the boxes it read (the user, Oct 23: "We're dating what we're
// checking. We're not dating a whole listing"): a shul's website its
// times, Refuah a hospital's boxes, a kosher list the certification. Each
// box's own date (sectionConfirmed, as a visitor's Yes on it) with who gave
// it (sectionFrom), read by boxDates.ts. Server-only.
// ─────────────────────────────────────────────────────────────────────────────

const HOUR = 3_600_000

/** The listing's details with each of `boxes` dated by `named` at `now`,
 *  or null when there's nothing to move: each already dated by it in the
 *  last half day (a second run, "Check now"), or dated later than now. */
export function datedBySource(details: Record<string, unknown>, named: string, boxes: readonly string[], now: string): Record<string, unknown> | null {
  const dates = { ...((details.sectionConfirmed as Record<string, string> | undefined) ?? {}) }
  const from = { ...((details.sectionFrom as Record<string, { from?: unknown; at?: unknown }> | undefined) ?? {}) }
  let moved = false
  for (const key of new Set(boxes)) {
    const since = Date.parse(now) - Date.parse(dates[key] ?? '')
    if (since < 0) continue
    if (from[key]?.from === named && from[key]?.at === dates[key] && since < 12 * HOUR) continue
    dates[key] = now
    from[key] = { from: named, at: now }
    moved = true
  }
  return moved ? { ...details, sectionConfirmed: dates, sectionFrom: from } : null
}

/** Dates what each of these live listings had read (`boxes`, for each
 *  listing's details) by `named` (datedBySource), and says how many it
 *  dated. Each is written only if its boxes' dates haven't moved since
 *  they were read: a visitor's Yes landing in between keeps theirs, and the
 *  next day's run dates it. */
export async function confirmFromSource(
  community: string,
  ids: readonly string[],
  named: string,
  boxes: readonly string[] | ((details: Record<string, unknown>) => readonly string[]),
  now = new Date().toISOString(),
): Promise<number> {
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
    const keys = typeof boxes === 'function' ? boxes(details) : boxes
    const next = datedBySource(details, named, keys, now)
    if (!next) continue
    const was = (details.sectionConfirmed as Record<string, string> | undefined) ?? {}
    let update = supabase.from('resource').update({ details: next }).eq('id', row.id)
    for (const key of new Set(keys)) update = typeof was[key] === 'string' ? update.eq(`details->sectionConfirmed->>${key}`, was[key]) : update.is(`details->sectionConfirmed->>${key}`, null)
    const { data: done, error: writeError } = await update.select('id')
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
