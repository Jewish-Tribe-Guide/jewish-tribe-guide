import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import { CHANGE_KINDS, type ChangeLogRow } from './whatChanged'
import type { ActivityKind, ActivitySource } from './activity'

// Reads the activity log for What changed (step 7a), and hides a change.
// Never reads who made a change (actor_email): nothing here needs it.

/** Enough rows for the page's 30 days in a busy month; the page filters by
 *  date with the visitor's clock, so a cached read never goes stale on it. */
const ROW_LIMIT = 400

type Row = {
  id: number
  created_at: string
  kind: ActivityKind
  source: ActivitySource
  item: string | null
  submission_id: string | null
  resource_id: string | null
  hidden_at?: string | null
}

/** The newest change rows, each with its listing (any status). Before
 *  migration 068 the log has no hidden_at, and nothing is hidden. */
export async function listChangeLogUncached(community: string): Promise<ChangeLogRow[]> {
  const supabase = getAdminClient()
  const read = (columns: string) =>
    supabase.from('activity').select(columns).eq('community_id', community).in('kind', CHANGE_KINDS).order('created_at', { ascending: false }).limit(ROW_LIMIT)
  const base = 'id, created_at, kind, source, item, submission_id, resource_id'
  let { data, error } = await read(`${base}, hidden_at`)
  if (error && /hidden_at/.test(error.message)) ({ data, error } = await read(base))
  if (error) throw new Error(`Could not read the activity log: ${error.message}`)
  const rows = (data ?? []) as unknown as Row[]

  const ids = [...new Set(rows.map((r) => r.resource_id).filter((id): id is string => !!id))]
  const listings = new Map<string, NonNullable<ChangeLogRow['listing']>>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data: found, error: listingError } = await supabase.from('resource').select('id, name, category, status').in('id', ids.slice(i, i + 200))
    if (listingError) throw new Error(`Could not read the changed listings: ${listingError.message}`)
    for (const l of (found ?? []) as NonNullable<ChangeLogRow['listing']>[]) listings.set(l.id, l)
  }

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    kind: r.kind,
    source: r.source,
    item: r.item,
    submissionId: r.submission_id,
    hidden: !!r.hidden_at,
    listing: r.resource_id ? (listings.get(r.resource_id) ?? null) : null,
  }))
}

/** Cached for the public site; every approval and every Hide clears it
 *  (TAGS.changes is in allCommunityTags). */
export async function listChangeLog(community: string): Promise<ChangeLogRow[]> {
  'use cache'
  cacheTag(TAGS.changes(community))
  cacheLife('days')
  return listChangeLogUncached(community)
}

/** Hides one change (all the log rows it's made of), or shows it again. */
export async function setChangeHidden(community: string, rowIds: number[], hidden: boolean): Promise<void> {
  const { error } = await getAdminClient()
    .from('activity')
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq('community_id', community)
    .in('id', rowIds)
  if (error) {
    if (/hidden_at/.test(error.message)) throw new MissingHiddenColumnError()
    throw new Error(`Could not hide the change: ${error.message}`)
  }
}

/** Hiding before migration 068 (supabase/migrations/20240101000068_activity_hidden.sql). */
export class MissingHiddenColumnError extends Error {
  constructor() {
    super('Hiding a change needs the database update in migration 068 (activity_hidden) first.')
  }
}
