import { getAdminClient } from './supabase/admin'

// ── When the content last changed (migration 100) ───────────────────────────
// One row every server reads, so "has anything changed?" gets the same
// answer from all of them. The fingerprint before it was worked out and
// cached by each server, and the live servers held different copies: the
// answer was "changed" on nearly every return to the app, when nothing had,
// and the page re-rendered under the visitor's next tap (Nov 16).
//
// A row per community too (Nov 20): an admin save moves its own
// community's, so a tab open on another community isn't told to re-render
// for a change it can't see. A save that reaches every community (a
// nightly job, the site owner's) moves 'all'. A community's stamp is the
// later of the two. Its rows need no migration: the table's id is text,
// and the service role inserts them on the first save.

const ALL = 'all'
/** Prefixed, so a community can never be called 'all'. */
const rowOf = (community: string) => `c:${community}`

/** "s:<ms in base 36>", or null when the table isn't there or can't be read. */
export async function readContentStamp(community: string): Promise<string | null> {
  try {
    const { data, error } = await getAdminClient().from('content_stamp').select('changed_at').in('id', [ALL, rowOf(community)])
    if (error || !data?.length) return null
    const ms = Math.max(...data.map((r) => Date.parse(r.changed_at as string)).filter(Number.isFinite))
    return Number.isFinite(ms) ? `s:${ms.toString(36)}` : null
  } catch {
    return null
  }
}

/** Moves the stamp on: these communities', or every community's when none
 *  are named. Never fails a save: a missed bump only means an open tab picks
 *  the change up on its next full load. */
export async function bumpContentStamp(communities?: string[]): Promise<void> {
  const changed_at = new Date().toISOString()
  const rows = communities ? communities.map((c) => ({ id: rowOf(c), changed_at })) : [{ id: ALL, changed_at }]
  if (!rows.length) return
  try {
    const { error } = await getAdminClient().from('content_stamp').upsert(rows)
    if (error) console.error('[content-stamp] bump failed:', error.message)
  } catch (err) {
    console.error('[content-stamp] bump failed:', err)
  }
}
