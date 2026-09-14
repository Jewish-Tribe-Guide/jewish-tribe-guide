// Read-only look at what a mass-deletion of old Vercel deployments would
// remove, to free up Function Storage — see the conversation this was
// written for: Vercel usage emails hit 100% Image Optimization, 75%
// Function Storage, 75% Fluid Active CPU. This only lists; it never
// deletes anything. Run it, read the output, and only write the follow-up
// delete script once the list looks right.
//
//   node --env-file=.env.local scripts/vercel-deployments-dry-run.mjs
//
// Needs VERCEL_TOKEN (Account Settings → Tokens on vercel.com — a plain
// read-scope token is enough for this dry run) and VERCEL_PROJECT — the
// project's name or id, as shown in its Vercel dashboard URL. If the
// project is under a team (not your personal account), also set
// VERCEL_TEAM_ID (Team Settings → General → Team ID, starts with "team_").
// None of these need to go in .env.local permanently — this is a one-off
// check, not something the app itself reads.
//
// Deliberately conservative about what it calls "safe to delete": ANY
// deployment with target 'production' is excluded from that list, full
// stop, not just the current one — a past production deployment is what
// "instant rollback" in Vercel's dashboard rolls back to, and this script
// has no way to know if you still want that safety net. Only ever
// consider deleting what it prints under "preview/branch deployments".

const TOKEN = process.env.VERCEL_TOKEN
const PROJECT = process.env.VERCEL_PROJECT
const TEAM_ID = process.env.VERCEL_TEAM_ID

if (!TOKEN || !PROJECT) {
  console.log('\n  Skipped — VERCEL_TOKEN or VERCEL_PROJECT not set.')
  console.log('  VERCEL_TOKEN: vercel.com → Account Settings → Tokens.')
  console.log('  VERCEL_PROJECT: the project name or id, from its dashboard URL.')
  console.log('  VERCEL_TEAM_ID: only if the project is under a team, not your personal account.\n')
  process.exit(0)
}

async function fetchAllDeployments() {
  const deployments = []
  let until

  for (;;) {
    const url = new URL('https://api.vercel.com/v6/deployments')
    url.searchParams.set('projectId', PROJECT)
    url.searchParams.set('limit', '100')
    if (TEAM_ID) url.searchParams.set('teamId', TEAM_ID)
    if (until) url.searchParams.set('until', String(until))

    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Vercel API request failed (${res.status}): ${body}`)
    }
    const body = await res.json()
    deployments.push(...body.deployments)

    // Vercel's own pagination shape: keep paging while it says there's more.
    if (!body.pagination?.next) break
    until = body.pagination.next
  }

  return deployments
}

try {
  const deployments = await fetchAllDeployments()

  const production = deployments.filter((d) => d.target === 'production')
  const preview = deployments.filter((d) => d.target !== 'production')

  console.log(`\n  ${deployments.length} total deployments found.\n`)

  console.log(`  ── ${production.length} production deployments — NEVER auto-deleted ──\n`)
  for (const d of production.slice(0, 10)) {
    const date = new Date(d.created).toISOString().slice(0, 10)
    console.log(`  ${date}  ${d.uid}  ${d.url}  (${d.state})`)
  }
  if (production.length > 10) console.log(`  … and ${production.length - 10} more\n`)
  else console.log()

  console.log(`  ── ${preview.length} preview/branch deployments — these are what a delete pass would target ──\n`)
  for (const d of preview) {
    const date = new Date(d.created).toISOString().slice(0, 10)
    console.log(`  ${date}  ${d.uid}  ${d.url}  (${d.state})`)
  }

  console.log(`\n  Nothing was deleted — this script only lists. If ${preview.length} preview deployments`)
  console.log('  looks right to remove, say so and the delete script comes next.\n')
} catch (err) {
  console.log(`\n  ✗ ${err.message}\n`)
  process.exit(1)
}
