// One-command setup for a fresh community deployment. Runs the seed scripts in
// the correct dependency order after checking that the environment and database
// schema are ready.
//
//   npm run setup            # preflight + seed everything (idempotent)
//   npm run setup -- --check # preflight only: verify env + schema, seed nothing
//
// Prerequisites (do these first — see README "Rebrand for a new community"):
//   1. Fill in .env.local (at minimum the Supabase URL + service-role key).
//   2. Apply the schema: `supabase db push`, or paste the files in
//      supabase/migrations/ into the SQL editor in filename order.
//
// This script is safe to re-run: the category/tag/synagogue seeds upsert, and
// the listing seed is skipped once the `resource` table already has rows (pass
// FORCE=1 to `npm run seed` directly if you really want to wipe and reload).

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const checkOnly = process.argv.includes('--check')

// ── 0. Node version ──────────────────────────────────────────────────────────
// Next 16 (and `npm run dev/build`) needs Node >= 20.9. Fail clearly here rather
// than let a mysterious error surface later. `.nvmrc` recommends a current LTS.
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 20 || (major === 20 && minor < 9)) {
  console.error(`❌ Node ${process.versions.node} is too old — this project needs Node >= 20.9.`)
  console.error('   Install a current Node (see .nvmrc): e.g. `nvm install 24 && nvm use 24`.')
  process.exit(1)
}

// ── 1. Environment preflight ─────────────────────────────────────────────────
// Required to do anything; recommended power the map / email / spam features.
const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: 'Supabase project URL',
  SUPABASE_SERVICE_ROLE_KEY: 'Supabase service-role key (server-side writes)',
}
const RECOMMENDED = {
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'browser reads from Supabase',
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'address autocomplete + the resource map',
  GOOGLE_MAPS_SERVER_KEY: 'server-side geocoding / travel-time scripts',
  RESEND_API_KEY: 'confirmation + notification emails',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'spam protection on submission forms',
}

const has = (k) => Boolean(process.env[k] && String(process.env[k]).trim())

const missingRequired = Object.keys(REQUIRED).filter((k) => !has(k))
if (missingRequired.length) {
  console.error('❌ Missing required environment variables:')
  for (const k of missingRequired) console.error(`   • ${k} — ${REQUIRED[k]}`)
  console.error('\nFill these in .env.local (see .env.example), then re-run `npm run setup`.')
  process.exit(1)
}

const missingRecommended = Object.keys(RECOMMENDED).filter((k) => !has(k))
if (missingRecommended.length) {
  console.warn('⚠️  Optional environment variables not set (features will be limited):')
  for (const k of missingRecommended) console.warn(`   • ${k} — ${RECOMMENDED[k]}`)
  console.warn('')
}

// ── 2. Schema presence check ─────────────────────────────────────────────────
// A HEAD count on `category` fails cleanly if the migrations haven't been
// applied — better to say so than to let each seed script error obscurely.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function assertSchema() {
  const { error } = await supabase.from('category').select('id', { head: true, count: 'exact' })
  if (error) {
    console.error('❌ Database schema not found (querying `category` failed):')
    console.error(`   ${error.message}`)
    console.error('\nApply the schema first: `supabase db push`, or paste the files in')
    console.error('supabase/migrations/ into the Supabase SQL editor in filename order.')
    process.exit(1)
  }
}

async function resourceCount() {
  const { count, error } = await supabase
    .from('resource')
    .select('id', { head: true, count: 'exact' })
  if (error) throw new Error(`Could not count resources: ${error.message}`)
  return count ?? 0
}

// ── 3. Ordered seed steps ────────────────────────────────────────────────────
// Order matters: `seed.mjs` aborts if the `resource` table is non-empty, so it
// must run before `seed-synagogues.mjs` (which inserts synagogue rows). The
// category/tag/upvote seeds only touch the `category`/`tag` tables.
function run(script) {
  console.log(`\n▶  ${script}`)
  const res = spawnSync(process.execPath, [join(scriptsDir, script)], {
    stdio: 'inherit',
    env: process.env,
  })
  if (res.status !== 0) {
    console.error(`\n❌ ${script} failed (exit ${res.status}). Fix the error above and re-run.`)
    process.exit(res.status ?? 1)
  }
}

async function main() {
  await assertSchema()

  if (checkOnly) {
    console.log('✅ Preflight passed: required env present and schema reachable.')
    console.log('   (--check) Skipping all seeds.')
    return
  }

  run('seed-categories.mjs')
  run('seed-tags.mjs')
  run('seed-upvotes.mjs')

  const existing = await resourceCount()
  if (existing > 0) {
    console.log(
      `\n•  Skipping listing seed — \`resource\` already has ${existing} row(s).` +
        '\n   To wipe and reload starter listings: `FORCE=1 npm run seed`.',
    )
  } else {
    run('seed.mjs')
  }

  run('seed-synagogues.mjs')

  console.log('\n🎉 Setup complete. Start the app with `npm run dev`.')
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
