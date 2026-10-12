import { getAdminClient } from './supabase/admin'
import type { Eruv, EruvStatus } from './eruv'
import type { EruvLineFile } from './eruvLine'
import { readingsToReset } from './eruvEdit'

// The eruv table (migration 074): each eruv, its status as last read, and
// where its map is. Uncached: the status changes through the day, and
// /api/eruv reads it fresh. A missing table (the migration not run yet)
// isn't an error: the page falls back to the old list. The maps themselves
// are /api/eruv/maps (eruvMaps.ts), read from each eruv's own file
// (migration 076).

const PUBLIC_COLUMNS =
  'id, name, covers, website, hotline, alerts_url, status_url, status_dated, status, status_words, status_posted_on, status_checked_at, status_error_at, status_error'
const ADMIN_COLUMNS = `${PUBLIC_COLUMNS}, line_url, sort_order, active, line, line_read_at, line_error, line_leave_out`
const SOURCE_COLUMNS = 'community_id, id, name, line_url, line, line_leave_out'
// Migration 076's: until it's run, no markers are hidden and nothing is
// remembered as missing, and everything else works.
const MAP_CHOICE_COLUMNS = 'line_hide_points, line_missing'
const without076 = (message: string | undefined) => !!message && /line_hide_points|line_missing/.test(message)

/** A select of `columns` plus 076's, or without them before it's run. */
async function selectWith076<T>(run: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>, columns: string): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const first = await run(`${columns}, ${MAP_CHOICE_COLUMNS}`)
  const res = first.error && without076(first.error.message) ? await run(columns) : first
  return { data: (res.data as T[] | null) ?? null, error: res.error }
}

type Row = {
  id: string
  name: string
  covers: string | null
  website: string | null
  hotline: string | null
  alerts_url: string | null
  status_url: string | null
  status_dated: boolean
  status: EruvStatus | null
  status_words: string | null
  status_posted_on: string | null
  status_checked_at: string | null
  status_error_at: string | null
  status_error: string | null
}
type AdminRow = Row & {
  line_url: string | null
  sort_order: number
  active: boolean
  line: EruvLineFile | null
  line_read_at: string | null
  line_error: string | null
  line_leave_out: string[] | null
  line_hide_points?: boolean | null
  line_missing?: string[] | null
}

/** Everything an admin sets and sees about one eruv. `rawLine` is the last
 *  good read of its map, every part of it. */
export type AdminEruv = Eruv & {
  lineUrl: string | null
  sortOrder: number
  active: boolean
  rawLine: EruvLineFile | null
  lineReadAt: string | null
  lineError: string | null
  lineLeaveOut: string[]
  lineHidePoints: boolean
  /** Left-out names its map no longer has, as last told to the admins. */
  lineMissing: string[]
}

/** Where an eruv's map is, and what an admin chose to show of it. */
export type EruvMapSource = {
  communityId: string
  id: string
  name: string
  lineUrl: string
  rawLine: EruvLineFile | null
  lineLeaveOut: string[]
  lineHidePoints: boolean
  lineMissing: string[]
}
type SourceRow = { community_id: string; id: string; name: string; line_url: string; line: EruvLineFile | null; line_leave_out: string[] | null; line_hide_points?: boolean | null; line_missing?: string[] | null }
const fromSourceRow = (r: SourceRow): EruvMapSource => ({
  communityId: r.community_id,
  id: r.id,
  name: r.name,
  lineUrl: r.line_url,
  rawLine: r.line,
  lineLeaveOut: r.line_leave_out ?? [],
  lineHidePoints: !!r.line_hide_points,
  lineMissing: r.line_missing ?? [],
})

function fromRow(r: Row): Eruv {
  return {
    id: r.id,
    name: r.name,
    covers: r.covers,
    website: r.website,
    hotline: r.hotline,
    alertsUrl: r.alerts_url,
    statusUrl: r.status_url,
    statusDated: r.status_dated,
    status: r.status,
    statusWords: r.status_words,
    statusPostedOn: r.status_posted_on,
    statusCheckedAt: r.status_checked_at,
    statusErrorAt: r.status_error_at,
    statusError: r.status_error,
  }
}

function fromAdminRow(r: AdminRow): AdminEruv {
  return {
    ...fromRow(r),
    lineUrl: r.line_url,
    sortOrder: r.sort_order,
    active: r.active,
    rawLine: r.line,
    lineReadAt: r.line_read_at,
    lineError: r.line_error,
    lineLeaveOut: r.line_leave_out ?? [],
    lineHidePoints: !!r.line_hide_points,
    lineMissing: r.line_missing ?? [],
  }
}

export function eruvTableMissing(message: string | undefined): boolean {
  return !!message && /\beruv\b/.test(message) && /(does not exist|schema cache)/.test(message)
}

/** A community's active eruvim, in their order. `available` is false
 *  without migration 074. */
export async function listEruvim(community: string): Promise<{ eruvim: Eruv[]; available: boolean }> {
  const { data, error } = await getAdminClient().from('eruv').select(PUBLIC_COLUMNS).eq('community_id', community).eq('active', true).order('sort_order').order('name')
  if (error) {
    if (eruvTableMissing(error.message)) return { eruvim: [], available: false }
    throw new Error(`Failed to load eruvim: ${error.message}`)
  }
  return { eruvim: ((data ?? []) as Row[]).map(fromRow), available: true }
}

/** Every eruv of a community, hidden ones too, for its admin tab. */
export async function listEruvimForAdmin(community: string): Promise<{ eruvim: AdminEruv[]; available: boolean }> {
  const { data, error } = await selectWith076<AdminRow>((cols) => getAdminClient().from('eruv').select(cols).eq('community_id', community).order('sort_order').order('name'), ADMIN_COLUMNS)
  if (error) {
    if (eruvTableMissing(error.message)) return { eruvim: [], available: false }
    throw new Error(`Failed to load eruvim: ${error.message}`)
  }
  return { eruvim: ((data ?? []) as AdminRow[]).map(fromAdminRow), available: true }
}

