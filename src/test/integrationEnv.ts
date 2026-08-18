import { existsSync } from 'node:fs'

// Points src/lib/supabase/admin.ts's getAdminClient() at a dedicated TEST
// Supabase project instead of the real one, for the duration of the
// integration suite only (this file only ever runs under
// vitest.integration.config.mts, a separate process from `npm test`/`next
// dev`/e2e, so there's no risk of it leaking into those).
//
// Locally, .env.local carries both the app's real Supabase project (used by
// `npm run dev`) and TEST_SUPABASE_URL/TEST_SUPABASE_SERVICE_ROLE_KEY for a
// second, disposable project — see README "Integration tests" for how to set
// one up. In CI these come in as repo secrets directly.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const url = process.env.TEST_SUPABASE_URL
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error(
    'Integration tests need TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY, pointing at a ' +
      'dedicated test Supabase project (never the real one) — see README "Integration tests".',
  )
}

// Refuse to run against the app's own project even if someone points
// TEST_SUPABASE_URL at it by mistake — these tests create and delete real
// rows, and `resource`/`category`/`submission` are exactly the tables a
// mistake here would corrupt.
if (url === process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error(
    'TEST_SUPABASE_URL is the same as NEXT_PUBLIC_SUPABASE_URL — refusing to run integration tests ' +
      'against the real Supabase project. Point TEST_SUPABASE_URL at a separate, disposable project.',
  )
}

process.env.NEXT_PUBLIC_SUPABASE_URL = url
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
