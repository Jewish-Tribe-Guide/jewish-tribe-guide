// npm run migrations:report [-- --prod]: which migrations have run on a
// database. Read-only: it only selects (the health sweep, Nov 20).
//
//   npm run migrations:report             dev (NEXT_PUBLIC_SUPABASE_URL)
//   npm run migrations:report -- --prod   live (PROD_SUPABASE_URL), reads only
//
// A migration from 105 on writes its own name into `migration_ran` when it
// runs, so it's recorded. One from before that is looked for instead: the
// tables it creates and the columns it adds (migrationFootprint.mjs), less
// anything a later one took away. One that makes neither (a policy, an
// index, a data fix) can't be told this way and is listed as such.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { probes } from './migrationFootprint.mjs'

const prod = process.argv.includes('--prod')
const url = prod ? process.env.PROD_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
const key = prod ? process.env.PROD_SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error(prod ? 'Needs PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY.' : 'Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const dir = join(import.meta.dirname, '..', 'supabase', 'migrations')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const migrations = probes(files.map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') })))

/** A select's error that says the table or column isn't there. */
const missing = (error) => !!error && (['PGRST205', 'PGRST204', '42P01', '42703'].includes(error.code) || /does not exist|schema cache/i.test(error.message))

/** Whether each table or `table.column` is there; a read that fails some
 *  other way is thrown, so nothing is reported as missing that wasn't. */
const seen = new Map()
async function there(item) {
  if (seen.has(item)) return seen.get(item)
  const [table, column] = item.split('.')
  const { error } = await db.from(table).select(column ?? '*').limit(0)
  if (error && !missing(error)) throw new Error(`Couldn’t look for ${item}: ${error.message}`)
  seen.set(item, !error)
  return !error
}

const { data: ranRows, error: ranError } = await db.from('migration_ran').select('name, ran_at')
if (ranError && !missing(ranError)) throw new Error(`Couldn’t read migration_ran: ${ranError.message}`)
const recorded = new Map((ranRows ?? []).map((r) => [r.name, r.ran_at]))

const rows = { recorded: [], seen: [], notRun: [], cantTell: [] }
for (const m of migrations) {
  const name = m.name.replace(/\.sql$/, '')
  if (recorded.has(name)) {
    rows.recorded.push(`${name}  ${String(recorded.get(name)).slice(0, 10)}`)
    continue
  }
  const items = [...m.tables, ...m.columns]
  if (!items.length) {
    rows.cantTell.push(name)
    continue
  }
  const absent = []
  for (const item of items) if (!(await there(item))) absent.push(item)
  if (absent.length) rows.notRun.push(`${name}  missing ${absent.join(', ')}`)
  else rows.seen.push(name)
}

const host = new URL(url).host
console.log(`\nMigrations on ${prod ? 'LIVE' : 'dev'} (${host}): ${migrations.length} in the folder`)
if (ranError) console.log('  migration_ran isn’t there: migration 105 hasn’t run on this database.')
console.log(`  Recorded as run: ${rows.recorded.length}`)
for (const r of rows.recorded) console.log(`    ${r}`)
console.log(`  Seen (what it made is there): ${rows.seen.length}`)
console.log(`  NOT RUN (what it made isn’t there): ${rows.notRun.length}`)
for (const r of rows.notRun) console.log(`    ${r}`)
console.log(`  Can’t tell (makes no table or column of its own): ${rows.cantTell.length}`)
for (const r of rows.cantTell) console.log(`    ${r}`)
console.log('')
process.exit(rows.notRun.length ? 1 : 0)
