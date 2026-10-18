// Runs every active watch once against the TEST Supabase project — the one
// the Vercel previews read — and records how each went, as the live site's
// daily cron does (/api/cron/watches). Vercel runs crons only on the
// production deployment, so without this the previews' watches never run:
// the Watches tab says "not checked yet" and the home's trust sheet stops
// naming Keystone-K's list a week after anyone last ran it by hand.
//
// Run daily by .github/workflows/test-watches.yml; locally:
//
//   npx tsx scripts/run-test-watches.mts
//
// Keystone-K's list and the hospitals' Refuah pages, and any other page
// watched there. Not Google's nightly check, which costs Places calls (the
// user, Oct 17): the Google keys are taken out of this process, so a new
// place on Keystone-K's list is filed saying Google wasn't asked. Nor email:
// the test project's admins aren't emailed a digest or an alert (the
// "digest failed: Missing required environment variable: RESEND_API_KEY"
// line in the log is that, as expected). Nor the AI: a menu watch
// (menuWatch.ts) sets its fingerprint, and a changed menu waits for the live
// site's run, so the test project's runs cost nothing.

import { existsSync } from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const url = process.env.TEST_SUPABASE_URL
const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Needs TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY (the disposable test project).')
  process.exit(1)
}
// The live database is never this script's to write to.
if (process.env.PROD_SUPABASE_URL && url === process.env.PROD_SUPABASE_URL) {
  console.error('TEST_SUPABASE_URL is the live database. Refusing.')
  process.exit(1)
}

// The app's own client (src/lib/supabase/admin.ts) reads these.
process.env.NEXT_PUBLIC_SUPABASE_URL = url
process.env.SUPABASE_SERVICE_ROLE_KEY = key
for (const k of ['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_GEOCODING_API_KEY', 'RESEND_API_KEY', 'OPENAI_API_KEY']) delete process.env[k]

// Imported after the environment is set: the stores read it when first used.
const { listAllWatches } = await import('../src/lib/watchStore')
const { runAndRecord } = await import('../src/lib/watchRunner')
const { syncMenuWatches } = await import('../src/lib/menuWatchRun')

// Every food place with a menu link gets its watch first, as on the live site.
for (const m of await syncMenuWatches()) console.log(`Menu watches (${m.community}): ${m.added} added, ${m.removed} removed`)

const { watches, available } = await listAllWatches()
if (!available) {
  console.error('The test project has no watch table (migration 070).')
  process.exit(1)
}

const lines: string[] = []
let failed = 0
for (const watch of watches.filter((w) => w.active)) {
  const { outcome } = await runAndRecord(watch)
  const name = watch.label || watch.url
  if (outcome.ok) {
    lines.push(`- ✓ ${name}: ${outcome.filed === 0 ? 'nothing new' : `${outcome.filed} filed`}`)
  } else {
    failed++
    lines.push(`- ✗ ${name}: ${outcome.error}`)
    // An annotation on the run, without failing it: a page that's down for
    // a day is the watch's news, and the Watches tab shows it too.
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Watch not working::${name}: ${outcome.error}`)
  }
}

const summary = [`### Watches on the test project`, '', `${watches.filter((w) => w.active).length} run, ${failed} not working.`, '', ...lines].join('\n')
console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs')
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
}
