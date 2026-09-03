import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// The admin-write suite (e2e-admin-write/) — a separate Playwright config
// from playwright.config.ts, same reasoning as playwright.cache.config.ts /
// playwright.form.config.ts. e2e/admin.spec.ts proves the real admin UI
// loads and shows real content, but is deliberately read-only (it
// authenticates as the actual production admin address — see that file's
// own comments). Nothing has ever driven the admin console's actual
// behavior: clicking Approve/Reject on a real submission, watching the
// change land. This does, against the same dedicated, disposable test
// Supabase project the integration/cache-roundtrip/form-roundtrip suites
// use — never the real one, refused explicitly below.
// `npm run test:admin-write` runs this config.
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

// Same worker-re-import guard as playwright.cache.config.ts/playwright.form.config.ts
// — see playwright.cache.config.ts's comment for the full explanation. A
// distinct marker name so the three suites' own remap-once checks can never
// interfere with each other, even though in practice each runs as its own
// top-level process.
if (!process.env.ADMIN_WRITE_E2E_REMAPPED) {
  // SHARED_DEV_TEST_PROJECT opts out of this refusal — see
  // src/test/integrationEnv.ts's comment for why that's a deliberate choice,
  // not a hole in the check.
  if (url === process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SHARED_DEV_TEST_PROJECT) {
    throw new Error(
      'TEST_SUPABASE_URL is the same as NEXT_PUBLIC_SUPABASE_URL — refusing to run the admin-write suite ' +
        'against the real Supabase project. Point TEST_SUPABASE_URL at a separate, disposable project, ' +
        'or set SHARED_DEV_TEST_PROJECT=1 if you deliberately use the same project for both.',
    )
  }

  // e2e-admin-write/auth.setup.ts runs in this same process and reads these
  // directly — same remap-in-process pattern as the sibling configs.
  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
  process.env.ADMIN_WRITE_E2E_REMAPPED = '1'
}

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

  use: { baseURL: BASE_URL },

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
