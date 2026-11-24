// The database the write suites (integration, cache-roundtrip,
// form-roundtrip, admin-write) run against: always a local Supabase, started
// from supabase/migrations and loaded with supabase/seed. In CI each job
// starts its own (.github/actions/own-test-database); locally,
// `npm run test:db` starts one (scripts/test-db.mjs).
//
// Never a hosted project (Nov 23). Until then the suites ran locally against
// the hosted test project, which is also dev and what every Vercel preview
// reads, so a local run wrote rows the previews showed, and the suites
// needed row claims and a hidden community to keep off each other's rows
// and dev's. A local address can't be anyone else's database.
//
// Its own names (TEST_DB_*), not TEST_SUPABASE_*: those still name the
// hosted project for the scripts that mean it (sync-dev-from-prod, the
// watches runner), and .env.local sets them.
import { execFileSync } from 'node:child_process'

export const SUPABASE_CLI = 'supabase@3.1.0'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** True for an address on this machine (or this CI runner). */
export function isLocalAddress(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

/** `supabase status -o env`, as an object: API_URL, ANON_KEY, SERVICE_ROLE_KEY… */
export function parseStatus(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

function localStatus() {
  return parseStatus(execFileSync('npx', ['-y', SUPABASE_CLI, 'status', '-o', 'env'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }))
}

/** The suites' database: TEST_DB_* when set (CI passes them into the
 *  Playwright container, which can't ask Docker), otherwise the local
 *  Supabase that's running. Refuses anything not local. Sets TEST_DB_* on
 *  `env`, so a server the suite starts inherits the same one.
 *  @param {Record<string, string | undefined>} [env]
 *  @param {() => Record<string, string>} [status]
 *  @returns {{ url: string, anonKey: string, serviceRoleKey: string }} */
export function testDatabase(env = process.env, status = localStatus) {
  let db = { url: env.TEST_DB_URL, anonKey: env.TEST_DB_ANON_KEY, serviceRoleKey: env.TEST_DB_SERVICE_ROLE_KEY }
  if (!db.url) {
    let s
    try {
      s = status()
    } catch {
      throw new Error('No test database is running. Start one with `npm run test:db` (needs Docker running).')
    }
    db = { url: s.API_URL, anonKey: s.ANON_KEY, serviceRoleKey: s.SERVICE_ROLE_KEY }
  }
  if (!db.url || !db.anonKey || !db.serviceRoleKey) {
    throw new Error('The test database is missing its address or keys. Restart it with `npm run test:db`.')
  }
  if (!isLocalAddress(db.url)) {
    throw new Error(
      `Refusing to run: the test database must be a local Supabase (\`npm run test:db\`), not ${db.url}. ` +
        'These suites create and delete rows.',
    )
  }
  env.TEST_DB_URL = db.url
  env.TEST_DB_ANON_KEY = db.anonKey
  env.TEST_DB_SERVICE_ROLE_KEY = db.serviceRoleKey
  return db
}
