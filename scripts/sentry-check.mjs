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

const url = new URL(`https://sentry.io/api/0/organizations/${ORG}/issues/`)
url.searchParams.set('query', 'is:unresolved environment:production')
url.searchParams.set('statsPeriod', '14d')
url.searchParams.set('limit', '25')
url.searchParams.set('project', PROJECT)

const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })

if (!res.ok) {
  const body = await res.text()
  console.log(`\n  ✗ Sentry API request failed (${res.status}): ${body}\n`)
  // A broken/expired token shouldn't silently look like "no issues" —
  // fail loud rather than let real errors go unnoticed.
  process.exit(1)
}

const issues = await res.json()

if (issues.length === 0) {
  console.log('\n  ✓ No unresolved production errors in Sentry.\n')
  process.exit(0)
}

console.log(`\n  ⚠ ${issues.length} unresolved production error(s) in Sentry:\n`)
for (const issue of issues) {
  const seen = issue.count === '1' ? '1 event' : `${issue.count} events`
  console.log(`  ${issue.shortId}  ${issue.title}`)
  console.log(`    ${seen} · last seen ${new Date(issue.lastSeen).toLocaleString()}`)
  console.log(`    ${issue.permalink}\n`)
}
console.log('  Investigate and fix what you can alongside the current change — see AGENTS.md.\n')
