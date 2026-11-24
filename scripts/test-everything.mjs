#!/usr/bin/env node
// Every suite CI runs, one after another, each on a fresh seed of the local
// test database: what to run before calling a change done when you're not
// sure which suites it reaches (AGENTS.md has the table). Keeps going after
// a failure and ends with one line per suite.
//
//   npm run test:everything
//
// About 20 minutes. Needs Docker. Leaves the database running; stop it with
// `npm run test:db -- stop`.
import { spawnSync } from 'node:child_process'

const SUITES = [
  ['unit', 'npm', ['test']],
  ['e2e', 'node', ['scripts/test-e2e-seed.mjs']],
  ['integration', 'npm', ['run', 'test:integration']],
  ['cache-roundtrip', 'npm', ['run', 'test:cache-roundtrip']],
  ['form-roundtrip', 'npm', ['run', 'test:form-roundtrip']],
  ['admin-write', 'npm', ['run', 'test:admin-write']],
]

const results = []
for (const [name, cmd, args] of SUITES) {
  console.log(`\n━━ ${name} ━━`)
  const started = Date.now()
  // A clean start for each: the write suites change the data. e2e seeds
  // its own (and starts the database the first time).
  if (name !== 'unit' && name !== 'e2e') spawnSync('npm', ['run', 'test:db', '--', 'seed'], { stdio: 'inherit' })
  const { status } = spawnSync(cmd, args, { stdio: 'inherit' })
  results.push({ name, ok: status === 0, minutes: ((Date.now() - started) / 60_000).toFixed(1) })
}

console.log('\n━━ Summary ━━')
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(16)} ${r.minutes} min`)
const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.log(`\n${failed.length} suite(s) failed: ${failed.map((r) => r.name).join(', ')}. Their own output is above.`)
  process.exit(1)
}
