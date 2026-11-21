import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Unit tests for the pure logic in src/lib (time/hours/zmanim/distance math,
// input validation — the functions whose bugs are invisible in a screenshot)
// plus component tests for src/components.
//
// Default environment is `node` — most existing tests are plain functions
// with no DOM. Component tests (src/**/*.test.tsx) opt into jsdom per-file via
// a `// @vitest-environment jsdom` docblock at the top of the file, rather
// than switching the whole suite to jsdom, so the fast majority of tests keep
// paying zero DOM-simulation cost.
// Every run is in UTC, as CI's machines are. Hours, candle lighting and
// zmanim are read on the community's clock, and a test that sets "noon" on
// the machine's clock instead passed on a laptop in New York and failed in
// CI (Nov 18: 37 tests, PR 396). Set before the workers start, which inherit
// it; src/test/testTimezone.test.ts fails if it stops applying.
process.env.TZ = 'UTC'

export default defineConfig({
  plugins: [react()],
  // Resolves the `@/*` paths from tsconfig.json. Native to Vite now — the
  // vite-tsconfig-paths plugin is no longer needed for this.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    // scripts/ is in here as well as src/ because the one-off migration
    // scripts rewrite production data with no undo, and at least one of them
    // duplicates logic from src/lib that would otherwise be free to drift.
    // Coverage thresholds below still describe src/ only — a migration script
    // isn't application code and shouldn't move that number either way.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    // Integration tests (src/**/*.integration.test.ts) hit a real Supabase
    // project and need credentials + setup this config doesn't provide — they
    // run separately via vitest.integration.config.mts / `npm run
    // test:integration`. Excluding them here isn't just scoping: without it,
    // this config's real-project SUPABASE_SERVICE_ROLE_KEY would let them
    // run for real, writing to and deleting from production data.
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
    // Above the findBy*/waitFor wait in vitest.setup.ts (5s), so a slow wait
    // fails as itself instead of as the test's own timeout. Equal to it, as
    // both were from Nov 20, a test running out of budget mid-wait landed at
    // exactly 5000ms (main, Nov 21: ModerationQueue's "1 of 2" again).
    // src/test/unitTimeouts.test.ts holds the order.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Coverage of the tests/config themselves is meaningless — scope to the
      // application code the numbers are meant to describe.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.d.ts'],
      // A floor, not a target: `npm run test:coverage` (and so CI) fails if
      // coverage drops below this. Set a few points under the actual number
      // (run `npm run test:coverage` to see it) so normal work doesn't
      // trip it, but a PR that adds a meaningful chunk of untested code
      // will. Raise these numbers as coverage grows — never lower them to
      // make a failing PR pass; fix the coverage instead.
      thresholds: {
        statements: 62,
        branches: 59,
        functions: 61,
        lines: 63,
      },
    },
  },
})
