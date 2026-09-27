import { getAdminClient } from './supabase/admin'
import type { MissCountRow } from './missedSearches'

// Reads for the admin's "Missed searches" list (see missedSearches.ts), and
// its one write: dismissing a search, or taking the dismissal back. Uncached:
// it's an admin screen, and a dismissal should show the moment it's made.

const PAGE = 1000

/** Every day's count of every search that found nothing, for one community.
 *  Paged, since PostgREST stops at 1000 rows a request. */
export async function listSearchMissCounts(community: string): Promise<MissCountRow[]> {
  const out: MissCountRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getAdminClient()
      .from('daily_count')
      .select('key, day, count')
      .eq('community_id', community)
      .eq('kind', 'search_miss')
      .order('day', { ascending: false })
      .order('key')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to load missed searches: ${error.message}`)
    out.push(...(data as MissCountRow[]))
    if (data.length < PAGE) return out
  }
}

/** Dismissed searches, by their text. `available` is false when migration
 *  058 hasn't been applied: the list still loads, and Dismiss says why it
 *  can't work yet. */
export async function listSearchMissDismissals(community: string): Promise<{ dismissed: Map<string, string>; available: boolean }> {
  const { data, error } = await getAdminClient()
    .from('search_miss_dismissal')
    .select('key, dismissed_at')
    .eq('community_id', community)
  if (error) {
    console.error('[missed-searches] dismissals unavailable:', error.message)
    return { dismissed: new Map(), available: false }
  }
  return { dismissed: new Map((data as { key: string; dismissed_at: string }[]).map((r) => [r.key, r.dismissed_at])), available: true }
}

export async function setSearchMissDismissed(community: string, key: string, dismissed: boolean): Promise<void> {
  const table = getAdminClient().from('search_miss_dismissal')
  const { error } = dismissed
    ? await table.upsert({ community_id: community, key, dismissed_at: new Date().toISOString() }, { onConflict: 'community_id,key' })
    : await table.delete().eq('community_id', community).eq('key', key)
  if (error) throw new Error(error.message)
}
