// Pulls admin-configured CONTENT SCHEMA — categories, tags, forms, home
// sections, site settings, hospitals, communities, static pages — plus a
// read-only copy of approved listings, from the real production Supabase project into whatever
// project NEXT_PUBLIC_SUPABASE_URL currently points to (local dev's
// disposable test project — see README "Integration tests" → "Using the test
// project for local dev too"). Run this occasionally so local dev doesn't
// drift too far from what admins have actually configured in prod (a
// renamed category, a new field, an edited site tagline, …), and so there's
// real, populated content to develop and test against locally instead of an
// empty directory.
//
// Prod is only ever READ from — this script has no code path that writes
// anywhere but `dest` (the test project), and the checks below refuse to run
// at all unless that destination is verifiably the test project, not prod.
//
// Still deliberately NEVER touches `submission`, `form_response`, or `vote`
// — genuinely private (a pending submission nobody's approved yet, a vote
// tied to an anonymous visitor) with no reason to leave prod at all. Listings
// (`resource`) are different: once approved they're public business info
// already shown on the live site to any visitor, which is why they're synced
// below — but `submitted_by` (the submitter's own name/email, not the
// business's) is scrubbed on the way in regardless, since that's a real
// person's contact info a business submission collects incidentally, not
// itself public. Only `status = 'approved'` rows are copied, matching what a
// real visitor actually sees — a pending or rejected submission might carry
// address/phone info nobody ever vetted.
//
// Upsert-only, never deletes — a category (or listing) removed in prod will
// still linger here until you delete it by hand. Safer than a full mirror: a
// delete pass scoped to this project would risk wiping rows the write-test
// suites (and their own self-healing seed logic in
// scripts/run-test-project-server.mjs) depend on existing.
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
  // Global rather than per-community (see the pages migration), so keyed by
  // slug alone. Added later than the rest of this list and initially missed,
  // which is how local dev ended up showing a different About and Privacy
  // from production — including a different page TITLE, which then made the
  // two environments disagree about what the <h1> said.
  ['page', 'slug'],
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

// Only `status = 'approved'` — what a real visitor actually sees; a pending
// or rejected submission's address/phone was never vetted by an admin.
// `submitted_by` is scrubbed to null on the way in: unlike the rest of the
// row (a business's own public name/address/phone, already shown on the live
// site), that field is the submitter's own name/email — a real person's
// contact info incidentally collected by the form, not itself public, and
// with no reason to leave prod. Read-only against `source`; only ever
// written to `dest` (the test project), same as every other table here.
async function syncResources() {
  const { data, error: readError } = await source.from('resource').select('*').eq('status', 'approved')
  if (readError) throw new Error(`Reading resource from prod failed: ${readError.message}`)
  if (!data || data.length === 0) {
    console.log('  resource: 0 approved rows in prod, nothing to copy')
    return
  }
  const scrubbed = data.map((row) => ({ ...row, submitted_by: null }))
  const { error: writeError } = await dest.from('resource').upsert(scrubbed, { onConflict: 'id' })
  if (writeError) throw new Error(`Writing resource to the test project failed: ${writeError.message}`)
  console.log(`  resource: synced ${data.length} row(s) (approved only, submitted_by scrubbed)`)
}

console.log(`Syncing config + listings from ${sourceUrl} → ${destUrl}\n`)
for (const [table, onConflict] of TABLES) {
  await syncTable(table, onConflict)
}
await syncResources()
console.log('\n✓ Done. Never touched: submission, form_response, vote (private, not public content).')
