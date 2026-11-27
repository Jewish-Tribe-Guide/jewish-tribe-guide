import { getAdminClient } from './supabase/admin'
import { schemaMissing } from './supabase/schemaMissing'

// A post or photo sent with the "+ Add" box (sent_message, migration 118).
// Send keeps it here and answers at once; messageFiling.ts reads it in the
// background and files what it reads as ordinary suggestions. What it
// can't file stays here for an admin, as the original (Nov 27,
// docs/add-rethink.md, boards S1b–S3b).

export type SentMessageStatus = 'reading' | 'filed' | 'left' | 'done'

export type SentMessage = {
  id: string
  community: string
  /** The listing the box was opened from, if any. */
  listingId: string | null
  text: string
  photoUrls: string[]
  email: string | null
  status: SentMessageStatus
  submissionIds: string[]
  left: string[]
  attempts: number
  createdAt: string
  readAt: string | null
}

type Row = {
  id: string
  community_id: string
  listing_id: string | null
  text: string
  photo_urls: string[] | null
  email: string | null
  status: SentMessageStatus
  submission_ids: string[] | null
  left_for_admin: string[] | null
  attempts: number
  created_at: string
  read_at: string | null
}

export function fromRow(r: Row): SentMessage {
  return {
    id: r.id,
    community: r.community_id,
    listingId: r.listing_id ?? null,
    text: r.text ?? '',
    photoUrls: r.photo_urls ?? [],
    email: r.email,
    status: r.status,
    submissionIds: r.submission_ids ?? [],
    left: r.left_for_admin ?? [],
    attempts: r.attempts ?? 0,
    createdAt: r.created_at,
    readAt: r.read_at,
  }
}

const TABLE = 'sent_message'

/** Keeps what was sent, to be read. */
export async function createSentMessage(community: string, m: { text: string; photoUrls: string[]; email: string | null; listingId?: string | null }): Promise<SentMessage> {
  const { data, error } = await getAdminClient()
    .from(TABLE)
    .insert({ community_id: community, listing_id: m.listingId ?? null, text: m.text, photo_urls: m.photoUrls, email: m.email })
    .select('*')
    .single()
  if (error) {
    schemaMissing(TABLE, error.message)
    throw new Error(`Failed to keep the message: ${error.message}`)
  }
  return fromRow(data as Row)
}

/** Takes one read of it: only while it's still waiting to be read, and
 *  only if no other read took it since `attempts` was seen, so the read
 *  after Send and a later retry never both file it. */
export async function claimRead(id: string, attempts: number): Promise<SentMessage | null> {
  const { data, error } = await getAdminClient()
    .from(TABLE)
    .update({ attempts: attempts + 1 })
    .eq('id', id)
    .eq('status', 'reading')
    .eq('attempts', attempts)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to take the message: ${error.message}`)
  return data ? fromRow(data as Row) : null
}

/** What the read filed and what it left for an admin. */
export async function finishRead(id: string, filed: string[], left: string[]): Promise<void> {
  const { error } = await getAdminClient()
    .from(TABLE)
    .update({ status: left.length ? 'left' : 'filed', submission_ids: filed, left_for_admin: left, read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Failed to save what was read: ${error.message}`)
}

export async function getSentMessages(community: string, ids: string[]): Promise<SentMessage[]> {
  if (ids.length === 0) return []
  const { data, error } = await getAdminClient().from(TABLE).select('*').eq('community_id', community).in('id', ids)
  if (error) {
    if (schemaMissing(TABLE, error.message)) return []
    throw new Error(`Failed to load the messages: ${error.message}`)
  }
  return (data as Row[]).map(fromRow)
}

/** The email for "email me when it's on the site", given on the thank-you
 *  screen after Send: kept for the read to file with, and returned so
 *  what's already filed gets it too. Only within the hour, and only once. */
export async function attachMessageEmail(community: string, ids: string[], email: string): Promise<SentMessage[]> {
  if (ids.length === 0) return []
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data, error } = await getAdminClient()
    .from(TABLE)
    .update({ email })
    .eq('community_id', community)
    .in('id', ids)
    .is('email', null)
    .gte('created_at', since)
    .select('*')
  if (error) throw new Error(`Failed to add the email: ${error.message}`)
  return (data as Row[]).map(fromRow)
}

/** For the admin: what a read left for them, oldest first. */
export async function listLeftForAdmin(community: string): Promise<SentMessage[]> {
  const { data, error } = await getAdminClient().from(TABLE).select('*').eq('community_id', community).eq('status', 'left').order('created_at', { ascending: true }).limit(100)
  if (error) {
    if (schemaMissing(TABLE, error.message)) return []
    throw new Error(`Failed to load the messages: ${error.message}`)
  }
  return (data as Row[]).map(fromRow)
}

/** Messages a read hasn't finished: the read after Send died, or the AI was
 *  down. Older than `olderThanMs`, so one being read right now is left be. */
export async function listUnread(community: string, olderThanMs: number, maxAttempts: number): Promise<SentMessage[]> {
  const before = new Date(Date.now() - olderThanMs).toISOString()
  const { data, error } = await getAdminClient()
    .from(TABLE)
    .select('*')
    .eq('community_id', community)
    .eq('status', 'reading')
    .lt('attempts', maxAttempts)
    .lt('created_at', before)
    .order('created_at', { ascending: true })
    .limit(5)
  if (error) {
    if (schemaMissing(TABLE, error.message)) return []
    throw new Error(`Failed to load the messages: ${error.message}`)
  }
  return (data as Row[]).map(fromRow)
}

/** An admin dealt with what was left. */
export async function markDone(community: string, id: string): Promise<boolean> {
  const { data, error } = await getAdminClient().from(TABLE).update({ status: 'done' }).eq('community_id', community).eq('id', id).eq('status', 'left').select('id')
  if (error) throw new Error(`Failed to mark it done: ${error.message}`)
  return (data ?? []).length > 0
}
