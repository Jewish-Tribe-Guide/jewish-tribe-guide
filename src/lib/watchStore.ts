import { getAdminClient } from './supabase/admin'
import type { Watch, WatchKind } from './watches'

// The watch table (migration 070): the outside pages the guide reads on its
// own, and how each run went. Uncached: the cron and an admin screen. A
// missing table (the migration not run yet) isn't an error: the cron falls
// back to the built-in Keystone-K watch and the tab says so.

const COLUMNS =
  'id, community_id, kind, url, resource_id, label, active, created_at, created_by, last_run_at, last_ok_at, last_error, failing_since, last_filed, page_hash, page_changed_at'

type Row = {
  id: string
  community_id: string
  kind: WatchKind
  url: string
  resource_id: string | null
  label: string | null
  active: boolean
  created_at: string
  created_by: string | null
  last_run_at: string | null
  last_ok_at: string | null
  last_error: string | null
  failing_since: string | null
  last_filed: number | null
  page_hash: string | null
  page_changed_at: string | null
}

function fromRow(r: Row): Watch {
  return {
    id: r.id,
    communityId: r.community_id,
    kind: r.kind,
    url: r.url,
    resourceId: r.resource_id,
    label: r.label,
    active: r.active,
    createdAt: r.created_at,
    createdBy: r.created_by,
    lastRunAt: r.last_run_at,
    lastOkAt: r.last_ok_at,
    lastError: r.last_error,
    failingSince: r.failing_since,
    lastFiled: r.last_filed,
    pageHash: r.page_hash,
    pageChangedAt: r.page_changed_at,
  }
}

const TO_COLUMN: Record<string, string> = {
  lastRunAt: 'last_run_at',
  lastOkAt: 'last_ok_at',
  lastError: 'last_error',
  failingSince: 'failing_since',
  lastFiled: 'last_filed',
  pageHash: 'page_hash',
  pageChangedAt: 'page_changed_at',
  active: 'active',
  label: 'label',
  resourceId: 'resource_id',
}

function toColumns(patch: Partial<Watch>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) if (TO_COLUMN[k]) out[TO_COLUMN[k]] = v
  return out
}

export function tableMissing(message: string | undefined): boolean {
  return !!message && /\bwatch\b/.test(message) && /(does not exist|schema cache)/.test(message)
}

/** Every community's watches, for the daily run. `available` is false
 *  without migration 070. */
export async function listAllWatches(): Promise<{ watches: Watch[]; available: boolean }> {
  const { data, error } = await getAdminClient().from('watch').select(COLUMNS).order('created_at')
  if (error) {
    if (tableMissing(error.message)) return { watches: [], available: false }
    throw new Error(`Failed to load watches: ${error.message}`)
  }
  return { watches: ((data ?? []) as Row[]).map(fromRow), available: true }
}

/** One community's watches, for its admin tab. */
export async function listWatches(community: string): Promise<{ watches: Watch[]; available: boolean }> {
  const { data, error } = await getAdminClient().from('watch').select(COLUMNS).eq('community_id', community).order('created_at')
  if (error) {
    if (tableMissing(error.message)) return { watches: [], available: false }
    throw new Error(`Failed to load watches: ${error.message}`)
  }
  return { watches: ((data ?? []) as Row[]).map(fromRow), available: true }
}

export async function getWatch(community: string, id: string): Promise<Watch | null> {
  const { data, error } = await getAdminClient().from('watch').select(COLUMNS).eq('community_id', community).eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to load the watch: ${error.message}`)
  return data ? fromRow(data as Row) : null
}

/** Adds a page. Null when the community already watches that address. */
export async function addWatch(
  community: string,
  watch: { kind: WatchKind; url: string; resourceId: string | null; label: string | null; createdBy: string | null },
): Promise<Watch | null> {
  const { data, error } = await getAdminClient()
    .from('watch')
    .insert({
      community_id: community,
      kind: watch.kind,
      url: watch.url,
      resource_id: watch.resourceId,
      label: watch.label,
      created_by: watch.createdBy,
    })
    .select(COLUMNS)
    .single()
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return null
    throw new Error(`Failed to add the watch: ${error.message}`)
  }
  return fromRow(data as Row)
}

export async function updateWatch(community: string, id: string, patch: Partial<Watch>): Promise<void> {
  const { error } = await getAdminClient().from('watch').update(toColumns(patch)).eq('community_id', community).eq('id', id)
  if (error) throw new Error(`Failed to save the watch: ${error.message}`)
}

export async function removeWatch(community: string, id: string): Promise<void> {
  const { error } = await getAdminClient().from('watch').delete().eq('community_id', community).eq('id', id)
  if (error) throw new Error(`Failed to remove the watch: ${error.message}`)
}
