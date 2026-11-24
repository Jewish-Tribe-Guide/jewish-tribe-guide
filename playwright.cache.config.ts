import { existsSync } from 'node:fs'
import { testDatabase } from './scripts/testDatabase.mjs'
import { defineConfig } from '@playwright/test'
import { writeSuitePreviewCookie } from './scripts/writeSuiteCommunity.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// The cache-round-trip suite (e2e-cache/) — a separate Playwright config from
// playwright.config.ts on purpose. The real e2e suite is barred from writing
// to the database (see AGENTS.md); this suite needs to write (an admin save)
// to prove the cache actually invalidates, so it runs against a local
// Supabase of its own (below) — never a hosted one. `npm run test:cache-roundtrip` runs this config.
// ─────────────────────────────────────────────────────────────────────────────

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

// The suites' own database, always a local Supabase (scripts/testDatabase.mjs;
// `npm run test:db` starts one). Set here, before the server and the setup
// start, so both use it too.
const db = testDatabase()
process.env.NEXT_PUBLIC_SUPABASE_URL = db.url
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = db.anonKey
process.env.SUPABASE_SERVICE_ROLE_KEY = db.serviceRoleKey

const PORT = process.env.CACHE_E2E_PORT || '3211'
// Explicit, not incidental: the webServer child (run-test-project-server.mjs)
// inherits process.env and has its own independent '3211' fallback — without
// this it only happened to agree with this file's default by coincidence.
// playwright.form.config.ts picks a different port and would silently start
// its server on the wrong one without this same line — that's the bug this
// comment is here so nobody reintroduces.
process.env.CACHE_E2E_PORT = PORT
// Only this suite's own server puts its fixture category's name back
// (run-test-project-server.mjs): the form and admin-write servers, and
// anyone's local run, start against the same project while this suite is
// renaming it, and once reset it mid-test (#342, Oct 22).
process.env.CACHE_ROUNDTRIP_OWNS_FIXTURE = '1'
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

  // Its community is hidden (scripts/writeSuiteCommunity.mjs); this is the
  // cookie that opens its public pages, for `page` and `request` alike.
  use: { baseURL: BASE_URL, storageState: { cookies: [writeSuitePreviewCookie(BASE_URL)], origins: [] } },

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
