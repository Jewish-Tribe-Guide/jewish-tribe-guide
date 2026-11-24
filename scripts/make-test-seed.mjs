// Builds the tests' starting data (supabase/seed/) from a backup of the test
// project (scripts/backup.mjs --no-files), Nov 23.
//
// CI's suites each start Supabase of their own from the migrations
// (.github/actions/own-test-database) and load this, so every job begins
// from the same rows and nothing another job is doing can reach it. Copying
// the shared test project at the start of each job did reach it: admin-write
// copied the integration suite's half-made "Integration Test" category and
// failed on two "Hours" rows (PR 441, Nov 23).
//
// The repo is public, so this keeps only what visitors already see, and
// scrubs it:
//   - the three real communities (philly, ues, baltimore) and their pages,
//     listings, tags, forms, home sections, hospitals, eruvs, walking routes,
//     watches and settings; About and Privacy; the content stamps
//   - each community's newest ACTIVITY_KEPT changes to listings kept here
//     (What changed and Activity), with no one named: no actor, no
//     submission. Their dates are moved up to the day the seed is loaded
//     (scripts/seed-fresh-dates.sql), as those pages show the last 30 days
//   - not: submissions, subscribers, older activity, votes, form responses, daily
//     counts, search logs, AI readings, job runs, newsletter setup (its
//     script address takes posts), the migration record
//   - not: test leftovers (e2e-* communities and pages, `Integration Test`
//     and `vote-test` pages and forms, listings in pages that aren't kept,
//     listings named "ZZ …" (made by hand to try something), the stamps
//     of communities not kept). The test
//     server makes `e2e-writes` and its fixtures itself
//     (scripts/run-test-project-server.mjs)
//   - every email address becomes a made-up one; a listing's submitted_by
//     is emptied, and a community's preview_token made up
//
//   node scripts/make-test-seed.mjs backups/dev-<ref>-<time>
//
// Then look at the diff before committing it: it is published with the repo.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const COMMUNITIES = ['philly', 'ues', 'baltimore']
export const TABLES = [
  'community', 'category', 'resource', 'tag', 'resource_tag', 'form', 'home_section', 'hospital',
  'page', 'eruv', 'walk_route', 'watch', 'site_settings', 'campaign_banner', 'content_stamp', 'activity',
]
/** How many of each community's newest changes are kept. */
export const ACTIVITY_KEPT = 60
const TEST_CATEGORY = /^(integration-test-|vote-test-|e2e-)/

/** Every email address in `value`, at any depth, replaced by a made-up one.
 *  The same address always becomes the same one, so rows that share an
 *  address still do. */
export function scrubEmails(value, seen = new Map()) {
  if (typeof value === 'string') {
    return value.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (addr) => {
      const key = addr.toLowerCase()
      if (!seen.has(key)) seen.set(key, `person${seen.size + 1}@example.test`)
      return seen.get(key)
    })
  }
  if (Array.isArray(value)) return value.map((v) => scrubEmails(v, seen))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubEmails(v, seen)]))
  return value
}

/** The rows of each kept table, kept and scrubbed. `tables` maps a table's
 *  name to its rows. */
export function seedFrom(tables) {
  const keepCommunity = (r) => r.community_id == null || COMMUNITIES.includes(r.community_id)
  const categories = (tables.category ?? []).filter((c) => keepCommunity(c) && !TEST_CATEGORY.test(c.id))
  const categoryKeys = new Set(categories.map((c) => `${c.community_id}/${c.id}`))
  const resources = (tables.resource ?? []).filter(
    (r) => keepCommunity(r) && categoryKeys.has(`${r.community_id}/${r.category}`) && !/^ZZ /.test(r.name ?? ''),
  )
  const resourceIds = new Set(resources.map((r) => r.id))
  const kept = {
    // preview_token can't be empty: a made-up one each, in place of the real.
    community: (tables.community ?? [])
      .filter((c) => COMMUNITIES.includes(c.slug))
      .map((c, i) => ({ ...c, preview_token: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}` })),
    category: categories,
    resource: resources.map((r) => ({ ...r, submitted_by: null })),
    form: (tables.form ?? []).filter((f) => keepCommunity(f) && !TEST_CATEGORY.test(f.id)),
    // A stamp's id names its community ("c:philly"); one with none is site-wide.
    content_stamp: (tables.content_stamp ?? []).filter((s) => !/^c:/.test(s.id) || COMMUNITIES.includes(s.id.slice(2))),
    activity: COMMUNITIES.flatMap((c) =>
      (tables.activity ?? [])
        .filter((a) => a.community_id === c && !a.hidden_at && resourceIds.has(a.resource_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .slice(0, ACTIVITY_KEPT)
        .map((a) => ({ ...a, actor_email: null, submission_id: null })),
    ),
  }
  for (const name of TABLES) {
    if (kept[name]) continue
    let rows = (tables[name] ?? []).filter(keepCommunity)
    if (rows.some((r) => 'resource_id' in r)) rows = rows.filter((r) => r.resource_id == null || resourceIds.has(r.resource_id))
    if (rows.some((r) => 'category_id' in r)) rows = rows.filter((r) => r.category_id == null || categoryKeys.has(`${r.community_id}/${r.category_id}`))
    kept[name] = rows
  }
  const seen = new Map()
  return Object.fromEntries(TABLES.map((name) => [name, scrubEmails(kept[name], seen)]))
}

async function main() {
  const dir = process.argv[2]
  if (!dir) throw new Error('Name the backup folder: node scripts/make-test-seed.mjs backups/<folder>')
  const tables = {}
  for (const name of TABLES) {
    tables[name] = JSON.parse(await readFile(join(dir, 'tables', `${name}.json`), 'utf8').catch(() => '[]'))
  }
  const seed = seedFrom(tables)
  const out = 'supabase/seed'
  await rm(out, { recursive: true, force: true })
  await mkdir(join(out, 'tables'), { recursive: true })
  const manifest = { from: 'https://seed.invalid', made: 'scripts/make-test-seed.mjs', tables: {} }
  for (const [name, rows] of Object.entries(seed)) {
    await writeFile(join(out, 'tables', `${name}.json`), JSON.stringify(rows, null, 1) + '\n')
    manifest.tables[name] = rows.length
    console.log(`  ${name.padEnd(16)} ${rows.length}`)
  }
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`✓ ${out}/`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error('❌', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
