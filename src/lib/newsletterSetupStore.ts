import { randomBytes } from 'node:crypto'
import { getAdminClient } from './supabase/admin'

// The newsletter_setup table (migration 090): each community's own key for
// the Gmail script, and when the script last checked in. Uncached: the
// script's route and the admin's Newsletters page. Without the table, no
// community has a key (NEWSLETTER_SECRET still works) and nothing is
// recorded.

export type NewsletterSetup = {
  key: string
  /** The last time the script asked for its senders; null before it has. */
  checkedAt: string | null
  /** The Gmail it runs in, as the script last said. */
  account: string | null
}

export function setupTableMissing(message: string | undefined): boolean {
  return !!message && /\bnewsletter_setup\b/.test(message) && /(does not exist|schema cache)/.test(message)
}

/** Long and random, with a prefix that says what it is. */
export function newKey(): string {
  return `nl_${randomBytes(24).toString('base64url')}`
}

type Row = { key: string; checked_at: string | null; account: string | null }

/** This community's setup, its key made the first time it's asked for;
 *  null without the table. */
export async function getNewsletterSetup(community: string): Promise<NewsletterSetup | null> {
  const db = getAdminClient()
  const made = await db.from('newsletter_setup').upsert({ community_id: community, key: newKey() }, { onConflict: 'community_id', ignoreDuplicates: true })
  if (made.error) {
    if (setupTableMissing(made.error.message)) return null
    throw new Error(`Failed to load the newsletter setup: ${made.error.message}`)
  }
  const { data, error } = await db.from('newsletter_setup').select('key, checked_at, account').eq('community_id', community).single()
  if (error) throw new Error(`Failed to load the newsletter setup: ${error.message}`)
  const row = data as Row
  return { key: row.key, checkedAt: row.checked_at, account: row.account }
}

/** The community whose key this is, or null: no such key, or no table. */
export async function communityOfNewsletterKey(key: string): Promise<string | null> {
  if (!key.startsWith('nl_')) return null
  const { data, error } = await getAdminClient().from('newsletter_setup').select('community_id').eq('key', key).maybeSingle()
  if (error) {
    if (!setupTableMissing(error.message)) console.error('[newsletter-setup] key lookup failed:', error.message)
    return null
  }
  return (data as { community_id: string } | null)?.community_id ?? null
}

/** The script asked for its senders: it's running. Never fails the
 *  script's request. The row is made if the community has none yet (a
 *  script on NEWSLETTER_SECRET). */
export async function recordNewsletterCheck(community: string, account: string | null, now = new Date()): Promise<void> {
  try {
    const db = getAdminClient()
    const made = await db.from('newsletter_setup').upsert({ community_id: community, key: newKey() }, { onConflict: 'community_id', ignoreDuplicates: true })
    if (made.error) {
      if (!setupTableMissing(made.error.message)) console.error('[newsletter-setup] check-in failed:', made.error.message)
      return
    }
    const { error } = await db
      .from('newsletter_setup')
      .update({ checked_at: now.toISOString(), ...(account ? { account } : {}) })
      .eq('community_id', community)
    if (error) console.error('[newsletter-setup] check-in failed:', error.message)
  } catch (err) {
    console.error('[newsletter-setup] check-in failed:', err)
  }
}
