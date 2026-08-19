// npm run doctor — a read-only health check for a deployment. Verifies Node, the
// environment variables, the database schema + migrations, and how much content
// is seeded, then prints a green/red checklist with a fix for each problem. Runs
// nothing destructive: only version checks and SELECT counts.
//
//   npm run doctor            (loads .env.local)
//   node --env-file=.env.local scripts/doctor.mjs

import { createClient } from '@supabase/supabase-js'

const results = []
const ok = (label, detail) => results.push({ mark: '✓', label, detail })
const warn = (label, detail) => results.push({ mark: '⚠', label, detail })
const fail = (label, detail) => results.push({ mark: '✗', label, detail })

// ── Node ─────────────────────────────────────────────────────────────────────
const [maj, min] = process.versions.node.split('.').map(Number)
if (maj > 20 || (maj === 20 && min >= 9)) ok(`Node ${process.versions.node}`)
else fail(`Node ${process.versions.node} is too old`, 'needs >= 20.9 — `nvm use` (see .nvmrc)')

// ── Environment ──────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

const required = [
  [url, 'NEXT_PUBLIC_SUPABASE_URL', 'Supabase → Settings → API → Project URL'],
  [anon, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Supabase → Settings → API → anon public key'],
  [service, 'SUPABASE_SERVICE_ROLE_KEY', 'Supabase → Settings → API → service_role key (secret)'],
]
for (const [val, key, where] of required) {
  if (val && String(val).trim()) ok(`${key} set`)
  else fail(`${key} missing`, `required — ${where}`)
}

// Optional services, with what turns off when absent.
const optional = [
  ['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'address autocomplete + the resource map'],
  ['RESEND_API_KEY', 'email notifications + confirmations'],
  ['UPSTASH_REDIS_REST_URL', 'durable rate limiting (falls back to in-memory)'],
  ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'CAPTCHA spam protection'],
]
for (const [key, what] of optional) {
  if (process.env[key] && String(process.env[key]).trim()) ok(`${key} set`)
  else warn(`${key} not set`, `optional — ${what} will be off`)
}

// ── Database ─────────────────────────────────────────────────────────────────
if (!url || !service) {
  warn('Database checks skipped', 'set the Supabase URL + service-role key first')
} else {
  const supabase = createClient(url, service, { auth: { persistSession: false } })
  const missingTable = (error) =>
    error && (error.code === '42P01' || /does not exist|find the table/i.test(error.message))

  // Schema — every table the app needs.
  const tables = ['category', 'resource', 'submission', 'tag', 'resource_tag', 'vote', 'hospital']
  let schemaOk = true
  for (const t of tables) {
    const { error, count } = await supabase.from(t).select('*', { head: true, count: 'exact' })
    if (missingTable(error)) {
      schemaOk = false
      fail(`table "${t}" missing`, 'apply supabase/migrations/ (supabase db push, or paste in order)')
    } else if (error) {
      fail(`table "${t}" unreadable`, error.message)
    } else {
      ok(`table "${t}"`, `${count ?? 0} row(s)`)
    }
  }

  // Latest migration — the hospital_id → anchor_id rename (migration 0006).
  // A real (non-head) select validates the column exists.
  if (schemaOk) {
    const { error } = await supabase.from('resource').select('anchor_id').limit(1)
    if (!error) {
      ok('schema up to date', 'anchor_id present')
    } else if (/anchor_id/.test(error.message)) {
      fail('migration 0006 not applied', 'run …_decouple_hospital_to_anchor.sql (renames hospital_id → anchor_id)')
    } else {
      warn('could not verify latest migration', error.message)
    }

    // Seeded content.
    const { count: cats } = await supabase.from('category').select('*', { head: true, count: 'exact' })
    if (cats && cats > 0) ok('categories seeded', `${cats} categor${cats === 1 ? 'y' : 'ies'}`)
    else fail('no categories seeded', 'run `npm run setup`')

    const { count: rows } = await supabase
      .from('resource')
      .select('*', { head: true, count: 'exact' })
      .eq('status', 'approved')
    if (rows && rows > 0) ok('listings present', `${rows} approved`)
    else warn('directory is empty', 'seed content (`npm run setup`) or let the community add it via submissions')
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const pad = Math.max(...results.map((r) => r.label.length))
console.log('\n  Health check\n  ' + '─'.repeat(pad + 20))
for (const r of results) {
  const line = `  ${r.mark}  ${r.label.padEnd(pad)}`
  console.log(r.detail ? `${line}  — ${r.detail}` : line)
}

const fails = results.filter((r) => r.mark === '✗').length
const warns = results.filter((r) => r.mark === '⚠').length
console.log('  ' + '─'.repeat(pad + 20))
if (fails) {
  console.log(`\n  ✗ ${fails} problem(s) to fix${warns ? `, ${warns} optional item(s) off` : ''}.\n`)
  process.exit(1)
}
console.log(`\n  ✓ All required checks passed${warns ? ` — ${warns} optional service(s) off.` : '.'}\n`)
