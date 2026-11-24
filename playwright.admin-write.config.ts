import { existsSync } from 'node:fs'
import { testDatabase } from './scripts/testDatabase.mjs'
import { defineConfig, devices } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// The admin-write suite (e2e-admin-write/) — a separate Playwright config
// from playwright.config.ts, same reasoning as playwright.cache.config.ts /
// playwright.form.config.ts. e2e/admin.spec.ts proves the real admin UI
// loads and shows real content, but is deliberately read-only (it
// authenticates as the actual production admin address — see that file's
// own comments). Nothing has ever driven the admin console's actual
// behavior: clicking Approve/Reject on a real submission, watching the
// change land. This does, against a local Supabase of its own (below),
// like the other write suites.
// `npm run test:admin-write` runs this config.
// ─────────────────────────────────────────────────────────────────────────────

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

// The suites' own database, always a local Supabase (scripts/testDatabase.mjs;
// `npm run test:db` starts one). Set here, before the server and the setup
// start, so both use it too.
const db = testDatabase()
process.env.NEXT_PUBLIC_SUPABASE_URL = db.url
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = db.anonKey
process.env.SUPABASE_SERVICE_ROLE_KEY = db.serviceRoleKey

// Its own port and dist dir — never the real e2e suite's (3210), the
// cache-round-trip suite's (3211), or the form-submission suite's (3212).
const PORT = process.env.CACHE_E2E_PORT || '3213'
// Explicit, not incidental — see the identical line's comment in
// playwright.cache.config.ts for why this actually matters: without it, the
// webServer child falls back to its OWN default (3211) since it never
// actually receives this file's PORT value, and Playwright then waits
// forever on 3213 for a server listening on 3211.
process.env.CACHE_E2E_PORT = PORT
const BASE_URL = `http://localhost:${PORT}`
const AUTH_FILE = 'e2e-admin-write/.auth/admin.json'

export default defineConfig({
  testDir: './e2e-admin-write',
  expect: { timeout: 5_000 },
  // Above the 30s the community-editor's revalidation polls ask for. At
  // Playwright's default the two were the same number, so those polls could
  // never use their last retry — the test expired at the instant the poll
  // would have. They pass today only because the condition resolves quickly;
  // the documented headroom was fictional. Same bug as e2e-cache's /about
  // poll, found by src/test/e2eTimeouts.test.ts.
  timeout: 60_000,
  // Every spec creates/cleans up its own submission/category/resource rows
  // by id, but they all share the one moderation queue — safer sequential.
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI
    ? [['dot'], ['html', { open: 'never', outputFolder: 'playwright-report-admin-write' }]]
    : 'list',

  use: {
    baseURL: BASE_URL,
    // A failure keeps its trace: each request's timing and the steps, so a
    // test that waited on a slow screen says which request it waited on.
    // Snapshots stay on: without them Playwright keeps no network log at
    // all (checked). No screenshots, so it records less. Until Nov 16 a CI
    // failure left only the last page, and two stalls over 5s (Places'
    // first load, a Dismiss that is one database delete) had nothing to
    // say where the time went.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: false },
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'admin-write',
      testMatch: /\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
    },
  ],

  webServer: {
    // Its own port (3213) and, since run-test-project-server.mjs derives its
    // build output from CACHE_E2E_PORT, its own dist dir too — never the
    // real e2e suite's build or either sibling test-project suite's.
    command: 'node scripts/run-test-project-server.mjs',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
