#!/usr/bin/env node
// e2e as CI's shards run it: against the local test database, freshly
// seeded, with E2E_SEEDED=1 so a test missing its data fails instead of
// skipping (e2e/helpers.ts's needs()).
//
//   npm run test:e2e:seed                       the whole suite
//   npm run test:e2e:seed -- home.spec.ts -g x  any Playwright arguments
//
// Plain `npm run test:e2e` still runs against whatever .env.local names
// (dev). Needs Docker; starts the database if it isn't running.
import { execFileSync, spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { testDatabase } from './testDatabase.mjs'
import { seedStorageUrl } from './seedStorage.mjs'

/** True when something answers on the port: a dev server on 3000 shares
 *  .next with the build e2e makes, and skews its budgets (AGENTS.md). */
const listening = (port) =>
  new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('error', () => resolve(false))
  })

if (await listening(3000)) {
  console.error('A dev server is running on port 3000. Stop it first: it shares .next with the build e2e makes.')
  process.exit(1)
}

execFileSync('node', ['scripts/test-db.mjs'], { stdio: 'inherit' })
const db = testDatabase({})
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: db.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: db.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: db.serviceRoleKey,
  NEXT_PUBLIC_SUPABASE_STORAGE_URL: seedStorageUrl(),
  E2E_SEEDED: '1',
}
const result = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], { stdio: 'inherit', env })
process.exit(result.status ?? 1)
