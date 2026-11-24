// Puts a backup (scripts/backup.mjs) back into a Supabase project
// (Nov 21, the health sweep's restore drill).
//
// The way back when Supabase's own backups can't be used: make a new project,
// run supabase/migrations into it in order (they rebuild every table; checked
// Nov 21 on a fresh Postgres 17: all 104 ran, once pgcrypto was there, which
// Supabase installs on every project), then:
//
//   RESTORE_URL=https://<new>.supabase.co RESTORE_KEY=<its service role key> \
//     node --env-file=.env.local scripts/restore.mjs backups/prod-<ref>-<time> --replace
//   ... --no-files        (rows only)
//   ... --skip-broken-links  leave out rows that point at a row the copy
//                         doesn't have (test leftovers), and count them;
//                         for a test copy, never a real restore
//   ... --replace         empty the new project's tables first: the
//                         migrations seed a few (community, eruv, page,
//                         watch, content_stamp), and the backup is the truth
//
// Then point the site's NEXT_PUBLIC_SUPABASE_URL / keys at the new project.
//
// It writes only to RESTORE_URL, named on purpose each time: never the
// project the backup came from, never PROD_SUPABASE_URL (restoring over the
// live database is a different act, done by hand with the user's go-ahead),
// and only into empty tables, so it can't mix a backup with what's there
// (--replace empties them first, and says what it removed).
//
// What it does, in order:
//   - rows, table by table; a table whose rows point at one not yet restored
//     (a foreign key) waits for the next pass, until every table is in
//   - a column the new project doesn't have (a later migration dropped it,
//     as 106 did contribution_note) is left out, and named, with whether
//     any row held something in it
//   - migration_ran is skipped: the new project's own record of its
//     migrations is the true one
//   - files, into buckets of the same names (made public, as the site's are)
//   - rows that name a file by the old project's address are pointed at the
//     new project's copy, when the files are restored too

import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tablesFrom } from './backup.mjs'

export const CHUNK = 1000
/** The target's own record, never the backup's. */
export const SKIPPED = new Set(['migration_ran'])

const origin = (url) => new URL(url).origin

/** Why `target` mustn't be restored into, or null. */
export function refuseTarget(target, { backupFrom, prodUrl }) {
  if (!target) return 'RESTORE_URL is not set: name the project to restore into.'
  const to = origin(target)
  if (backupFrom && to === origin(backupFrom)) return `${to} is the project this backup came from.`
  if (prodUrl && to === origin(prodUrl)) return `${to} is the live project (PROD_SUPABASE_URL).`
  return null
}

/** The row with the old project's file addresses moved to the new one's. */
export function movedFiles(row, from, to) {
  const old = `${origin(from)}/storage/v1/object/`
  const now = `${origin(to)}/storage/v1/object/`
  const text = JSON.stringify(row)
  return text.includes(old) ? JSON.parse(text.split(old).join(now)) : row
}

/** Each table's columns, from the new project's description of itself. */
export function columnsFrom(openapi) {
  return new Map(Object.entries(openapi?.definitions ?? {}).map(([name, def]) => [name, new Set(Object.keys(def?.properties ?? {}))]))
}

/** The rows without the columns `have` lacks, and those columns, each with
 *  how many rows held something (not null) in it. */
export function fitRows(rows, have) {
  const dropped = new Map()
  const fitted = rows.map((row) => {
    const out = {}
    for (const [k, v] of Object.entries(row)) {
      if (have.has(k)) out[k] = v
      else dropped.set(k, (dropped.get(k) ?? 0) + (v == null ? 0 : 1))
    }
    return out
  })
  return { rows: fitted, dropped }
}

/** Runs `act` on each item, retrying the ones a foreign key held back
 *  (23503) until a pass makes no progress; any other error stops at once.
 *  `act(item)` resolves to null or { code, message }. */
export async function inPasses(items, act) {
  let pending = [...items]
  const done = []
  for (;;) {
    const waiting = []
    for (const item of pending) {
      const failed = await act(item)
      if (!failed) done.push(item.name)
      else if (failed.code === '23503') waiting.push({ item, why: failed.message })
      else return { done, left: [{ name: item.name, why: failed.message }, ...waiting.map((w) => ({ name: w.item.name, why: w.why }))] }
    }
    if (!waiting.length || waiting.length === pending.length) return { done, left: waiting.map((w) => ({ name: w.item.name, why: w.why })) }
    pending = waiting.map((w) => w.item)
  }
}

