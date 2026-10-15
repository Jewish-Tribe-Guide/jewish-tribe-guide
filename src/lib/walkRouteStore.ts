import { getAdminClient } from './supabase/admin'
import type { WalkRoute } from './walkRoutes'

// The walks worked out along the streets (walkRoutes.ts), in the
// walk_route table (migration 080). Without the table, nothing is stored and
// every walk shows its estimate.

type Row = {
  from_id: string
  to_id: string
  from_lat: number
  from_lng: number
  to_lat: number
  to_lng: number
  minutes: number | null
  meters: number | null
}

const COLUMNS = 'from_id,to_id,from_lat,from_lng,to_lat,to_lng,minutes,meters'

export function walkRouteTableMissing(message: string | undefined): boolean {
  return !!message && /\bwalk_route\b/.test(message) && /(does not exist|schema cache)/.test(message)
}

function fromRow(r: Row): WalkRoute {
  return { from: { lat: r.from_lat, lng: r.from_lng }, to: { lat: r.to_lat, lng: r.to_lng }, minutes: r.minutes, meters: r.meters }
}

/** Every walk from one listing, by the place it goes to. */
export async function walkRoutesFrom(community: string, fromId: string): Promise<Record<string, WalkRoute>> {
  const { data, error } = await getAdminClient().from('walk_route').select(COLUMNS).eq('community_id', community).eq('from_id', fromId)
  if (error) {
    if (walkRouteTableMissing(error.message)) return {}
    throw new Error(`Failed to load walks: ${error.message}`)
  }
  return Object.fromEntries(((data ?? []) as Row[]).map((r) => [r.to_id, fromRow(r)]))
}

/** Every walk a community has, by where it starts and then where it goes:
 *  for the nightly job, to work out only what's missing. `available` is
 *  false without migration 080. */
export async function walkRoutesOf(community: string): Promise<{ routes: Map<string, Map<string, WalkRoute>>; available: boolean }> {
  const routes = new Map<string, Map<string, WalkRoute>>()
  // A page at a time: a community's walks pass Supabase's default 1000.
  const PAGE = 1000
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await getAdminClient()
      .from('walk_route')
      .select(COLUMNS)
      .eq('community_id', community)
      .order('from_id')
      .order('to_id')
      .range(start, start + PAGE - 1)
    if (error) {
      if (walkRouteTableMissing(error.message)) return { routes, available: false }
      throw new Error(`Failed to load walks: ${error.message}`)
    }
    for (const r of (data ?? []) as Row[]) {
      const from = routes.get(r.from_id) ?? new Map<string, WalkRoute>()
      from.set(r.to_id, fromRow(r))
      routes.set(r.from_id, from)
    }
    if ((data ?? []).length < PAGE) return { routes, available: true }
  }
}

/** Keeps walks just worked out, over any older ones for the same pair. */
export async function saveWalkRoutes(
  community: string,
  fromId: string,
  walks: readonly ({ toId: string } & WalkRoute)[],
): Promise<void> {
  if (walks.length === 0) return
  const at = new Date().toISOString()
  const rows = walks.map((w) => ({
    community_id: community,
    from_id: fromId,
    to_id: w.toId,
    from_lat: w.from.lat,
    from_lng: w.from.lng,
    to_lat: w.to.lat,
    to_lng: w.to.lng,
    minutes: w.minutes,
    meters: w.meters,
    worked_out_at: at,
  }))
  const { error } = await getAdminClient().from('walk_route').upsert(rows, { onConflict: 'from_id,to_id' })
  if (error) throw new Error(`Failed to save walks: ${error.message}`)
}
