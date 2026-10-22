import { createHash } from 'node:crypto'
import { getAdminClient } from './supabase/admin'
import type { Eruv, EruvStatus } from './eruv'
import type { EruvLineFile } from './eruvLine'
import { readingsToReset } from './eruvEdit'
import type { KeptEmail } from './eruvEmail'

// The eruv table (migration 074): each eruv, its status as last read, and
// where its map is. Uncached: the status changes through the day, and
// /api/eruv reads it fresh. A missing table (the migration not run yet)
// isn't an error: the page falls back to the old list. The maps themselves
// are /api/eruv/maps (eruvMaps.ts), read from each eruv's own file
// (migration 076), its lines in an admin's colour if one is set (081).
// An eruv with no status page can have its status emailed instead (084:
// eruvEmail.ts).

const PUBLIC_COLUMNS =
  'id, name, covers, website, hotline, alerts_url, status_url, status_dated, status, status_words, status_posted_on, status_checked_at, status_error_at, status_error'
const ADMIN_COLUMNS = `${PUBLIC_COLUMNS}, line_url, sort_order, active, line, line_read_at, line_error, line_leave_out`
const SOURCE_COLUMNS = 'community_id, id, name, line_url, line, line_leave_out, line_error'
// Columns later migrations add (076, 081, 084). Until one is run, what it
// adds isn't there (no markers hidden, nothing remembered as missing, the
// eruv's own colours, no status by email) and everything else works.
const EMAIL_COLUMNS = ['status_email', 'status_email_kept']
const LATER_COLUMNS = ['line_hide_points', 'line_missing', 'line_color', ...EMAIL_COLUMNS]
const laterNamed = (message: string | undefined) => LATER_COLUMNS.filter((c) => !!message && message.includes(c))

/** A select of `columns` plus the later ones, less any not there yet. */
async function selectWithLater<T>(
  run: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  columns: string,
  laterWanted: string[] = LATER_COLUMNS,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  let later = laterWanted
  let res = await run([columns, ...later].join(', '))
  // Postgres names one missing column at a time.
  while (res.error) {
    const named = laterNamed(res.error.message).filter((c) => later.includes(c))
    if (!named.length) break
    later = later.filter((c) => !named.includes(c))
    res = await run([columns, ...later].join(', '))
  }
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
  status_email?: string | null
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
  line_color?: string | null
  status_email_kept?: KeptEmail | null
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
  /** '#rrggbb' to draw its lines in; null, its own colours. */
  lineColor: string | null
  /** The address its status emails come from (eruvEmail.ts). */
  statusEmail: string | null
  /** The last email from it the guide couldn't read, for an admin. */
  statusEmailKept: KeptEmail | null
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
  lineColor: string | null
  /** Why its last read failed, if it did. */
  lineError: string | null
}
type SourceRow = {
  community_id: string
  id: string
  name: string
  line_url: string
  line: EruvLineFile | null
  line_leave_out: string[] | null
  line_hide_points?: boolean | null
  line_missing?: string[] | null
  line_color?: string | null
  line_error?: string | null
}
const fromSourceRow = (r: SourceRow): EruvMapSource => ({
  communityId: r.community_id,
  id: r.id,
  name: r.name,
  lineUrl: r.line_url,
  rawLine: r.line,
  lineLeaveOut: r.line_leave_out ?? [],
  lineHidePoints: !!r.line_hide_points,
  lineMissing: r.line_missing ?? [],
  lineColor: r.line_color ?? null,
  lineError: r.line_error ?? null,
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
    // Whether, never the address: that's an admin's.
    statusEmailed: !!r.status_email,
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
    lineColor: r.line_color ?? null,
    statusEmail: r.status_email ?? null,
    statusEmailKept: r.status_email_kept ?? null,
  }
}

export function eruvTableMissing(message: string | undefined): boolean {
  return !!message && /\beruv\b/.test(message) && /(does not exist|schema cache)/.test(message)
}

/** A community's active eruvim, in their order. `available` is false
 *  without migration 074. */
export async function listEruvim(community: string): Promise<{ eruvim: Eruv[]; available: boolean }> {
  const { data, error } = await selectWithLater<Row>(
    (cols) => getAdminClient().from('eruv').select(cols).eq('community_id', community).eq('active', true).order('sort_order').order('name'),
    PUBLIC_COLUMNS,
    ['status_email'],
  )
  if (error) {
    if (eruvTableMissing(error.message)) return { eruvim: [], available: false }
    throw new Error(`Failed to load eruvim: ${error.message}`)
  }
  return { eruvim: ((data ?? []) as Row[]).map(fromRow), available: true }
}

/** Every eruv of a community, hidden ones too, for its admin tab. */
export async function listEruvimForAdmin(community: string): Promise<{ eruvim: AdminEruv[]; available: boolean }> {
  const { data, error } = await selectWithLater<AdminRow>((cols) => getAdminClient().from('eruv').select(cols).eq('community_id', community).order('sort_order').order('name'), ADMIN_COLUMNS)
  if (error) {
    if (eruvTableMissing(error.message)) return { eruvim: [], available: false }
    throw new Error(`Failed to load eruvim: ${error.message}`)
  }
  return { eruvim: ((data ?? []) as AdminRow[]).map(fromAdminRow), available: true }
}

/** The active eruvim that publish a map: one community's, for its map, or
 *  every community's, for the daily check. */
