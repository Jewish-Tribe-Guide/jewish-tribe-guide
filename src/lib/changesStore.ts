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

/** Listing ids per log read: each is a query-string entry. */
const IDS_PER_READ = 100

type Listing = NonNullable<ChangeLogRow['listing']>

/** The newest change rows, each with its listing (any status).
 *
 *  Only rows on a listing this community still has: What changed drops the
 *  rest anyway (whatChanged), and reading them first let them crowd out the
 *  real ones. On dev, which shares its project with the write suites, the
 *  test fixtures' rows (4,307 in two weeks, Nov 15, every one on a listing
 *  deleted again) filled all 400 and the page said nothing had changed. */
export async function listChangeLogUncached(community: string): Promise<ChangeLogRow[]> {
  const supabase = getAdminClient()

  const listings = new Map<string, Listing>()
  for (let from = 0; ; from += 1000) {
    const { data: found, error: listingError } = await supabase.from('resource').select('id, name, category, status').eq('community_id', community).order('id').range(from, from + 999)
    if (listingError) throw new Error(`Could not read the changed listings: ${listingError.message}`)
    for (const l of (found ?? []) as Listing[]) listings.set(l.id, l)
    if ((found ?? []).length < 1000) break
  }
  const ids = [...listings.keys()]
  if (ids.length === 0) return []

  // Columns added later are dropped as they're reported missing, once, and
  // the narrower list kept for the rest of the reads.
  let columns: string[] = ['id', 'created_at', 'kind', 'source', 'item', 'field_key', 'submission_id', 'resource_id', ...LATER_COLUMNS]
  const read = async (chunk: string[]): Promise<Row[]> => {
    const query = () =>
      supabase.from('activity').select(columns.join(', ')).eq('community_id', community).in('kind', CHANGE_KINDS).in('resource_id', chunk).order('created_at', { ascending: false }).limit(ROW_LIMIT)
    let { data, error } = await query()
    // One missing column is reported at a time, in whatever order: drop each
    // as it's named, until the read works or fails for another reason.
    for (let later = missingLater(error, columns); later; later = missingLater(error, columns)) {
      columns = columns.filter((c) => c !== later)
      ;({ data, error } = await query())
    }
    if (error) throw new Error(`Could not read the activity log: ${error.message}`)
    return (data ?? []) as unknown as Row[]
  }
  const rows: Row[] = []
  for (let i = 0; i < ids.length; i += IDS_PER_READ) rows.push(...(await read(ids.slice(i, i + IDS_PER_READ))))
  rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)

  return rows.slice(0, ROW_LIMIT).map((r) => ({
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
