// A copy of everything, kept off Supabase (Nov 20, the health sweep).
//
// Supabase's own backups are the first way back (docs/backups.md), but
// they live inside the same account, and they don't hold the photos:
// a database backup has each stored file's name, not the file. This
// writes, to backups/<project>-<time>/ on this machine:
//
//   tables/<table>.json   every row of every table the database serves,
//                         found from the database itself, so a table
//                         added later is copied without touching this
//   storage/<bucket>/...  every stored file (photos, logos, uploads)
//   manifest.json         when, from where, and how many of each
//
// Only ever READS. Nothing here writes to any project, so it is safe to run
// against production, which is what it's for:
//
//   node --env-file=.env.local scripts/backup.mjs --prod
//   node --env-file=.env.local scripts/backup.mjs           (dev's project)
//   ... --no-files                                          (tables only)
//
// The copy holds private rows (submissions, admins' and subscribers'
// emails): backups/ is in .gitignore, and it belongs on an encrypted disk.

import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PAGE = 1000

/** The tables (and views) the database serves, with each one's key
 *  columns, from its own description of itself (PostgREST's OpenAPI). */
export function tablesFrom(openapi) {
  return Object.entries(openapi?.definitions ?? {})
    .map(([name, def]) => ({
      name,
      keys: Object.entries(def?.properties ?? {})
        .filter(([, p]) => /<pk\/>/.test(p?.description ?? ''))
        .map(([col]) => col),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Every row, a page at a time, in key order so no row is skipped or
 *  counted twice between pages. `fetchPage(from, to)` returns rows. */
export async function allRows(fetchPage) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const page = await fetchPage(from, from + PAGE - 1)
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

/** Every file path under `prefix` in a bucket, folders opened. */
export async function allFiles(list, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const entries = await list(prefix, offset)
    for (const e of entries) {
      const path = prefix ? `${prefix}/${e.name}` : e.name
      // A folder has no id in Storage's listing.
      if (e.id == null) out.push(...(await allFiles(list, path)))
      else out.push(path)
    }
    if (entries.length < PAGE) return out
  }
}

async function main() {
  const prod = process.argv.includes('--prod')
  const files = !process.argv.includes('--no-files')
  const url = prod ? process.env.PROD_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = prod ? process.env.PROD_SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`❌ Missing ${prod ? 'PROD_SUPABASE_URL / PROD_SUPABASE_SERVICE_ROLE_KEY' : 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'} (run with --env-file=.env.local).`)
    process.exit(1)
  }
  const ref = new URL(url).hostname.split('.')[0]
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join('backups', `${prod ? 'prod' : 'dev'}-${ref}-${stamp}`)
  const db = createClient(url, key, { auth: { persistSession: false } })

  const spec = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, authorization: `Bearer ${key}` } })
  if (!spec.ok) throw new Error(`couldn't list the tables: HTTP ${spec.status}`)
  const tables = tablesFrom(await spec.json())
  console.log(`Copying ${tables.length} tables from ${prod ? 'PRODUCTION' : 'dev'} (${ref}) into ${dir}/`)

  const manifest = { from: url, prod, at: new Date().toISOString(), tables: {}, files: {} }
  for (const { name, keys } of tables) {
    const rows = await allRows(async (from, to) => {
      let q = db.from(name).select('*')
      for (const k of keys) q = q.order(k, { ascending: true })
      const { data, error } = await q.range(from, to)
      if (error) throw new Error(`${name}: ${error.message}`)
      return data
    })
    await mkdir(join(dir, 'tables'), { recursive: true })
    await writeFile(join(dir, 'tables', `${name}.json`), JSON.stringify(rows, null, 1))
    manifest.tables[name] = rows.length
    console.log(`  ${name.padEnd(28)} ${rows.length}${keys.length ? '' : '  (no key: order not guaranteed)'}`)
  }

  if (files) {
    const { data: buckets, error } = await db.storage.listBuckets()
    if (error) throw new Error(`buckets: ${error.message}`)
    for (const b of buckets) {
      const store = db.storage.from(b.name)
      const paths = await allFiles(async (prefix, offset) => {
        const { data, error: e } = await store.list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
        if (e) throw new Error(`${b.name}/${prefix}: ${e.message}`)
        return data
      })
      let failed = 0
      for (const path of paths) {
        const { data, error: e } = await store.download(path)
        if (e || !data) {
          failed++
          console.error(`  ✗ ${b.name}/${path}: ${e?.message ?? 'empty'}`)
          continue
        }
        const out = join(dir, 'storage', b.name, path)
        await mkdir(dirname(out), { recursive: true })
        await writeFile(out, Buffer.from(await data.arrayBuffer()))
      }
      manifest.files[b.name] = { files: paths.length - failed, failed }
      console.log(`  storage ${b.name.padEnd(20)} ${paths.length - failed} file(s)${failed ? `, ${failed} FAILED` : ''}`)
    }
  }

  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  const failed = Object.values(manifest.files).reduce((n, f) => n + f.failed, 0)
  console.log(failed ? `\n⚠ Done, but ${failed} file(s) didn't copy (above).` : `\n✓ Done: ${dir}/`)
  if (failed) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error('❌', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
