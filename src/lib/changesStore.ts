import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import { CHANGE_KINDS, type ChangeLogRow } from './whatChanged'
import type { ActivityKind, ActivitySource } from './activity'
import type { ChangePart } from './changeParts'

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
  field_key: string | null
  hidden_at?: string | null
  changes?: ChangePart[] | null
}

/** Columns added after the log was (068, 069): read when they're there.
 *  Before 068 nothing is hidden; before 069 every edit says "updated". */
const LATER_COLUMNS = ['hidden_at', 'changes'] as const

function missingLater(error: { message: string } | null, columns: readonly string[]): string | undefined {
  return error ? LATER_COLUMNS.find((c) => columns.includes(c) && error.message.includes(c)) : undefined
}

/** The newest change rows, each with its listing (any status). */
export async function listChangeLogUncached(community: string): Promise<ChangeLogRow[]> {
  const supabase = getAdminClient()
  const read = (columns: readonly string[]) =>
    supabase.from('activity').select(columns.join(', ')).eq('community_id', community).in('kind', CHANGE_KINDS).order('created_at', { ascending: false }).limit(ROW_LIMIT)
  let columns: string[] = ['id', 'created_at', 'kind', 'source', 'item', 'field_key', 'submission_id', 'resource_id', ...LATER_COLUMNS]
  let { data, error } = await read(columns)
  // One missing column is reported at a time, in whatever order: drop each
  // as it's named, until the read works or fails for another reason.
  for (let later = missingLater(error, columns); later; later = missingLater(error, columns)) {
    columns = columns.filter((c) => c !== later)
    ;({ data, error } = await read(columns))
  }
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
    fieldKey: r.field_key,
    submissionId: r.submission_id,
    hidden: !!r.hidden_at,
    changes: Array.isArray(r.changes) ? r.changes : null,
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
