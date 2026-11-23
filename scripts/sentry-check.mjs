// npm run sentry:check — a read-only look at what's currently unresolved in
// production Sentry. Meant to run the way the test suites do: before calling
// a change "done", not just when something feels broken — see AGENTS.md's
// "Sentry" section. Catches errors accumulating quietly between sessions
// instead of only reacting to ones already staring you in the face.
//
//   npm run sentry:check            (loads .env.local)
//   node --env-file=.env.local scripts/sentry-check.mjs
//
// Needs SENTRY_API_TOKEN — a separate, read-only (org:read, project:read,
// event:read) personal auth token from Settings → Auth Tokens on your
// Sentry account. NOT the same as SENTRY_AUTH_TOKEN, which is scoped only
// for the build's source-map upload and can't read issues (see .env.example).

const ORG = process.env.SENTRY_ORG
const PROJECT = process.env.SENTRY_PROJECT
const TOKEN = process.env.SENTRY_API_TOKEN

if (!ORG || !PROJECT || !TOKEN) {
  console.log('\n  Sentry check skipped — SENTRY_ORG, SENTRY_PROJECT, or SENTRY_API_TOKEN not set.')
  console.log('  (SENTRY_API_TOKEN is a separate read-only token from SENTRY_AUTH_TOKEN — see .env.example.)\n')
  process.exit(0)
}

const headers = { Authorization: `Bearer ${TOKEN}` }

async function get(path, params) {
  const url = new URL(`https://sentry.io/api/0/organizations/${ORG}/${path}`)
  for (const [k, v] of params) url.searchParams.append(k, v)
  const res = await fetch(url, { headers })
  if (!res.ok) {
    // A broken/expired token shouldn't silently look like "no issues" —
    // fail loud rather than let real errors go unnoticed.
    console.log(`\n  ✗ Sentry API request failed (${res.status}): ${await res.text()}\n`)
    process.exit(1)
  }
  return res.json()
}

// "No errors" means nothing if Sentry is throwing them away. From Nov 13 to
// Nov 22 it dropped every event, real errors included, because the map's
// CSP reports had used up the month's quota — and this script said ✓.
const stats = await get('stats_v2/', [
  ['field', 'sum(quantity)'],
  ['groupBy', 'outcome'],
  ['category', 'error'],
  ['statsPeriod', '3d'],
  ['interval', '1d'],
])
const dropped = (stats.groups ?? [])
  .filter((g) => g.by.outcome === 'rate_limited')
  .reduce((n, g) => n + (g.totals['sum(quantity)'] ?? 0), 0)
if (dropped > 0) {
  console.log(`\n  ✗ Sentry dropped ${dropped} event(s) over the quota in the last 3 days.`)
  console.log('    Errors sent meanwhile were never recorded, so the list below is not the whole story.')
  console.log('    See Stats in Sentry for what is using the quota.\n')
}

const query = (q) => [
  ['query', q],
  ['statsPeriod', '14d'],
  ['limit', '25'],
  ['project', PROJECT],
]
const issues = await get('issues/', query('is:unresolved environment:production'))
// CSP violation reports come from the browser with no environment, so the
// query above never returns them.
const csp = await get('issues/', query('is:unresolved event.type:csp'))

function list(items) {
  for (const issue of items) {
    const seen = issue.count === '1' ? '1 event' : `${issue.count} events`
    console.log(`  ${issue.shortId}  ${issue.title}`)
    console.log(`    ${seen} · last seen ${new Date(issue.lastSeen).toLocaleString()}`)
    console.log(`    ${issue.permalink}\n`)
  }
}

if (issues.length === 0) {
  console.log('\n  ✓ No unresolved production errors in Sentry.\n')
} else {
  console.log(`\n  ⚠ ${issues.length} unresolved production error(s) in Sentry:\n`)
  list(issues)
}
if (csp.length > 0) {
  console.log(`  ⚠ ${csp.length} Content-Security-Policy report(s) in the last 14 days (src/lib/csp.ts):\n`)
  list(csp)
}
if (issues.length > 0 || csp.length > 0) {
  console.log('  Investigate and fix what you can alongside the current change — see AGENTS.md.\n')
}
process.exit(dropped > 0 ? 1 : 0)
