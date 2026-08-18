#!/usr/bin/env node
// Boots a REAL production build (`next build && next start` — Cache
// Components only behaves correctly there, not under `next dev`) pointed at
// a dedicated, disposable test Supabase project instead of the real one, so
// the cache-round-trip e2e suite (e2e-cache/) can safely write through the
// real admin API and watch the change reach the cached public page.
//
// Never invoke `next build`/`next start` directly for this suite — this
// script is the only thing that remaps TEST_SUPABASE_* onto the vars the app
// actually reads, and the only thing that refuses to run if TEST_SUPABASE_URL
// looks like it might be the real project.
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { CACHE_TEST_ADMIN_EMAIL } from './cacheE2eAdmin.mjs'

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
  console.error(`❌ Missing ${missing.join(', ')} — see README "Integration tests" for how to set up the test project.`)
  process.exit(1)
}

// Same refusal e2e-cache/auth.setup.ts and src/test/integrationEnv.ts make —
// this suite writes real data through the real admin API, so pointing it at
// the actual production project by mistake would mean writing to production.
if (url === process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error(
    '❌ TEST_SUPABASE_URL is the same as NEXT_PUBLIC_SUPABASE_URL — refusing to run the cache-round-trip ' +
      'suite against the real Supabase project. Point TEST_SUPABASE_URL at a separate, disposable project.',
  )
  process.exit(1)
}

const PORT = process.env.CACHE_E2E_PORT || '3211'

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  ADMIN_EMAILS: CACHE_TEST_ADMIN_EMAIL,
  // Its own build output — never overwrite whatever the real e2e suite or a
  // local `npm run build` left in .next.
  NEXT_DIST_DIR: '.next-cache-e2e',
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))))
    child.on('error', reject)
  })
}

try {
  await run('npx', ['next', 'build'])
  await run('npx', ['next', 'start', '--port', PORT])
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