/** Restores every table, in chunks, in passes (inPasses). `insert(table,
 *  rows)` resolves to null or { code, message }. */
export function restoreTables(tables, insert) {
  return inPasses(tables, async (t) => {
    for (let i = 0; i < t.rows.length; i += CHUNK) {
      const failed = await insert(t.name, t.rows.slice(i, i + CHUNK))
      if (failed) return failed
    }
    return null
  })
}

/** For a copy of a project that holds rows pointing at nothing (dev's and
 *  the test project's leftovers, migration 113): the tables restoreTables
 *  couldn't finish, a row at a time, in passes, so a row whose parent is
 *  itself in one of these tables still goes in once the parent has. Rows
 *  that never find theirs are left out. `insertOne(table, row)` resolves to
 *  null or { code, message } and must ignore a row already there (a chunk
 *  that went in before the table stopped). Resolves to { skipped: Map of
 *  table → rows left out, failed: { name, why } | null } (any error but a
 *  missing parent stops at once). */
export async function restoreSkippingBrokenLinks(tables, insertOne) {
  let pending = tables.flatMap((t) => t.rows.map((row) => ({ name: t.name, row })))
  for (;;) {
    const waiting = []
    for (const item of pending) {
      const failed = await insertOne(item.name, item.row)
      if (!failed) continue
      if (failed.code !== '23503') return { skipped: new Map(), failed: { name: item.name, why: failed.message } }
      waiting.push(item)
    }
    if (!waiting.length || waiting.length === pending.length) {
      const skipped = new Map()
      for (const w of waiting) skipped.set(w.name, (skipped.get(w.name) ?? 0) + 1)
      return { skipped, failed: null }
    }
    pending = waiting
  }
}

async function filesUnder(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await filesUnder(p)))
    else out.push(p)
  }
  return out
}

