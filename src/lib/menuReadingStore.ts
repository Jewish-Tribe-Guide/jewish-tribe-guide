import { getAdminClient } from './supabase/admin'
import type { MenuDish } from './menuReader'

// What the menu reader proposed for each food place, and what an admin
// decided (menu_reading, migration 065). Uncached: an admin screen. A
// missing table (the migration not run yet) isn't an error: the tab says so.

export type MenuReadingStatus = 'proposed' | 'approved' | 'skipped' | 'failed'

export type StoredMenuReading = {
  resourceId: string
  status: MenuReadingStatus
  sourceUrl: string | null
  dishes: MenuDish[]
  note: string | null
  model: string | null
  readAt: string
  decidedAt: string | null
  decidedBy: string | null
}

function tableMissing(message: string | undefined): boolean {
  return !!message && /menu_reading/.test(message) && /(does not exist|schema cache)/.test(message)
}

const COLUMNS = 'resource_id, status, source_url, dishes, note, model, read_at, decided_at, decided_by'

type Row = {
  resource_id: string
  status: MenuReadingStatus
  source_url: string | null
  dishes: unknown
  note: string | null
  model: string | null
  read_at: string
  decided_at: string | null
  decided_by: string | null
}

function fromRow(r: Row): StoredMenuReading {
  return {
    resourceId: r.resource_id,
    status: r.status,
    sourceUrl: r.source_url,
    dishes: Array.isArray(r.dishes) ? (r.dishes as MenuDish[]) : [],
    note: r.note,
    model: r.model,
    readAt: r.read_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by,
  }
}

/** Every place's reading. `available` is false without migration 065. */
export async function listMenuReadings(community: string): Promise<{ readings: StoredMenuReading[]; available: boolean }> {
  const { data, error } = await getAdminClient().from('menu_reading').select(COLUMNS).eq('community_id', community)
  if (error) {
    if (tableMissing(error.message)) return { readings: [], available: false }
    throw new Error(`Failed to load menu readings: ${error.message}`)
  }
  return { readings: ((data ?? []) as Row[]).map(fromRow), available: true }
}

export async function getMenuReading(community: string, resourceId: string): Promise<StoredMenuReading | null> {
  const { data, error } = await getAdminClient().from('menu_reading').select(COLUMNS).eq('community_id', community).eq('resource_id', resourceId).maybeSingle()
  if (error) throw new Error(`Failed to load the menu reading: ${error.message}`)
  return data ? fromRow(data as Row) : null
}

/** A fresh reading replaces the last, and waits on an admin again. */
export async function saveMenuReading(
  community: string,
  resourceId: string,
  reading: { status: 'proposed' | 'failed'; sourceUrl: string | null; dishes: MenuDish[]; note: string | null; model: string | null },
): Promise<StoredMenuReading> {
  const { data, error } = await getAdminClient()
    .from('menu_reading')
    .upsert(
      {
        community_id: community,
        resource_id: resourceId,
        status: reading.status,
        source_url: reading.sourceUrl,
        dishes: reading.dishes,
        note: reading.note,
        model: reading.model,
        read_at: new Date().toISOString(),
        decided_at: null,
        decided_by: null,
      },
      { onConflict: 'community_id,resource_id' },
    )
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`Failed to save the menu reading: ${error.message}`)
  return fromRow(data as Row)
}

export async function decideMenuReading(community: string, resourceId: string, status: 'approved' | 'skipped', by: string): Promise<void> {
  const { error } = await getAdminClient()
    .from('menu_reading')
    .update({ status, decided_at: new Date().toISOString(), decided_by: by })
    .eq('community_id', community)
    .eq('resource_id', resourceId)
  if (error) throw new Error(`Failed to save the decision: ${error.message}`)
}
