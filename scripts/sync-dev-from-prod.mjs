// Pulls admin-configured CONTENT SCHEMA — categories, tags, forms, home
// sections, site settings, hospitals, communities — from the real production
// Supabase project into whatever project NEXT_PUBLIC_SUPABASE_URL currently
// points to (local dev's disposable test project — see README "Integration
// tests" → "Using the test project for local dev too"). Run this occasionally
// so local dev doesn't drift too far from what admins have actually configured
// in prod (a renamed category, a new field, an edited site tagline, …).
//
// Deliberately NEVER touches `resource` (listings), `submission`,
// `form_response`, or `vote` — those are real visitor/business data, not
// config, and the write-test suites own creating/cleaning up their own rows
// in those tables. Copying them here would either leak real submitter PII
// into a project other tests write-and-delete against, or fight those
// suites' own seeding.
//
// Upsert-only, never deletes — a category removed in prod will still linger
// here until you delete it by hand. Safer than a full mirror: a delete pass
// scoped to this project would risk wiping rows the write-test suites (and
// their own self-healing seed logic in scripts/run-test-project-server.mjs)
// depend on existing.
//
//   node --env-file=.env.local scripts/sync-dev-from-prod.mjs
//
// Requires PROD_SUPABASE_URL + PROD_SUPABASE_SERVICE_ROLE_KEY in .env.local
// (the real project's own values — kept there as an inert reference precisely
// for this script; nothing else in the app reads them). Refuses to run unless
// the destination (NEXT_PUBLIC_SUPABASE_URL) is genuinely the same project
// TEST_SUPABASE_URL names — the one thing standing between this script and
// ever overwriting prod with itself.

import { createClient } from '@supabase/supabase-js'

const sourceUrl = process.env.PROD_SUPABASE_URL
const sourceKey = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY
const destUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const destKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const testUrl = process.env.TEST_SUPABASE_URL

if (!sourceUrl || !sourceKey) {
  console.error('❌ Missing PROD_SUPABASE_URL / PROD_SUPABASE_SERVICE_ROLE_KEY.')
  console.error('   These should be the real project\'s own URL + service-role key — see the')
  console.error('   comment left in .env.local from when local dev was pointed at the test project.')
  process.exit(1)
}
if (!destUrl || !destKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (the sync destination).')
  process.exit(1)
}
if (destUrl === sourceUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL is the same as PROD_SUPABASE_URL — refusing to run.')
  console.error('   This script only makes sense when local dev points at a SEPARATE project.')
  process.exit(1)
}
if (destUrl !== testUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL does not match TEST_SUPABASE_URL — refusing to run.')
  console.error('   This script only ever writes into the disposable test project, as a defense')
  console.error('   against accidentally pointing it at prod (or anywhere else) by mistake.')
  console.error('   If you\'ve deliberately renamed/replaced the test project, update TEST_SUPABASE_URL too.')
  process.exit(1)
}

const source = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } })
const dest = createClient(destUrl, destKey, { auth: { persistSession: false } })

// [table, onConflict columns] — matches the composite/community-scoped keys
// added in supabase/migrations/20240101000027_communities.sql.
const TABLES = [
  ['community', 'slug'],
  ['category', 'community_id,id'],
  ['tag', 'community_id,slug'],
  ['form', 'community_id,id'],
  ['home_section', 'community_id,id'],
  ['site_settings', 'community_id'],
  ['hospital', 'id'],
]

async function syncTable(table, onConflict) {
  const { data, error: readError } = await source.from(table).select('*')
  if (readError) throw new Error(`Reading ${table} from prod failed: ${readError.message}`)
  if (!data || data.length === 0) {
    console.log(`  ${table}: 0 rows in prod, nothing to copy`)
    return
  }
  const { error: writeError } = await dest.from(table).upsert(data, { onConflict })
  if (writeError) throw new Error(`Writing ${table} to the test project failed: ${writeError.message}`)
  console.log(`  ${table}: synced ${data.length} row(s)`)
}

console.log(`Syncing config from ${sourceUrl} → ${destUrl}\n`)
for (const [table, onConflict] of TABLES) {
  await syncTable(table, onConflict)
}
console.log('\n✓ Done. Never touched: resource, submission, form_response, vote (real visitor/business data).')
