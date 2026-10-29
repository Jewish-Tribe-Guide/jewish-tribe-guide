import { getAdminClient } from './supabase/admin'
import { getCommunityAdminEmails } from './communityStore'
import { ownHeroWords, type SetupState } from './setup'

// What To do's setup checklist ticks off (setup.ts), read straight from what
// this community has saved. Uncached: it's an admin read, and a step done a
// moment ago should show as done when To do opens.

export async function getSetupState({ slug: community, mission }: { slug: string; mission: string }): Promise<SetupState> {
  const db = getAdminClient()
  const [settings, admins, categories, places] = await Promise.all([
    // The row itself, not getSiteSettings: its logo falls back to none, but
    // its words fall back to the starting copy.
    db.from('site_settings').select('logo_url, desktop_hero_headline, desktop_hero_subhead').eq('community_id', community).maybeSingle(),
    getCommunityAdminEmails(community),
    db.from('category').select('id', { count: 'exact', head: true }).eq('community_id', community),
    db.from('resource').select('id', { count: 'exact', head: true }).eq('community_id', community).eq('status', 'approved'),
  ])
  for (const r of [settings, categories, places]) if (r.error) throw new Error(`Failed to load setup: ${r.error.message}`)
  const row = settings.data as { logo_url: string | null; desktop_hero_headline: string | null; desktop_hero_subhead: string | null } | null
  return {
    logo: !!row?.logo_url?.trim(),
    admins: admins.length,
    categories: categories.count ?? 0,
    places: places.count ?? 0,
    heroWords: ownHeroWords(row && { headline: row.desktop_hero_headline, subhead: row.desktop_hero_subhead }, mission),
  }
}
