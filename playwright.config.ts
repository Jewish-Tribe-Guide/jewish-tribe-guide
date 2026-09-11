import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end tests.
//
// These exist because the largest change this codebase has had — giving every
// screen its own URL, and moving the content to the server — had no automated
// coverage at all. It was verified by hand, once, by clicking through it. That
// catches a break the day it's made and never again.
//
// Run against a production build, not `next dev`, deliberately. Three things
// this project depends on only behave correctly in production: the prerendered
// HTML (the whole point of the server-rendering work), Cache Components, and
// the service worker, which refuses to register in development. Testing the
// dev server would test a different application.
// ─────────────────────────────────────────────────────────────────────────────

// The `npm run build && next start` webServer command below gets .env.local
// for free — Next.js auto-loads it in that child process. This config file
// (and e2e/auth.setup.ts, which needs SUPABASE_SERVICE_ROLE_KEY/SUPERADMIN_EMAILS
// to mint a real admin session) runs in the Playwright test-runner process
// itself, which does not — same reasoning as scripts/*.mjs's own
// `node --env-file=.env.local`. Guarded rather than required: CI has no
// .env.local and instead injects these as real repo secrets.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const PORT = 3210
const BASE_URL = `http://localhost:${PORT}`
const ADMIN_AUTH_FILE = 'e2e/.auth/admin.json'

export default defineConfig({
  testDir: './e2e',
  // A failing assertion should fail, not hang for the default 30s.
  expect: { timeout: 5_000 },
  // Above the 45s budget e2e/helpers.ts gives its content fetches, so that
  // budget can actually take effect — at the 30s default the two are the same
  // number and the test dies at the exact moment the request would have,
  // which is how a contended read surfaced as an opaque test timeout instead
  // of a named URL. Assertions are unaffected: `expect` still fails in 5s, so
  // a real regression surfaces just as fast as before. This only widens the
  // window for the network, and only in the setup helpers that use it.
  timeout: 60_000,
  fullyParallel: true,
  // No explicit value used to mean Playwright's own default (half the CPU
  // count) — 3 on a 6-core dev machine, but GitHub's ubuntu-latest runner
  // only has 4 vCPUs shared between the Next.js server, every worker's own
  // Chromium instance, AND the test runner process itself, which is a much
  // more contended box than 4 raw cores suggests. Reported live: the SAME
  // handful of content-read tests (home.spec.ts, routing.spec.ts —
  // "element(s) not found" well inside their own timeouts, not a real
  // absence) failed in CI across several runs, changing which exact test
  // failed each time, while the full suite — same code, same fresh
  // production build, `CI=true` to match reuseExistingServer's behavior —
  // passed 177/177 locally every time. That rules out the application code
  // and the tests themselves; what's left is the runner having measurably
  // less real throughput per worker than this default assumes.
  //
  // Set to 1, not some smaller-but-still-parallel number — Playwright's
  // default already resolves from the runner's own reported CPU count
  // (which a container typically inherits from the host via cgroups, not
  // something this file can read in advance), so a guessed intermediate
  // value risks silently matching the existing default and changing
  // nothing. 1 is the only value guaranteed to actually remove inter-test
  // contention as a variable, rather than possibly not moving it at all.
  // Capped globally rather than tuning individual test timeouts one at a
  // time, since the failing test was a different one on every run — the
  // contention is the actual variable, not any single assertion's own
  // budget. Serial in CI costs real wall-clock time (this job's own
  // 15-minute timeout has slack for it), not correctness.
  workers: process.env.CI ? 1 : undefined,
  // Nothing here should be flaky; a retry that passes is hiding something.
  retries: 0,
  // CI keeps console output terse (dot) but also writes an HTML report, so a
  // failure has a real artifact to open instead of just a scrollback line.
  reporter: process.env.CI ? [['dot'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },

  projects: [
    // Pays the one cold Supabase read every `use cache` content store needs,
    // before the parallel workers all pile onto it inside their own 30s test
    // budgets — see e2e/warmup.setup.ts for the CI failure that motivated it.
    // Everything below depends on it.
    { name: 'warmup', testMatch: /warmup\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    // testIgnore: admin.spec.ts needs the signed-in storageState only the
    // `admin` project below supplies — it doesn't belong to the anonymous-
    // visitor suite these two run. (auth.setup.ts and warmup.setup.ts don't
    // need excluding — Playwright's default testMatch only picks up
    // *.spec.ts/*.test.ts.)
    { name: 'desktop', testIgnore: /admin\.spec\.ts/, dependencies: ['warmup'], use: { ...devices['Desktop Chrome'] } },
    // The mobile tab bar and the inline card grid only exist below the `sm`
    // breakpoint, so they can't be covered by the desktop project at all.
    { name: 'mobile', testIgnore: /admin\.spec\.ts/, dependencies: ['warmup'], use: { ...devices['Pixel 7'] } },
    // Mints a real admin session (via the service-role key, same mechanism
    // /api/admin/dev-login uses — see that route's own comments — just
    // reproduced here since dev-login refuses outright against this
    // project's production build) and saves it to ADMIN_AUTH_FILE. Runs
    // before the `admin` project below, which reuses that session instead of
    // signing in fresh for every spec file.
    { name: 'setup', testMatch: /auth\.setup\.ts/, dependencies: ['warmup'], use: { ...devices['Desktop Chrome'] } },
    // Signed-in admin console coverage — read-only (see e2e/admin.spec.ts's
    // own note on why: this authenticates as the real production admin
    // address, and nothing in e2e may write to the database).
    {
      name: 'admin',
      testMatch: /admin\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_AUTH_FILE },
    },
  ],

  webServer: {
    // Its own port, so a dev server left running on 3000 doesn't get tested by
    // accident — which would silently test the wrong build.
    command: `npm run build && npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