export async function listEruvMapSources(community?: string): Promise<EruvMapSource[]> {
  const { data, error } = await selectWithLater<SourceRow>((cols) => {
    const q = getAdminClient().from('eruv').select(cols).eq('active', true).not('line_url', 'is', null)
    return (community ? q.eq('community_id', community) : q).order('sort_order').order('name')
  }, SOURCE_COLUMNS)
  if (error) {
    if (eruvTableMissing(error.message)) return []
    throw new Error(`Failed to load the eruv maps: ${error.message}`)
  }
  return ((data ?? []) as SourceRow[]).map(fromSourceRow)
}

/** A short fingerprint of what an admin chose about a community's maps:
 *  which eruvim show, where each map is, what's left out, markers hidden,
 *  their line colour. /api/eruv/maps is kept at the CDN for an hour, so the
 *  maps are asked for under this (Oct 15: a colour changed in the admin was
 *  still the old one on the map). An admin's change is a new address, read
 *  fresh; nothing else is. Not the eruv's own map changing: that's the
 *  hour. Null when it can't be read; the maps are then asked for as before. */
export async function eruvMapsVersion(community: string): Promise<string | null> {
  const { data, error } = await selectWithLater<Record<string, unknown>>(
    (cols) => getAdminClient().from('eruv').select(cols).eq('community_id', community).order('id'),
    'id, active, line_url, line_leave_out',
  )
  if (error || !data) return null
  return createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 12)
}

export type StatusWrite =
  | { ok: true; status: EruvStatus; words: string | null; postedOn: string | null; at: string }
  | { ok: false; error: string; at: string }

function statusPatch(read: StatusWrite): Record<string, unknown> {
  return read.ok
    ? { status: read.status, status_words: read.words, status_posted_on: read.postedOn, status_checked_at: read.at, status_error: null, updated_at: read.at }
    : { status_error_at: read.at, status_error: read.error.slice(0, 300), updated_at: read.at }
}

/** Records one read of an eruv's page: what it said, or why it couldn't
 *  be read. A failed read keeps the last status, so the page can say
 *  when it was last read properly. */
export async function saveStatusRead(community: string, id: string, read: StatusWrite): Promise<void> {
  const patch = statusPatch(read)
  const { error } = await getAdminClient().from('eruv').update(patch).eq('community_id', community).eq('id', id)
  if (error) throw new Error(`Failed to save the eruv status: ${error.message}`)
}

/** The active eruvim whose status comes by email, by the address it comes
 *  from: for the Gmail script, and to find the eruv an email is from. An
 *  eruv with a status page is read from its page, never its emails. Empty
 *  without migration 084. */
export async function listEmailedEruvim(community: string): Promise<AdminEruv[]> {
  const { data, error } = await selectWithLater<AdminRow>(
    (cols) => getAdminClient().from('eruv').select(cols).eq('community_id', community).eq('active', true).is('status_url', null).not('status_email', 'is', null),
    ADMIN_COLUMNS,
  )
  if (error) {
    if (eruvTableMissing(error.message) || laterNamed(error.message).includes('status_email')) return []
    throw new Error(`Failed to load the eruvim: ${error.message}`)
  }
  return ((data ?? []) as AdminRow[]).map(fromAdminRow).filter((e) => e.statusEmail)
}

/** Records one email from an eruv: its status, or why it couldn't be read
 *  (`read`, as a page read), and the email kept for an admin when it
 *  couldn't (`kept`; null clears the one kept before). */
export async function saveEmailRead(community: string, id: string, read: StatusWrite | null, kept: KeptEmail | null): Promise<void> {
  const patch = { ...(read ? statusPatch(read) : { updated_at: new Date().toISOString() }), status_email_kept: kept }
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
  if (error && !laterNamed(error.message).includes('line_missing')) throw new Error(`Failed to save the eruv map: ${error.message}`)
}

/** The fields an admin edits, by their names in AdminEruv. */
export type EruvEdit = Partial<
  Pick<
    AdminEruv,
    'name' | 'covers' | 'website' | 'hotline' | 'alertsUrl' | 'statusUrl' | 'statusDated' | 'statusEmail' | 'lineUrl' | 'sortOrder' | 'active' | 'lineLeaveOut' | 'lineHidePoints' | 'lineColor'
  >
>
const EDIT_COLUMN: Record<keyof EruvEdit, string> = {
  name: 'name',
  covers: 'covers',
  website: 'website',
  hotline: 'hotline',
  alertsUrl: 'alerts_url',
  statusUrl: 'status_url',
  statusDated: 'status_dated',
  statusEmail: 'status_email',
  lineUrl: 'line_url',
  sortOrder: 'sort_order',
  active: 'active',
  lineLeaveOut: 'line_leave_out',
  lineHidePoints: 'line_hide_points',
  lineColor: 'line_color',
}

const unset = (v: unknown) => v == null || v === false || (Array.isArray(v) && v.length === 0)

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
  // Before a later migration, its columns are left out, but only where they
  // say nothing: an admin's colour (or hidden markers) isn't dropped without
  // a word, the save fails instead.
  let patch = cols
  let { error } = await save(patch)
  while (error) {
    const named = laterNamed(error.message).filter((c) => c in patch && unset(patch[c]))
    if (!named.length) break
    patch = Object.fromEntries(Object.entries(patch).filter(([k]) => !named.includes(k)))
    ;({ error } = await save(patch))
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
