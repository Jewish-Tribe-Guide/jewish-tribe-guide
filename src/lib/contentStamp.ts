import { getAdminClient } from './supabase/admin'

// ── When the content last changed (migration 100) ───────────────────────────
// One row every server reads, so "has anything changed?" gets the same
// answer from all of them. The fingerprint before it was worked out and
// cached by each server, and the live servers held different copies: the
// answer was "changed" on nearly every return to the app, when nothing had,
// and the page re-rendered under the visitor's next tap (Nov 16).

const ROW = 'all'

/** "s:<ms in base 36>", or null when the table isn't there or can't be read. */
export async function readContentStamp(): Promise<string | null> {
  try {
    const { data, error } = await getAdminClient().from('content_stamp').select('changed_at').eq('id', ROW).maybeSingle()
    if (error || !data?.changed_at) return null
    const ms = Date.parse(data.changed_at as string)
    return Number.isFinite(ms) ? `s:${ms.toString(36)}` : null
  } catch {
    return null
  }
}

/** Moves the stamp on. Never fails a save: a missed bump only means an
 *  open tab picks the change up on its next full load. */
export async function bumpContentStamp(): Promise<void> {
  try {
    const { error } = await getAdminClient().from('content_stamp').upsert({ id: ROW, changed_at: new Date().toISOString() })
    if (error) console.error('[content-stamp] bump failed:', error.message)
  } catch (err) {
    console.error('[content-stamp] bump failed:', err)
  }
}