/** The active eruvim that publish a map: one community's, for its map, or
 *  every community's, for the daily check. */
export async function listEruvMapSources(community?: string): Promise<EruvMapSource[]> {
  const { data, error } = await selectWith076<SourceRow>((cols) => {
    const q = getAdminClient().from('eruv').select(cols).eq('active', true).not('line_url', 'is', null)
    return (community ? q.eq('community_id', community) : q).order('sort_order').order('name')
  }, SOURCE_COLUMNS)
  if (error) {
    if (eruvTableMissing(error.message)) return []
    throw new Error(`Failed to load the eruv maps: ${error.message}`)
  }
  return ((data ?? []) as SourceRow[]).map(fromSourceRow)
}

export type StatusWrite =
  | { ok: true; status: EruvStatus; words: string | null; postedOn: string | null; at: string }
  | { ok: false; error: string; at: string }

/** Records one read of an eruv's page: what it said, or why it couldn't
 *  be read. A failed read keeps the last status, so the page can say
 *  when it was last read properly. */
export async function saveStatusRead(community: string, id: string, read: StatusWrite): Promise<void> {
  const patch = read.ok
    ? { status: read.status, status_words: read.words, status_posted_on: read.postedOn, status_checked_at: read.at, status_error: null, updated_at: read.at }
    : { status_error_at: read.at, status_error: read.error.slice(0, 300), updated_at: read.at }
  const { error } = await getAdminClient().from('eruv').update(patch).eq('community_id', community).eq('id', id)
  if (error) throw new Error(`Failed to save the eruv status: ${error.message}`)
}

/** Records one read of an eruv's map: a new copy when it changed (kept for
 *  when their site can't be reached), or why it couldn't be read. */
export async function saveLineRead(
  community: string,
  id: string,
  read: { ok: true; file: EruvLineFile | null; at: string } | { ok: false; error: string; at: string },
): Promise<void> {
  const patch = read.ok ? { ...(read.file ? { line: read.file } : {}), line_read_at: read.at, line_error: null } : { line_read_at: read.at, line_error: read.error.slice(0, 300) }
  const { error } = await getAdminClient().from('eruv').update(patch).eq('community_id', community).eq('id', id)
  if (error) throw new Error(`Failed to save the eruv map: ${error.message}`)
}

/** The left-out names an eruv's map no longer has, as told to the admins. */
export async function saveLineMissing(community: string, id: string, missing: string[]): Promise<void> {
  const { error } = await getAdminClient().from('eruv').update({ line_missing: missing }).eq('community_id', community).eq('id', id)
  if (error && !without076(error.message)) throw new Error(`Failed to save the eruv map: ${error.message}`)
}

/** The fields an admin edits, by their names in AdminEruv. */
export type EruvEdit = Partial<
  Pick<AdminEruv, 'name' | 'covers' | 'website' | 'hotline' | 'alertsUrl' | 'statusUrl' | 'statusDated' | 'lineUrl' | 'sortOrder' | 'active' | 'lineLeaveOut' | 'lineHidePoints'>
>
const EDIT_COLUMN: Record<keyof EruvEdit, string> = {
  name: 'name',
  covers: 'covers',
  website: 'website',
  hotline: 'hotline',
  alertsUrl: 'alerts_url',
  statusUrl: 'status_url',
  statusDated: 'status_dated',
  lineUrl: 'line_url',
  sortOrder: 'sort_order',
  active: 'active',
  lineLeaveOut: 'line_leave_out',
  lineHidePoints: 'line_hide_points',
}

function editColumns(edit: EruvEdit): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(edit)) if (k in EDIT_COLUMN) out[EDIT_COLUMN[k as keyof EruvEdit]] = v
  return out
}

/** Saves an admin's edit. A new status page or map address starts afresh:
 *  the old reading was of the old page (readingsToReset). */
export async function updateEruv(community: string, id: string, edit: EruvEdit, stored: { statusUrl: string | null; lineUrl: string | null }): Promise<void> {
  const cols = editColumns(edit)
  const reset = readingsToReset(edit, stored)
  if (reset.status) Object.assign(cols, { status: null, status_words: null, status_posted_on: null, status_checked_at: null, status_error_at: null, status_error: null })
  if (reset.line) Object.assign(cols, { line: null, line_read_at: null, line_error: null, line_missing: [] })
  const save = (patch: Record<string, unknown>) =>
    getAdminClient()
      .from('eruv')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('community_id', community)
      .eq('id', id)
  let { error } = await save(cols)
  if (error && without076(error.message)) {
    ;({ error } = await save(Object.fromEntries(Object.entries(cols).filter(([k]) => k !== 'line_hide_points' && k !== 'line_missing'))))
  }
  if (error) throw new Error(`Failed to save the eruv: ${error.message}`)
}

/** Adds an eruv. False when the community already has one by that id. */
export async function addEruv(community: string, id: string, edit: EruvEdit & { name: string }): Promise<boolean> {
  const { error } = await getAdminClient().from('eruv').insert({ community_id: community, id, ...editColumns(edit) })
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return false
    throw new Error(`Failed to add the eruv: ${error.message}`)
  }
  return true
}

export async function removeEruv(community: string, id: string): Promise<void> {
  const { error } = await getAdminClient().from('eruv').delete().eq('community_id', community).eq('id', id)
  if (error) throw new Error(`Failed to remove the eruv: ${error.message}`)
}
