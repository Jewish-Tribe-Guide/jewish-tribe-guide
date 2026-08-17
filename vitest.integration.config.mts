import { defineConfig } from 'vitest/config'

// The integration tier: real reads/writes against a dedicated TEST Supabase
// project (never the one `npm run dev`/production use — see
// src/test/integrationEnv.ts, which refuses to run if TEST_SUPABASE_URL looks
// like the app's own NEXT_PUBLIC_SUPABASE_URL).
//
// Separate from vitest.config.mts on purpose: these tests are slower (real
// network round trips) and need credentials `npm test` doesn't, so they don't
// run as part of the fast default loop or count toward its coverage gate.
// `npm run test:integration` runs this config explicitly.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    setupFiles: ['./src/test/integrationEnv.ts'],
    // Real Postgres round trips; each test also does its own cleanup. Give
    // more headroom than the default 5s before calling a hang a failure.
    testTimeout: 15_000,
  },
})
