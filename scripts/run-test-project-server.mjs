#!/usr/bin/env node
// Boots a REAL production build (`next build && next start` — Cache
// Components only behaves correctly there, not under `next dev`) pointed at
// a dedicated, disposable test Supabase project instead of the real one.
// Shared by two e2e suites that both need to write through the real app
// (something the real e2e/ suite is barred from doing — see AGENTS.md):
//   - the cache-round-trip suite (e2e-cache/), which writes through the
//     real admin API and watches the change reach the cached public page
//   - the form-submission suite (e2e-form/), which fills out and submits a
//     real wizard and watches the response land in the database
// Each has its own playwright.*.config.ts and its own port (CACHE_E2E_PORT)
// — build output is derived from that port below, so they never collide.
//
// The one-time-invoke-the-real-project safety check lives in each config
// file, not here — those configs are the actual entry points
// (`npm run test:cache-roundtrip` / `npm run test:form-roundtrip`), and each
// runs BEFORE this script is spawned as its webServer child. This script
// inherits that already-vetted, already-remapped environment; re-checking
// here would compare TEST_SUPABASE_URL against a NEXT_PUBLIC_SUPABASE_URL
// the parent has already overwritten to match it, which would always
// "match" and refuse unconditionally — a real bug this comment is here so
// nobody reintroduces.
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { CACHE_TEST_ADMIN_EMAIL, resolveDefaultCommunityAdminEmail } from './cacheE2eAdmin.mjs'
import { FORM_E2E_FORM_ID } from './formE2eConstants.mjs'

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
async function ensureMinimalListing(supabase) {
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

// Dedicated, always-present fixture for e2e-cache/cache-roundtrip.spec.ts's
// "already-open tab picks up an admin edit" test, which needs a listing
// category it can safely rename mid-test. It used to borrow whatever
// category happened to be visible on /all — but integration, cache-roundtrip,
// form-roundtrip and admin-write all write to and delete from this SAME
// disposable project, often in parallel, so another job renaming/hiding/
// deleting that borrowed category out from under it made the test fail with
// "at least one listing category should be visible on /all to borrow".
//
// Unlike ensureMinimalListing above (which only fires when the project is
// otherwise completely empty), this runs every boot regardless of what else
// is in the project — the whole point is that this category is never
// missing. Every write here is upsert/existence-checked so repeat runs don't
// pile up duplicate listings or home-section rows.
const CACHE_ROUNDTRIP_CATEGORY_ID = 'cache-roundtrip-seed'

async function ensureCacheRoundtripFixtureCategory(supabase) {
  const { error: categoryError } = await supabase.from('category').upsert({
    id: CACHE_ROUNDTRIP_CATEGORY_ID,
    label: 'Cache Round-trip Seed',
    plural_label: 'Cache Round-trip Seed',
    icon: '📋',
    description: 'Dedicated fixture for the cache-roundtrip e2e suite — safe to ignore, never delete.',
    fields: [],
    kind: 'listing',
    sort_order: 999,
    upvotes_enabled: false,
    has_address: true,
    has_phone: true,
    capabilities: {},
  })
  if (categoryError) throw new Error(`Could not seed cache-roundtrip fixture category: ${categoryError.message}`)

  const { data: existingResource } = await supabase
    .from('resource')
    .select('id')
    .eq('category', CACHE_ROUNDTRIP_CATEGORY_ID)
    .limit(1)
    .maybeSingle()
  if (!existingResource) {
    const { error: resourceError } = await supabase.from('resource').insert({
      category: CACHE_ROUNDTRIP_CATEGORY_ID,
      name: 'Cache Round-trip Seed Listing',
      address: '1 Test St, Philadelphia, PA',
      phone: null,
      details: {},
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    })
    if (resourceError) throw new Error(`Could not seed cache-roundtrip fixture listing: ${resourceError.message}`)
  }

  // A listing category only renders on /all if it's grouped into a home
  // section (AllCategories.tsx groups by home_section, with a "More" bucket
  // for anything left over — but a category in NO section at all is never a
  // card to begin with, see resourceCards/groupCardsIntoSections in
  // src/components/home/sections.tsx). Its own dedicated section, for the
  // same "nothing else ever touches this" reason as the category above.
  const { error: sectionError } = await supabase.from('home_section').upsert({
    id: 'cache-roundtrip-seed-section',
    // Deliberately NOT "Cache Round-trip Seed" — the category card below has
    // that exact text too, and the roundtrip test locates the card with
    // getByText(label, {exact: true}).first(). A same-text section heading
    // above it wins that race (it's a heading, not a link, so the click just
    // hits nothing) — confirmed live: the test hung for the full 90s timeout
    // on page.waitForURL because the click never navigated anywhere.
    title: 'E2E Fixtures',
    sort_order: 999,
    card_ids: [CACHE_ROUNDTRIP_CATEGORY_ID],
  })
  if (sectionError) throw new Error(`Could not seed home section for the cache-roundtrip fixture: ${sectionError.message}`)
}

// The form-submission suite needs a real, published, multi-step form to
// drive through the UI — forms are server-loaded content (loadCommunityContent
// -> listPublishedForms, cached), so it has to exist before the build starts,
// same reasoning as the listing above. Mirrors DEFAULT_CONTACT_STEPS
// (src/lib/forms.ts) with one addition: DEFAULT_CONTACT_STEPS' own last step
// is a single-select, and Wizard.tsx never renders a Submit button for a
// 'single'-kind step (it auto-advances instead, which is a no-op when
// already on the last step) — appending a plain final text step is what
// gives this form an actual, clickable way to submit.
async function ensureTestForm(supabase) {
  const { data: existing } = await supabase.from('form').select('id').eq('id', FORM_E2E_FORM_ID).maybeSingle()
  if (existing) return

  const { error } = await supabase.from('form').insert({
    id: FORM_E2E_FORM_ID,
    title: 'E2E Test Form',
    submit_label: 'Submit',
    success_title: 'All set',
    success_message: 'Thanks — this is a test submission from the form-roundtrip e2e suite.',
    steps: [
      { id: 'name', kind: 'text', section: 'About you', question: 'What’s your name?', placeholder: 'Your full name' },
      { id: 'contact', kind: 'contact', section: 'About you', question: 'How can we reach you?' },
      {
        id: 'preferredContact',
        kind: 'single',
        section: 'About you',
        when: [{ field: 'phone', op: 'notEmpty' }, { field: 'email', op: 'empty' }],
        question: 'How should we reach you?',
        options: [
          { value: 'phone', label: 'Call me' },
          { value: 'text', label: 'Text me' },
        ],
      },
      {
        id: 'preferredContact',
        kind: 'single',
        section: 'About you',
        when: [{ field: 'phone', op: 'notEmpty' }, { field: 'email', op: 'notEmpty' }],
        question: 'How should we reach you?',
        options: [
          { value: 'phone', label: 'Call me' },
          { value: 'text', label: 'Text me' },
          { value: 'email', label: 'Email me' },
        ],
      },
      {
        id: 'note',
        kind: 'text',
        section: 'Almost done',
        question: 'Anything else we should know?',
        placeholder: 'Optional',
        optional: true,
      },
    ],
  })
  if (error) throw new Error(`Could not seed the e2e test form: ${error.message}`)
}

async function ensureMinimalContent() {
  const supabase = createClient(url, serviceRoleKey)
  await ensureMinimalListing(supabase)
  await ensureCacheRoundtripFixtureCategory(supabase)
  await ensureTestForm(supabase)
}

const PORT = process.env.CACHE_E2E_PORT || '3211'

// Superadmin-gated routes (getAdminUser, e.g. GET /api/admin/pages — see
// adminAuth.ts's own comment on what's still superadmin-only) check this
// list directly, never the per-community admin_email. Both auth.setup.ts
// files mint a session for whichever email resolveDefaultCommunityAdminEmail
// resolves — CACHE_TEST_ADMIN_EMAIL on a pristine test project, or the
// default community's real admin_email once one's configured on a shared
// project (see that function's own comment). This list has to include
// BOTH: the per-community check alone would already accept the resolved
// email once admin_email is set, but the global superadmin check wouldn't
// unless it's listed here too.
const testAdminEmail = await resolveDefaultCommunityAdminEmail(url, serviceRoleKey)
const adminEmails = Array.from(new Set([CACHE_TEST_ADMIN_EMAIL, testAdminEmail])).join(',')

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  SUPERADMIN_EMAILS: adminEmails,
  // Its own build output, derived from the port rather than a separate env
  // var — each config already sets a distinct CACHE_E2E_PORT, so this can't
  // collide with whatever the real e2e suite, the other test-project suite,
  // or a local `npm run build` left behind. (Passing a *different* env var
  // through Playwright's webServer.env was tried first and rejected: that
  // option REPLACES the child's environment rather than merging into it, so
  // it would have dropped PATH along with everything else this script sets.)
  NEXT_DIST_DIR: `.next-e2e-${PORT}`,
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