async function main() {
  const dir = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const files = !process.argv.includes('--no-files')
  const url = process.env.RESTORE_URL
  const key = process.env.RESTORE_KEY
  if (!dir) throw new Error('Name the backup folder: node scripts/restore.mjs backups/<folder>')
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  const refused = refuseTarget(url, { backupFrom: manifest.from, prodUrl: process.env.PROD_SUPABASE_URL })
  if (refused) throw new Error(refused)
  if (!key) throw new Error('RESTORE_KEY is not set: the new project’s service role key.')
  const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }
  const rest = `${origin(url)}/rest/v1`

  const spec = await fetch(`${rest}/`, { headers })
  if (!spec.ok) throw new Error(`couldn’t read the new project’s tables: HTTP ${spec.status}`)
  const openapi = await spec.json()
  const keysOf = new Map(tablesFrom(openapi).map((t) => [t.name, t.keys]))
  const columnsOf = columnsFrom(openapi)
  const replace = process.argv.includes('--replace')

  const tables = []
  const full = []
  for (const name of Object.keys(manifest.tables)) {
    if (SKIPPED.has(name)) continue
    let rows = JSON.parse(await readFile(join(dir, 'tables', `${name}.json`), 'utf8'))
    if (rows.length !== manifest.tables[name]) throw new Error(`${name}: ${rows.length} rows on disk, the manifest says ${manifest.tables[name]}`)
    if (files) rows = rows.map((r) => movedFiles(r, manifest.from, url))
    if (!keysOf.has(name)) throw new Error(`${name}: the new project has no such table. Run supabase/migrations into it first.`)
    const fitted = fitRows(rows, columnsOf.get(name))
    rows = fitted.rows
    for (const [col, held] of fitted.dropped) console.log(`  ${name}.${col}: not in the new project, left out (${held ? `${held} row(s) held something in it` : 'empty in every row'})`)
    const there = await fetch(`${rest}/${name}?select=*&limit=1`, { headers })
    if (!there.ok) throw new Error(`${name}: HTTP ${there.status}`)
    if ((await there.json()).length) full.push(name)
    tables.push({ name, rows })
  }
  if (full.length && !replace) throw new Error(`${full.join(', ')} already ha${full.length > 1 ? 've' : 's'} rows. On a new project those are the migrations' own; --replace empties them first.`)
  if (full.length) {
    // Each table's rows go, newest dependents first: a table others point
    // at waits until they're empty (inPasses).
    const { left } = await inPasses(full.map((name) => ({ name })), async ({ name }) => {
      const key = keysOf.get(name)[0]
      if (!key) return { code: 'nokey', message: `${name} has no key column to empty it by` }
      const res = await fetch(`${rest}/${name}?${encodeURIComponent(key)}=not.is.null`, { method: 'DELETE', headers: { ...headers, prefer: 'return=minimal' } })
      if (res.ok) return null
      const body = await res.json().catch(() => ({}))
      return { code: body.code ?? String(res.status), message: body.message ?? `HTTP ${res.status}` }
    })
    if (left.length) throw new Error(`couldn’t empty ${left.map((l) => `${l.name} (${l.why})`).join(', ')}`)
    console.log(`Emptied first: ${full.join(', ')}`)
  }

  console.log(`Restoring ${tables.length} tables from ${dir} into ${origin(url)}`)
  const { done, left } = await restoreTables(tables, async (name, rows) => {
    if (!rows.length) return null
    const res = await fetch(`${rest}/${name}`, { method: 'POST', headers: { ...headers, prefer: 'return=minimal' }, body: JSON.stringify(rows) })
    if (res.ok) return null
    const body = await res.json().catch(() => ({}))
    return { code: body.code ?? String(res.status), message: body.message ?? `HTTP ${res.status}` }
  })
  for (const name of done) console.log(`  ${name.padEnd(28)} ${manifest.tables[name]}`)
  if (left.length && process.argv.includes('--skip-broken-links')) {
    const unfinished = tables.filter((t) => left.some((l) => l.name === t.name))
    const { skipped, failed } = await restoreSkippingBrokenLinks(unfinished, async (name, row) => {
      const res = await fetch(`${rest}/${name}`, {
        method: 'POST',
        headers: { ...headers, prefer: 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify([row]),
      })
      if (res.ok) return null
      const body = await res.json().catch(() => ({}))
      return { code: body.code ?? String(res.status), message: body.message ?? `HTTP ${res.status}` }
    })
    if (failed) throw new Error(`${failed.name}: ${failed.why}`)
    for (const t of unfinished) {
      const n = skipped.get(t.name) ?? 0
      console.log(`  ${t.name.padEnd(28)} ${t.rows.length - n}${n ? `  (${n} pointing at nothing, left out)` : ''}`)
    }
    left.length = 0
  }
  for (const l of left) console.error(`  ✗ ${l.name}: ${l.why}`)

  let failedFiles = 0
  if (files && manifest.files) {
    for (const bucket of Object.keys(manifest.files)) {
      const base = join(dir, 'storage', bucket)
      const made = await fetch(`${origin(url)}/storage/v1/bucket`, { method: 'POST', headers, body: JSON.stringify({ id: bucket, name: bucket, public: true }) })
      if (!made.ok && made.status !== 409 && made.status !== 400) throw new Error(`bucket ${bucket}: HTTP ${made.status}`)
      const paths = (await stat(base).catch(() => null)) ? await filesUnder(base) : []
      for (const p of paths) {
        const path = relative(base, p).split('\\').join('/')
        const res = await fetch(`${origin(url)}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, {
          method: 'POST',
          headers: { apikey: key, authorization: `Bearer ${key}`, 'x-upsert': 'true' },
          body: await readFile(p),
        })
        if (!res.ok) {
          failedFiles++
          console.error(`  ✗ ${bucket}/${path}: HTTP ${res.status}`)
        }
      }
      console.log(`  storage ${bucket.padEnd(20)} ${paths.length - failedFiles} file(s)`)
    }
  }

  if (left.length || failedFiles) {
    console.error(`\n⚠ ${left.length} table(s) and ${failedFiles} file(s) didn't restore (above).`)
    process.exit(1)
  }
  console.log('\n✓ Restored. Now run scripts/reset-sequences.sql in its SQL editor: the copied ids are ahead of its id counters.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error('❌', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
