#!/usr/bin/env node
// Boots a REAL production build (`next build && next start` — Cache
// Components only behaves correctly there, not under `next dev`) pointed at
// a dedicated, disposable test Supabase project instead of the real one, so
// the cache-round-trip e2e suite (e2e-cache/) can safely write through the
// real admin API and watch the change reach the cached public page.
//
// The one-time-invoke-the-real-project safety check lives in
// playwright.cache.config.ts, not here — that config is the actual entry
// point (`npm run test:cache-roundtrip`), and it runs BEFORE this script is
// spawned as its webServer child. This script inherits that already-vetted,
// already-remapped environment; re-checking here would compare
// TEST_SUPABASE_URL against a NEXT_PUBLIC_SUPABASE_URL the parent has
// already overwritten to match it, which would always "match" and refuse
// unconditionally — a real bug this comment is here so nobody reintroduces.
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { CACHE_TEST_ADMIN_EMAIL } from './cacheE2eAdmin.mjs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const url = process.env.TEST_SUPABASE_URL
const anonKey = process.env.TEST_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY

const missing = [
  !url && 'TEST_SUPABASE_URL',
  !anonKey && 'TEST_SUPABASE_ANON_KEY',
  !serviceRoleKey && 'TEST_SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean)
if (missing.length) {
  console.error(`❌ Missing ${missing.join(', ')} — see README "Integration tests" for how to set up the test project.`)
  process.exit(1)
}

// Next's Cache Components require every generateStaticParams to return at
// least one result at build time — the listing-detail route
// ([community]/[slug]/[id]) has one, so `next build` hard-fails against a
// test project with zero approved listings. The integration suite (which
// shares this project) always cleans up everything it creates, so the
// project can genuinely be empty by the time this runs. Rather than
// requiring a separate manual seeding step, ensure one category + one
// approved listing exist before every build — cheap to check, and it
// self-heals regardless of what the integration suite left behind.
async function ensureMinimalContent() {
  const supabase = createClient(url, serviceRoleKey)

  const { data: existingCategory } = await supabase.from('category').select('id').limit(1).maybeSingle()
  if (existingCategory) return

  const CATEGORY_ID = 'cache-roundtrip-seed'
  const { error: categoryError } = await supabase.from('category').upsert({
    id: CATEGORY_ID,
    label: 'Cache Round-trip Seed',
    plural_label: 'Cache Round-trip Seed',
    icon: '📋',
    description: 'Minimal content so next build has something to statically generate. Safe to ignore/delete.',
    fields: [],
    kind: 'listing',
    sort_order: 999,
    upvotes_enabled: false,
    has_address: true,
    has_phone: true,
    capabilities: {},
  })
  if (categoryError) throw new Error(`Could not seed minimal category: ${categoryError.message}`)

  const { error: resourceError } = await supabase.from('resource').insert({
    category: CATEGORY_ID,
    name: 'Cache Round-trip Seed Listing',
    address: '1 Test St, Philadelphia, PA',
    phone: null,
    details: {},
    status: 'approved',
    reviewed_at: new Date().toISOString(),
  })
  if (resourceError) throw new Error(`Could not seed minimal listing: ${resourceError.message}`)
}

const PORT = process.env.CACHE_E2E_PORT || '3211'

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  ADMIN_EMAILS: CACHE_TEST_ADMIN_EMAIL,
  // Its own build output — never overwrite whatever the real e2e suite or a
  // local `npm run build` left in .next.
  NEXT_DIST_DIR: '.next-cache-e2e',
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))))
    child.on('error', reject)
  })
}

try {
  await ensureMinimalContent()
  await run('npx', ['next', 'build'])
  await run('npx', ['next', 'start', '--port', PORT])
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
