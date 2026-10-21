import { getAdminClient } from '@/lib/supabase/admin'
import { normalizeRow } from '@/lib/resourceStore'
import { addWatch, listWatches, removeWatch } from '@/lib/watchStore'
import { readRefuahNear } from '@/lib/refuahRun'
import { HOSPITAL_CATEGORY, REFUAH_MATCH_CREATOR, matchRefuah, refuahWatchChanges, wantedRefuahWatches } from '@/lib/refuahMatch'
import type { ResourceRow } from '@/types'

// The Refuah matches' database and network half (refuahMatch.ts has the
// rules). Server-only.

/** Gives every hospital in the guide the Refuah page nearest it, and takes
 *  away the run's own watches it no longer wants. Never touches a watch an
 *  admin added. One request to Refuah per hospital on the map
 *  (readRefuahNear), none for a community with none. Returns what it did, for the
 *  run's log. */
export async function syncRefuahWatches(fetcher: typeof fetch = fetch): Promise<{ community: string; added: number; removed: number }[]> {
  const supabase = getAdminClient()
  const { data: rows, error } = await supabase.from('resource').select('*').eq('status', 'approved').eq('category', HOSPITAL_CATEGORY)
  if (error) throw new Error(`Couldn’t list the hospitals: ${error.message}`)
  const byCommunity = new Map<string, ResourceRow[]>()
  for (const r of (rows ?? []) as ResourceRow[]) byCommunity.set(r.community_id, [...(byCommunity.get(r.community_id) ?? []), r])

  const out = []
  for (const [community, communityRows] of byCommunity) {
    const { watches, available } = await listWatches(community)
    if (!available) continue
    const hospitals = communityRows.map(normalizeRow)
    const list = await readRefuahNear(hospitals.flatMap((h) => (h.geo ? [h.geo] : [])), fetcher)
    // Refuah down: leave every watch as it is, rather than take them all away.
    if ('error' in list) throw new Error(list.error)
    const wanted = wantedRefuahWatches(hospitals, matchRefuah(hospitals, list), watches)
    const { add, remove } = refuahWatchChanges(wanted, watches)
    let added = 0
    for (const w of add) {
      if (await addWatch(community, { kind: 'website', url: w.url, resourceId: w.resourceId, label: w.label, createdBy: REFUAH_MATCH_CREATOR })) added++
    }
    for (const id of remove) await removeWatch(community, id)
    out.push({ community, added, removed: remove.length })
  }
  return out
}
