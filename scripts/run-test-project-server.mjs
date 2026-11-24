#!/usr/bin/env node
// Boots a REAL production build (`next build && next start` — Cache
// Components only behaves correctly there, not under `next dev`) pointed at
// the write suites' own local Supabase (testDatabase.mjs), never a hosted one.
// Shared by two e2e suites that both need to write through the real app
// (something the real e2e/ suite is barred from doing — see AGENTS.md):
//   - the cache-round-trip suite (e2e-cache/), which writes through the
//     real admin API and watches the change reach the cached public page
//   - the form-submission suite (e2e-form/), which fills out and submits a
//     real wizard and watches the response land in the database
// Each has its own playwright.*.config.ts and its own port (CACHE_E2E_PORT)
// — build output is derived from that port below, so they never collide.
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { testDatabase } from './testDatabase.mjs'
import { ADMIN_WRITE_TEST_ADMIN_EMAIL, CACHE_TEST_ADMIN_EMAIL } from './cacheE2eAdmin.mjs'
import { FORM_E2E_FORM_ID } from './formE2eConstants.mjs'
import { TEST_COMMUNITY, ensureTestAdmins } from './testCommunity.mjs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

// The suite's config chose the database and set TEST_DB_* (testDatabase.mjs
// refuses anything not local); asked again here, it is the same one.
let db
try {
  db = testDatabase()
} catch (err) {
  console.error(`❌ ${err.message}`)
  process.exit(1)
}
const { url, anonKey, serviceRoleKey } = db

// A page of cache-roundtrip's own, for its "already-open tab picks up an
// admin edit" test, which renames it mid-test: a borrowed page would be one
// another test (or e2e/testMadePages.ts's pickers) might be reading. Put
// back to its starting name on every start, so a run that stopped mid-rename
// doesn't leave the next one on a renamed page. Upserts on fixed ids, so a
// restart never makes a second copy.
const CACHE_ROUNDTRIP_CATEGORY_ID = 'cache-roundtrip-seed'
// A real UUID, not the category's own text id — `resource.id` is a uuid
// column. Fixed/hardcoded so every boot, from any process, upserts the same
// row instead of generating a fresh gen_random_uuid() default each time.
const CACHE_ROUNDTRIP_RESOURCE_ID = '00000000-0000-4000-8000-0000cace0001'

async function ensureCacheRoundtripFixtureCategory(supabase) {
  const { error: categoryError } = await supabase.from('category').upsert({
    community_id: TEST_COMMUNITY,
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
  }, { onConflict: 'community_id,id' })
  if (categoryError) throw new Error(`Could not seed cache-roundtrip fixture category: ${categoryError.message}`)

  const { error: resourceError } = await supabase.from('resource').upsert({
    id: CACHE_ROUNDTRIP_RESOURCE_ID,
    community_id: TEST_COMMUNITY,
    category: CACHE_ROUNDTRIP_CATEGORY_ID,
    name: 'Cache Round-trip Seed Listing',
    address: '1 Test St, Philadelphia, PA',
    phone: null,
    details: {},
    state: {},
    status: 'approved',
    reviewed_at: new Date().toISOString(),
  })
  if (resourceError) throw new Error(`Could not seed cache-roundtrip fixture listing: ${resourceError.message}`)

  // A listing category only shows as a home card if it's grouped into a
  // home section (a category in NO section at all is never a card, see
  // resourceCards/groupCardsIntoSections in
  // src/components/home/sections.tsx). Its own dedicated section, for the
  // same "nothing else ever touches this" reason as the category above.
  const { error: sectionError } = await supabase.from('home_section').upsert({
    community_id: TEST_COMMUNITY,
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
  }, { onConflict: 'community_id,id' })
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
  const { data: existing } = await supabase.from('form').select('id').eq('community_id', 'philly').eq('id', FORM_E2E_FORM_ID).maybeSingle()
  if (existing) return

  // Philly's, where "/" lands the suite: said outright since migration 104
  // took community_id's default away.
  const { error } = await supabase.from('form').insert({
    community_id: 'philly',
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
  await ensureTestAdmins(supabase)
  await ensureCacheRoundtripFixtureCategory(supabase)
  await ensureTestForm(supabase)
}

const PORT = process.env.CACHE_E2E_PORT || '3211'

// Superadmin-gated routes (getAdminUser, e.g. GET /api/admin/pages — see
// adminAuth.ts's own comment on what's still superadmin-only) check this
// list directly, never a community's admin_emails. Both suites' own admins
// are on it; each signs in as its own (see its auth.setup.ts), and both are
// also put on the community they change (ensureTestAdmins). This
// script doesn't know which suite started it, and doesn't need to.
const adminEmails = [CACHE_TEST_ADMIN_EMAIL, ADMIN_WRITE_TEST_ADMIN_EMAIL].join(',')

const env = {
  ...process.env,
  // Never the question reader: a test run mustn't spend on OpenAI or write
  // readings (see src/app/api/ask/read/route.ts).
  QUESTION_READER: 'off',
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
