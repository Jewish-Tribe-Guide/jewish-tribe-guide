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
export default defineConfig({
  plugins: [react()],
  // Resolves the `@/*` paths from tsconfig.json. Native to Vite now — the
  // vite-tsconfig-paths plugin is no longer needed for this.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Integration tests (src/**/*.integration.test.ts) hit a real Supabase
    // project and need credentials + setup this config doesn't provide — they
    // run separately via vitest.integration.config.mts / `npm run
    // test:integration`. Excluding them here isn't just scoping: without it,
    // this config's real-project SUPABASE_SERVICE_ROLE_KEY would let them
    // run for real, writing to and deleting from production data.
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
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
        statements: 29,
        branches: 26,
        functions: 29,
        lines: 29,
      },
    },
  },
})
