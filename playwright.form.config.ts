import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// The form-submission suite (e2e-form/) — a separate Playwright config from
// playwright.config.ts on purpose, same reasoning as playwright.cache.config.ts.
// The real e2e suite is barred from writing to the database (see AGENTS.md);
// this suite needs to actually submit a real wizard to prove the whole
// pipeline works (branching DSL -> Wizard UI -> /api/requests -> the
// database), which a passing test running against the real project would
// leave sitting in someone's real inbox/moderation queue forever. So it runs
// against the same dedicated, disposable test Supabase project the
// integration and cache-round-trip suites use — never the real one, refused
// explicitly below. `npm run test:form-roundtrip` runs this config.
//
// Unlike the cache-round-trip suite, this one needs no admin session — form
// submission itself is a public endpoint. Verifying the response actually
// landed (and cleaning it up afterward) uses a plain service-role Supabase
// client created directly in the spec file, from these same remapped vars.
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

// Same worker-re-import guard as playwright.cache.config.ts — see that
// file's comment for the full explanation. A different marker name so the
// two suites' own remap-once checks can never interfere with each other,
// even though in practice each runs as its own top-level process.
if (!process.env.FORM_E2E_REMAPPED) {
  // SHARED_DEV_TEST_PROJECT opts out of this refusal — see
  // src/test/integrationEnv.ts's comment for why that's a deliberate choice,
  // not a hole in the check.
  if (url === process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SHARED_DEV_TEST_PROJECT) {
    throw new Error(
      'TEST_SUPABASE_URL is the same as NEXT_PUBLIC_SUPABASE_URL — refusing to run the form-submission suite ' +
        'against the real Supabase project. Point TEST_SUPABASE_URL at a separate, disposable project, ' +
        'or set SHARED_DEV_TEST_PROJECT=1 if you deliberately use the same project for both.',
    )
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
  process.env.FORM_E2E_REMAPPED = '1'
}

// Its own port and dist dir — never the real e2e suite's (3210) or the
// cache-round-trip suite's (3211, .next-cache-e2e).
const PORT = process.env.CACHE_E2E_PORT || '3212'
// Explicit, not incidental — see the identical line's comment in
// playwright.cache.config.ts for why this actually matters here: without
// it, the webServer child falls back to ITS OWN default (3211, the OTHER
// suite's port) since it never actually receives this file's PORT value,
// and Playwright then waits forever on 3212 for a server listening on 3211.
process.env.CACHE_E2E_PORT = PORT
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e-form',
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI
    ? [['dot'], ['html', { open: 'never', outputFolder: 'playwright-report-form' }]]
    : 'list',

  use: { baseURL: BASE_URL },

  webServer: {
    // Its own port (3212) and, since run-test-project-server.mjs derives its
    // build output from CACHE_E2E_PORT, its own dist dir too — never the
    // real e2e suite's build or the cache-round-trip suite's.
    command: 'node scripts/run-test-project-server.mjs',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
