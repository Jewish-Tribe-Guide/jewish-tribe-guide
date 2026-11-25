import { getAdminClient } from './supabase/admin'
import { getCommunityAdminEmails } from './communityStore'
import { setupTableMissing } from './newsletterSetupStore'
import type { SetupState } from './setup'

// What To do's setup checklist ticks off (setup.ts), read straight from what
// this community has saved. Uncached: it's an admin read, and a step done a
// moment ago should show as done when To do opens.

export async function getSetupState({ slug: community }: { slug: string }): Promise<SetupState> {
  const db = getAdminClient()
  const [settings, admins, newsletters, categories, places] = await Promise.all([
    // The row itself, not getSiteSettings: its logo falls back to none.
    db.from('site_settings').select('logo_url').eq('community_id', community).maybeSingle(),
    getCommunityAdminEmails(community),
    // Read, never made: the Newsletters page makes the row (and its key).
    db.from('newsletter_setup').select('checked_at').eq('community_id', community).maybeSingle(),
    db.from('category').select('id', { count: 'exact', head: true }).eq('community_id', community),
    db.from('resource').select('id', { count: 'exact', head: true }).eq('community_id', community).eq('status', 'approved'),
  ])
  for (const r of [settings, categories, places]) if (r.error) throw new Error(`Failed to load setup: ${r.error.message}`)
  if (newsletters.error && !setupTableMissing(newsletters.error.message)) throw new Error(`Failed to load setup: ${newsletters.error.message}`)
  return {
    logo: !!(settings.data as { logo_url: string | null } | null)?.logo_url?.trim(),
    admins: admins.length,
    newsletters: !!(newsletters.data as { checked_at: string | null } | null)?.checked_at,
    categories: categories.count ?? 0,
    places: places.count ?? 0,
  }
}
