#!/usr/bin/env node
// Starts the write suites' database on this machine and loads the starting
// data, the same way every CI job does (.github/actions/own-test-database
// runs this too). See scripts/testDatabase.mjs for why it's always local.
//
//   npm run test:db          start it if it isn't running, then load the seed
//   npm run test:db -- seed  load the seed again (a clean start for a suite)
//   npm run test:db -- stop  stop it and throw its data away
//
// Needs Docker running, and about 3 GB. The seed replaces every row, so a
// suite run after it starts from the same data CI's does.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { SUPABASE_CLI, isLocalAddress, parseStatus } from './testDatabase.mjs'

// Only what the suites use: no Studio, Storage, Realtime, email or logs.
const LEFT_OUT = 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
const DB_CONTAINER = `supabase_db_${readFileSync('supabase/config.toml', 'utf-8').match(/^project_id = "([^"]+)"/m)[1]}`

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })
const supabase = (...args) => run('npx', ['-y', SUPABASE_CLI, ...args])

function seed() {
  const status = parseStatus(execFileSync('npx', ['-y', SUPABASE_CLI, 'status', '-o', 'env'], { encoding: 'utf-8' }))
  // restore.mjs writes wherever it's pointed: make sure that's this machine.
  if (!isLocalAddress(status.API_URL)) throw new Error(`Not a local Supabase: ${status.API_URL}`)
  run('node', ['scripts/restore.mjs', 'supabase/seed', '--no-files', '--replace'], {
    env: { ...process.env, RESTORE_URL: status.API_URL, RESTORE_KEY: status.SERVICE_ROLE_KEY },
  })
  const psql = (file) => run('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-q', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: readFileSync(file), stdio: ['pipe', 'inherit', 'inherit'] })
  // The seed keeps its ids; move the id counters past them.
  psql('scripts/reset-sequences.sql')
  // Its changes dated up to today: What changed shows the last 30 days.
  psql('scripts/seed-fresh-dates.sql')
}

const command = process.argv[2] ?? 'start'
try {
  if (command === 'start') {
    supabase('start', '-x', LEFT_OUT)
    seed()
  } else if (command === 'seed') {
    seed()
  } else if (command === 'stop') {
    supabase('stop', '--no-backup')
  } else {
    throw new Error(`Unknown command "${command}": start, seed or stop.`)
  }
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
