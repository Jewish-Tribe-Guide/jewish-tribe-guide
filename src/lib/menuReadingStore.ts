import { getAdminClient } from './supabase/admin'
import type { MenuDish } from './menuReader'
import { MENU_LINK_KEY } from './menuLink'

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

// ── "No menu" (the user, Oct 20) ─────────────────────────────────────────────
// An admin's word that a place has no menu to read (a butcher, a caterer
// who cooks to order), so it stops counting as "couldn't be read" and isn't
// read again. Kept as a skipped reading with no dishes and this note, so it
// needs no migration. A reading made later (its menu link, photos, the menu
// watch finding dishes) replaces it, as any reading replaces the last.

export const NO_MENU_NOTE = 'No menu'

export function isNoMenu(r: Pick<StoredMenuReading, 'status' | 'note' | 'dishes'>): boolean {
  return r.status === 'skipped' && r.note === NO_MENU_NOTE && r.dishes.length === 0
}

export async function markNoMenu(community: string, resourceId: string, by: string): Promise<StoredMenuReading> {
  const now = new Date().toISOString()
  const { data, error } = await getAdminClient()
    .from('menu_reading')
    .upsert(
      {
        community_id: community,
        resource_id: resourceId,
        status: 'skipped',
        source_url: null,
        dishes: [],
        note: NO_MENU_NOTE,
        model: null,
        read_at: now,
        decided_at: now,
        decided_by: by,
      },
      { onConflict: 'community_id,resource_id' },
    )
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`Failed to save "no menu": ${error.message}`)
  return fromRow(data as Row)
}

/** Takes a place's reading away: "No menu" undone, it's as if never read. */
export async function clearMenuReading(community: string, resourceId: string): Promise<void> {
  const { error } = await getAdminClient().from('menu_reading').delete().eq('community_id', community).eq('resource_id', resourceId)
  if (error) throw new Error(`Failed to clear the menu reading: ${error.message}`)
}

/** Puts a menu link on a live listing (details.menuUrl, menuLink.ts): the
 *  admin's "Give its menu link". From then on the tab reads it first and
 *  the menu watch watches it (syncMenuWatches). Read, then written whole,
 *  as other admin writes to details are. False when the listing isn't live. */
export async function saveMenuLink(community: string, resourceId: string, url: string): Promise<boolean> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.from('resource').select('details').eq('community_id', community).eq('id', resourceId).eq('status', 'approved').maybeSingle()
  if (error) throw new Error(`Failed to load the listing: ${error.message}`)
  if (!data) return false
  const details = { ...((data as { details: Record<string, unknown> | null }).details ?? {}), [MENU_LINK_KEY]: url }
  const { error: saveError } = await supabase.from('resource').update({ details }).eq('community_id', community).eq('id', resourceId)
  if (saveError) throw new Error(`Failed to save the menu link: ${saveError.message}`)
  return true
}
