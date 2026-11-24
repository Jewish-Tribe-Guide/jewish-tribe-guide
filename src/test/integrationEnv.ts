import { existsSync } from 'node:fs'
import { testDatabase } from '../../scripts/testDatabase.mjs'

// Points src/lib/supabase/admin.ts's getAdminClient() at the write suites'
// own database, always a local Supabase (scripts/testDatabase.mjs;
// `npm run test:db` starts one), for the integration suite only. This file
// only ever runs under vitest.integration.config.mts, a separate process
// from `npm test`/`next dev`/e2e, so it can't leak into those.
//
// .env.local is loaded for anything else the code reads; its own
// NEXT_PUBLIC_SUPABASE_URL is replaced below.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const db = testDatabase()
process.env.NEXT_PUBLIC_SUPABASE_URL = db.url
process.env.SUPABASE_SERVICE_ROLE_KEY = db.serviceRoleKey
