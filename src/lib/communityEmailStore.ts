import { getAdminClient } from './supabase/admin'
import { schemaMissing } from './supabase/schemaMissing'
import { setupTableMissing } from './newsletterSetupStore'

// The community email (boards E1-E3, Nov 25): the guide's own Gmail. Saved on
// the community row (migration 116). Before that's saved, or before the
// migration runs, the Gmail the newsletter script last said it runs in is
// the same thing: the newsletter steps say to make the guide a Gmail first.
// Uncached: admin screens and outgoing emails only.

export type CommunityEmail = {
  /** The address, or null when there's none yet. */
  email: string | null
  /** False until migration 116 has run: it can't be saved yet. */
  canSave: boolean
  /** When the newsletter script in it last checked in; null: never. */
  checkedAt: string | null
}

export async function getCommunityEmail(slug: string): Promise<CommunityEmail> {
  const db = getAdminClient()
  const [own, script] = await Promise.all([
    db.from('community').select('contact_email').eq('slug', slug).maybeSingle(),
    db.from('newsletter_setup').select('account, checked_at').eq('community_id', slug).maybeSingle(),
  ])
  const canSave = !(own.error && schemaMissing('contact_email', own.error.message))
  if (own.error && canSave) throw new Error(`Failed to load the community email: ${own.error.message}`)
  if (script.error && !setupTableMissing(script.error.message)) throw new Error(`Failed to load the community email: ${script.error.message}`)
  const saved = (own.data as { contact_email: string | null } | null)?.contact_email?.trim()
  const row = script.data as { account: string | null; checked_at: string | null } | null
  const account = row?.account?.trim()
  return { email: saved || account || null, canSave, checkedAt: row?.checked_at ?? null }
}

/** A shape check, the same low bar as the Team tab's. */
export function readEmail(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null
}

/** False before migration 116. */
export async function saveCommunityEmail(slug: string, email: string): Promise<boolean> {
  const { error } = await getAdminClient().from('community').update({ contact_email: email }).eq('slug', slug)
  if (!error) return true
  if (schemaMissing('contact_email', error.message)) return false
  throw new Error(`Failed to save the community email: ${error.message}`)
}
