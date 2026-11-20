import { reportServerError } from './serverError'
import { after } from 'next/server'
import { getAdminClient } from './supabase/admin'
import type { FilesSwept } from './jobRuns'

// ─────────────────────────────────────────────────────────────────────────────
// Files nothing uses any more (Nov 19).
//
// Every upload lands in the `site-assets` bucket the moment it's cropped
// (ImageUploadField), before anything is saved, and nothing ever deleted one.
// So a photo picked and then re-picked, or replaced a month later, stayed
// in storage for good. The clean-up on Nov 19 found 23 such files, most
// from re-uploading to reframe before cropping existed.
//
// Two things clear them now:
//   • A save that replaces or removes a file (the logo, a hero, the map
//     card, a category's banner, a deleted category) deletes the old one
//     once the save is done — if nothing else still mentions it.
//   • The weekly link check first sweeps away every file older than
//     SWEEP_AFTER_DAYS that nothing mentions: an upload that was never
//     saved, a listing photo replaced, a reader's source nobody kept.
//
// "Mentions" is literal: the file's name appears somewhere in a row of any
// table the database has (read whole, so History — a submission that
// proposed a photo — keeps its photo too). Nothing is deleted on a partial
// read: one table that can't be read stops the whole pass. Uploads stay
// where they land rather than moving out of a holding folder on Save:
// a move would have to rewrite the address in every place a save can put
// it, and one missed would delete a live photo.
// ─────────────────────────────────────────────────────────────────────────────

export const BUCKET = 'site-assets'

/** An upload nothing mentions goes once it's this old, so a form left open
 *  — or a visitor's unsent draft — keeps its photo. */
export const SWEEP_AFTER_DAYS = 30

const PAGE = 1000

/** The bucket paths ("hero/123-abc.jpg") a value mentions, read from this
 *  project's own public addresses. */
export function storedPaths(value: unknown): string[] {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base || value == null) return []
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const prefix = `${base}/storage/v1/object/public/${BUCKET}/`
  const found = new Set<string>()
  let at = text.indexOf(prefix)
  while (at !== -1) {
    const path = /^[a-z-]+\/[\w.-]+/.exec(text.slice(at + prefix.length))?.[0]
    if (path) found.add(path)
    at = text.indexOf(prefix, at + prefix.length)
  }
  return [...found]
}

/** Whether a file is named anywhere in `everything` (every row, as text).
 *  By its bare file name, spelled either way, so an address in any form
 *  (resized, encoded, inside HTML) still counts. */
export function isMentioned(path: string, everything: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return everything.includes(name) || everything.includes(encodeURIComponent(name))
}

type Columns = Record<string, { description?: string }>

/** Every table and view the database serves, with its primary key. */
async function tables(): Promise<{ name: string; key: string[] }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Storage isn’t set up here.')
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`Couldn’t list the tables (${res.status}).`)
  const spec = (await res.json()) as { definitions?: Record<string, { properties?: Columns }> }
  const defs = Object.entries(spec.definitions ?? {})
  if (!defs.length) throw new Error('The database listed no tables.')
  return defs.map(([name, d]) => ({
    name,
    key: Object.entries(d.properties ?? {}).filter(([, c]) => c.description?.includes('<pk/>')).map(([c]) => c),
  }))
}

async function readAll(table: { name: string; key: string[] }): Promise<string> {
  const db = getAdminClient()
  const parts: string[] = []
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table.name).select('*', from === 0 ? { count: 'exact' } : undefined)
    for (const k of table.key) q = q.order(k)
    const { data, error, count } = await q.range(from, from + PAGE - 1)
    if (error) throw new Error(`Couldn’t read ${table.name}: ${error.message}`)
    // Pages are only steady in a known order; without a key, one page or
    // nothing.
    if (from === 0 && !table.key.length && (count ?? 0) > PAGE) throw new Error(`${table.name} has no key to read it in order.`)
    parts.push(JSON.stringify(data ?? []))
    if (!data || data.length < PAGE) return parts.join('\n')
  }
}

/** Every row of every table, as one text. Throws rather than return part. */
export async function everythingStored(): Promise<string> {
  return (await Promise.all((await tables()).map(readAll))).join('\n')
}

async function remove(paths: string[]): Promise<number> {
  let removed = 0
  for (let i = 0; i < paths.length; i += 100) {
    const { data, error } = await getAdminClient().storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (error) throw new Error(`Couldn’t delete files: ${error.message}`)
    removed += data?.length ?? 0
  }
  return removed
}

/** Deletes those of `paths` nothing mentions any more. */
export async function removeIfUnused(paths: string[]): Promise<string[]> {
  if (!paths.length) return []
  const everything = await everythingStored()
  const unused = paths.filter((p) => !isMentioned(p, everything))
  if (unused.length) await remove(unused)
  return unused
}

/** The files one row mentions, before a save changes it. Never stops the
 *  save: a row that can't be read just cleans nothing up. */
export async function filesInRow(table: string, match: Record<string, string>): Promise<string[]> {
  try {
    const { data, error } = await getAdminClient().from(table).select('*').match(match).maybeSingle()
    return error ? [] : storedPaths(data)
  } catch {
    return []
  }
}

/** Once the response is sent, deletes the files a save stopped using. */
export function removeLaterIfUnused(paths: string[], where: string): void {
  if (!paths.length) return
  after(() =>
    removeIfUnused(paths).catch((err) => reportServerError(`[storedFiles] ${where}: couldn’t clear old files:`, err)),
  )
}

type StoredFile = { path: string; createdAt: number; bytes: number }

async function listFiles(): Promise<StoredFile[]> {
  const bucket = getAdminClient().storage.from(BUCKET)
  const top = await bucket.list('', { limit: PAGE })
  if (top.error) throw new Error(`Couldn’t list the files: ${top.error.message}`)
  const files: StoredFile[] = []
  // Folders come back without an id; a file at the top level is left alone.
  for (const folder of (top.data ?? []).filter((f) => f.id == null)) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await bucket.list(folder.name, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error(`Couldn’t list ${folder.name}: ${error.message}`)
      for (const f of data ?? []) {
        if (f.id == null || !f.created_at) continue
        files.push({ path: `${folder.name}/${f.name}`, createdAt: Date.parse(f.created_at), bytes: Number(f.metadata?.size ?? 0) })
      }
      if (!data || data.length < PAGE) break
    }
  }
  return files
}

/** Every file older than SWEEP_AFTER_DAYS that nothing mentions. Reads
 *  only: what the sweep would clear. */
export async function findUnusedFiles(now = Date.now()): Promise<StoredFile[]> {
  const cutoff = now - SWEEP_AFTER_DAYS * 86_400_000
  const old = (await listFiles()).filter((f) => f.createdAt < cutoff)
  if (!old.length) return []
  const everything = await everythingStored()
  return old.filter((f) => !isMentioned(f.path, everything))
}

/** Deletes every file older than SWEEP_AFTER_DAYS that nothing mentions. */
export async function sweepUnusedFiles(now = Date.now()): Promise<FilesSwept> {
  try {
    const unused = await findUnusedFiles(now)
    if (unused.length) await remove(unused.map((f) => f.path))
    return { cleared: unused.length, bytes: unused.reduce((n, f) => n + f.bytes, 0) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
