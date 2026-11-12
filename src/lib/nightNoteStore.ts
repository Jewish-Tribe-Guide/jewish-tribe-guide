import { getAdminClient } from './supabase/admin'
import type { StatusChange } from './email'

// The night_note table (migration 096): what the night's jobs saw that
// nobody has to decide and that leaves no trace of its own, kept for the
// nightly email (nightlyEmail.ts). Today, Google marking a place closed or
// open again. Server-only, uncached.

/** How long a note is kept. */
const KEEP_DAYS = 14

function noteTableMissing(message: string | undefined): boolean {
  return !!message && /\bnight_note\b/.test(message) && /(does not exist|schema cache)/.test(message)
}

/** Keeps Google's status changes for tonight's email. False when there's
 *  nowhere to keep them (no migration 096): the caller emails them now. */
export async function keepStatusChanges(changes: readonly StatusChange[], now: Date = new Date()): Promise<boolean> {
  if (!changes.length) return true
  const db = getAdminClient()
  const rows = changes.map((c) => ({
    community_id: c.communitySlug,
    kind: 'google-status',
    body: { name: c.name, category: c.category, from: c.from, to: c.to },
    created_at: now.toISOString(),
  }))
  const { error } = await db.from('night_note').insert(rows)
  if (error) {
    if (noteTableMissing(error.message)) return false
    throw new Error(`Couldn’t keep the status changes: ${error.message}`)
  }
  const before = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString()
  await db
    .from('night_note')
    .delete()
    .lt('created_at', before)
    .then(({ error: e }) => e && console.error('[night-note] prune:', e.message))
  return true
}

/** A community's status changes since `since`, oldest first. None
 *  without the table. */
export async function statusChangesSince(community: string, since: string): Promise<StatusChange[]> {
  const { data, error } = await getAdminClient()
    .from('night_note')
    .select('body, created_at')
    .eq('community_id', community)
    .eq('kind', 'google-status')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
  if (error) {
    if (noteTableMissing(error.message)) return []
    throw new Error(`Couldn’t read the night’s notes: ${error.message}`)
  }
  return ((data ?? []) as { body: Omit<StatusChange, 'communitySlug'> }[]).map((r) => ({ ...r.body, communitySlug: community }))
}
