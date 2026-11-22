import { getAdminClient } from '@/lib/supabase/admin'
import { jobsOff } from '@/lib/jobOff'
import { normalizeRow } from '@/lib/resourceStore'
import { addWatch, listWatches, removeWatch } from '@/lib/watchStore'
import { readRefuahNear } from '@/lib/refuahRun'
import { isPlaceKind, kindOf } from '@/lib/placeKinds'
import { REFUAH_MATCH_CREATOR, matchRefuah, refuahWatchChanges, wantedRefuahWatches } from '@/lib/refuahMatch'
import type { ResourceRow } from '@/types'
import { readAll } from '@/lib/readAll'

// The Refuah matches' database and network half (refuahMatch.ts has the
// rules). Server-only.

/** Gives every hospital in the guide the Refuah page nearest it, and takes
 *  away the run's own watches it no longer wants. Never touches a watch an
 *  admin added. One request to Refuah per hospital on the map
 *  (readRefuahNear), none for a community with none. Returns what it did, for the
 *  run's log. `only`: that community's hospitals alone. */
export async function syncRefuahWatches(fetcher: typeof fetch = fetch, only?: string): Promise<{ community: string; added: number; removed: number }[]> {
  const supabase = getAdminClient()
  // Each community's hospitals pages, by kind, not address (item 68, Nov
  // 22): another community's needn't be at /hospital.
  const { data: categories, error: categoriesError } = await readAll((from, to) => supabase.from('category').select('id,community_id,place_kind').order('community_id').order('id').range(from, to))
  if (categoriesError) throw new Error(`Couldn’t list the categories: ${categoriesError.message}`)
  const pages = new Set<string>()
  for (const c of (categories ?? []) as { id: string; community_id: string; place_kind?: string | null }[]) {
    if (kindOf({ id: c.id, placeKind: isPlaceKind(c.place_kind) ? c.place_kind : undefined }) === 'hospitals') pages.add(`${c.community_id}|${c.id}`)
  }
  const ids = [...new Set([...pages].map((p) => p.slice(p.indexOf('|') + 1)))]
  if (!ids.length) return []
  const { data: rows, error } = await readAll((from, to) => supabase.from('resource').select('*').eq('status', 'approved').in('category', ids).order('community_id').order('id').range(from, to))
  if (error) throw new Error(`Couldn’t list the hospitals: ${error.message}`)
  const byCommunity = new Map<string, ResourceRow[]>()
  for (const r of (rows ?? []) as ResourceRow[]) {
    if (!pages.has(`${r.community_id}|${r.category}`)) continue
    byCommunity.set(r.community_id, [...(byCommunity.get(r.community_id) ?? []), r])
  }

  const out = []
  for (const [community, communityRows] of byCommunity) {
    if (only && community !== only) continue
    const { watches, available } = await listWatches(community)
    if (!available) continue
    // Hospitals turned off (jobOff.ts): Refuah isn't asked.
    if (jobsOff(watches).includes('hospitals')) continue
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
