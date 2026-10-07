import { getAdminClient } from './supabase/admin'
import type { Eruv, EruvStatus } from './eruv'
import { withoutNames, type EruvLineFile } from './eruvLine'
import { readingsToReset } from './eruvEdit'

// The eruv table (migration 074): each eruv, its status as last read, and
// its line. Uncached: the status changes through the day, and /api/eruv
// reads it fresh. A missing table (the migration not run yet) isn't an
// error: the page falls back to the old list.

const PUBLIC_COLUMNS =
  'id, name, covers, website, hotline, alerts_url, status_url, status_dated, status, status_words, status_posted_on, status_checked_at, status_error_at, status_error, line, line_leave_out'
const ADMIN_COLUMNS = `${PUBLIC_COLUMNS}, line_url, sort_order, active, line_pending, line_read_at, line_error, line_approved_at, line_approved_by`

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
  line: EruvLineFile | null
  line_leave_out: string[] | null
}
type AdminRow = Row & {
  line_url: string | null
  sort_order: number
  active: boolean
  line_pending: EruvLineFile | null
  line_read_at: string | null
  line_error: string | null
  line_approved_at: string | null
  line_approved_by: string | null
}

/** Everything an admin sets and sees about one eruv. `rawLine` is the
 *  approved line with every piece, `line` without the ones left out. */
export type AdminEruv = Eruv & {
  lineUrl: string | null
  sortOrder: number
  active: boolean
  rawLine: EruvLineFile | null
  linePending: EruvLineFile | null
  lineReadAt: string | null
  lineError: string | null
  lineApprovedAt: string | null
  lineApprovedBy: string | null
  lineLeaveOut: string[]
}

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
    line: r.line ? withoutNames(r.line, r.line_leave_out ?? []) : null,
  }
}

function fromAdminRow(r: AdminRow): AdminEruv {
  return {
    ...fromRow(r),
    lineUrl: r.line_url,
    sortOrder: r.sort_order,
    active: r.active,
    rawLine: r.line,
    linePending: r.line_pending,
    lineReadAt: r.line_read_at,
    lineError: r.line_error,
    lineApprovedAt: r.line_approved_at,
    lineApprovedBy: r.line_approved_by,
    lineLeaveOut: r.line_leave_out ?? [],
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
  const { data, error } = await getAdminClient().from('eruv').select(ADMIN_COLUMNS).eq('community_id', community).order('sort_order').order('name')
  if (error) {
    if (eruvTableMissing(error.message)) return { eruvim: [], available: false }
    throw new Error(`Failed to load eruvim: ${error.message}`)
  }
  return { eruvim: ((data ?? []) as AdminRow[]).map(fromAdminRow), available: true }
}

/** Every community's active eruvim that publish a line, for the weekly read. */
export async function listEruvimWithLines(): Promise<(AdminEruv & { communityId: string })[]> {
  const { data, error } = await getAdminClient().from('eruv').select(`community_id, ${ADMIN_COLUMNS}`).eq('active', true).not('line_url', 'is', null)
  if (error) {
    if (eruvTableMissing(error.message)) return []
    throw new Error(`Failed to load eruv lines: ${error.message}`)
  }
  return ((data ?? []) as (AdminRow & { community_id: string })[]).map((r) => ({ ...fromAdminRow(r), communityId: r.community_id }))
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

/** Records one read of an eruv's line: a line that differs from the
 *  approved one waits as pending; the same line clears any pending one. */
export async function saveLineRead(
  community: string,
  id: string,
  read: { ok: true; pending: EruvLineFile | null; at: string } | { ok: false; error: string; at: string },
): Promise<void> {
  const patch = read.ok ? { line_pending: read.pending, line_read_at: read.at, line_error: null } : { line_read_at: read.at, line_error: read.error.slice(0, 300) }
  const { error } = await getAdminClient().from('eruv').update(patch).eq('community_id', community).eq('id', id)
  if (error) throw new Error(`Failed to save the eruv line: ${error.message}`)
}

/** An admin's yes to the pending line: it becomes the line on the map. */
export async function approveLine(community: string, id: string, by: string): Promise<boolean> {
  const { data: row, error: readError } = await getAdminClient().from('eruv').select('line_pending').eq('community_id', community).eq('id', id).maybeSingle()
  if (readError) throw new Error(`Failed to load the eruv: ${readError.message}`)
  const pending = (row as { line_pending: EruvLineFile | null } | null)?.line_pending
  if (!pending) return false
  const at = new Date().toISOString()
  const { error } = await getAdminClient()
    .from('eruv')
    .update({ line: pending, line_pending: null, line_approved_at: at, line_approved_by: by, updated_at: at })
    .eq('community_id', community)
    .eq('id', id)
  if (error) throw new Error(`Failed to approve the line: ${error.message}`)
  return true
}

/** The fields an admin edits, by their names in AdminEruv. */
export type EruvEdit = Partial<
  Pick<AdminEruv, 'name' | 'covers' | 'website' | 'hotline' | 'alertsUrl' | 'statusUrl' | 'statusDated' | 'lineUrl' | 'sortOrder' | 'active' | 'lineLeaveOut'>
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
}

function editColumns(edit: EruvEdit): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(edit)) if (k in EDIT_COLUMN) out[EDIT_COLUMN[k as keyof EruvEdit]] = v
  return out
}

/** Saves an admin's edit. A new status page or line address starts afresh:
 *  the old reading was of the old page (readingsToReset). */
export async function updateEruv(community: string, id: string, edit: EruvEdit, stored: { statusUrl: string | null; lineUrl: string | null }): Promise<void> {
  const cols = editColumns(edit)
  const reset = readingsToReset(edit, stored)
  if (reset.status) Object.assign(cols, { status: null, status_words: null, status_posted_on: null, status_checked_at: null, status_error_at: null, status_error: null })
  if (reset.line) Object.assign(cols, { line_pending: null, line_read_at: null, line_error: null })
  const { error } = await getAdminClient()
    .from('eruv')
    .update({ ...cols, updated_at: new Date().toISOString() })
    .eq('community_id', community)
    .eq('id', id)
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
