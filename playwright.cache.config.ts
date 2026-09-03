import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// The cache-round-trip suite (e2e-cache/) — a separate Playwright config from
// playwright.config.ts on purpose. The real e2e suite is barred from writing
// to the database (see AGENTS.md); this suite needs to write (an admin save)
// to prove the cache actually invalidates, so it runs against a dedicated,
// disposable test Supabase project instead — never the real one, refused
// explicitly below. `npm run test:cache-roundtrip` runs this config.
// ─────────────────────────────────────────────────────────────────────────────

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
  throw new Error(
    `Missing ${missing.join(', ')} — see README "Integration tests" for how to set up the test project.`,
  )
}

// Playwright re-imports this config file fresh in every worker process, and
// workers inherit process.env from the main process — which has already run
// this file once and remapped NEXT_PUBLIC_SUPABASE_URL to equal
// TEST_SUPABASE_URL below. Without this guard, every re-import after the
// first would compare TEST_SUPABASE_URL against its own already-remapped
// copy, always "match", and refuse unconditionally — the same class of bug
// run-test-project-server.mjs's comment warns about, just one process level up.
if (!process.env.CACHE_E2E_REMAPPED) {
  // SHARED_DEV_TEST_PROJECT opts out of this refusal — see
  // src/test/integrationEnv.ts's comment for why that's a deliberate choice,
  // not a hole in the check.
  if (url === process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SHARED_DEV_TEST_PROJECT) {
    throw new Error(
      'TEST_SUPABASE_URL is the same as NEXT_PUBLIC_SUPABASE_URL — refusing to run the cache-round-trip suite ' +
        'against the real Supabase project. Point TEST_SUPABASE_URL at a separate, disposable project, ' +
        'or set SHARED_DEV_TEST_PROJECT=1 if you deliberately use the same project for both.',
    )
  }

  // e2e-cache/auth.setup.ts runs in this same process and reads these
  // directly — same remap-in-process pattern as src/test/integrationEnv.ts.
  // The webServer's child process (run-test-project-server.mjs) does its own
  // remap for the Next.js server itself, independent of this one.
  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
  process.env.CACHE_E2E_REMAPPED = '1'
}

const PORT = process.env.CACHE_E2E_PORT || '3211'
// Explicit, not incidental: the webServer child (run-test-project-server.mjs)
// inherits process.env and has its own independent '3211' fallback — without
// this it only happened to agree with this file's default by coincidence.
// playwright.form.config.ts picks a different port and would silently start
// its server on the wrong one without this same line — that's the bug this
// comment is here so nobody reintroduces.
process.env.CACHE_E2E_PORT = PORT
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e-cache',
  expect: { timeout: 5_000 },
  // Above the 60s the /about invalidation poll asks for. Without this the
  // config took Playwright's 30s default, so that poll could never actually
  // reach its own budget — the test died at 30s while the comment beside the
  // poll explained, in detail, why 60s was the right number. That is what the
  // "roughly one in thirty" flake was: not stale-while-revalidate needing one
  // more second, but a ceiling half the height of the allowance below it.
  timeout: 90_000,
  // One admin session, one shared site_settings row — the round-trip test
  // isn't safe to run concurrently with a copy of itself.
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI
    ? [['dot'], ['html', { open: 'never', outputFolder: 'playwright-report-cache' }]]
    : 'list',

  use: { baseURL: BASE_URL },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'cache-roundtrip', testMatch: /cache-roundtrip\.spec\.ts/, dependencies: ['setup'] },
  ],

  webServer: {
    // Its own port and its own dist dir (NEXT_DIST_DIR inside the script) —
    // never the real e2e suite's build or its port 3210.
    command: 'node scripts/run-test-project-server.mjs',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
