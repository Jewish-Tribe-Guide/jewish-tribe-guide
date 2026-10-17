// Read-only look at what pruning OLD production deployment history would
// remove — the follow-up to vercel-deployments-dry-run.mjs/-delete.mjs once
// those turn out not to be enough: this project has no Vercel Deployment
// Retention setting available (that's a Pro-plan feature; this project is on
// Hobby), so old production deployments never auto-expire, and they're the
// actual bulk of the Deployment Storage overage — 128 of 147 total
// deployments were `target: 'production'` the day this was written, vs. 19
// preview ones. This only lists; it never deletes anything. Run it, read the
// output, and only run the follow-up delete script
// (vercel-production-prune-delete.mjs) once KEEP_PRODUCTION and the resulting
// prune list look right.
//
//   node --env-file=.env.local scripts/vercel-production-prune-dry-run.mjs
//
// Same VERCEL_TOKEN / VERCEL_PROJECT / VERCEL_TEAM_ID as the preview cleanup
// pair (see vercel-deployments-dry-run.mjs's own header for where to get
// them) — a plain read-scope token is enough for this dry run.
//
// KEEP_PRODUCTION (default 20): how many of the most recent production
// deployments to keep untouched. See splitProductionByRetention's own doc
// (vercelDeployments.mjs) for why this is a generous count-based safety
// margin, not a precise "which one is actually live" check — raise it if
// this project's rollback habits want a longer runway than 20 deploys back.
//
// The single OLDEST production deployment overall is also always spared,
// on top of the recent window — the user's own call, purely for nostalgia
// (the project's very first production deployment), not a safety margin.

import { fetchAllDeployments, splitByProductionSafety, splitProductionByRetention } from './vercelDeployments.mjs'

const TOKEN = process.env.VERCEL_TOKEN
const PROJECT = process.env.VERCEL_PROJECT
const TEAM_ID = process.env.VERCEL_TEAM_ID
const KEEP = Number(process.env.KEEP_PRODUCTION ?? 20)

if (!TOKEN || !PROJECT) {
  console.log('\n  Skipped — VERCEL_TOKEN or VERCEL_PROJECT not set.')
  console.log('  VERCEL_TOKEN: vercel.com → Account Settings → Tokens.')
  console.log('  VERCEL_PROJECT: the project name or id, from its dashboard URL.')
  console.log('  VERCEL_TEAM_ID: only if the project is under a team, not your personal account.\n')
  process.exit(0)
}

if (!Number.isInteger(KEEP) || KEEP < 1) {
  console.log(`\n  ✗ KEEP_PRODUCTION must be a positive whole number — got "${process.env.KEEP_PRODUCTION}".\n`)
  process.exit(1)
}

try {
  const deployments = await fetchAllDeployments(TOKEN, PROJECT, TEAM_ID)
  const { production, preview } = splitByProductionSafety(deployments)
  const { keep, prune } = splitProductionByRetention(production, KEEP, { keepOldest: true })

  console.log(`\n  ${deployments.length} total deployments — ${production.length} production, ${preview.length} preview/branch.`)
  console.log(`  Keeping the ${KEEP} most recent production deployments (plus the single oldest, for nostalgia); pruning ${prune.length} older ones.\n`)

  console.log(`  ── ${keep.length} kept (most recent, plus the oldest) ──\n`)
  for (const d of keep.slice(0, 5)) {
    const date = new Date(d.created).toISOString().slice(0, 10)
    console.log(`  ${date}  ${d.uid}  ${d.url}  (${d.state})`)
  }
  if (keep.length > 5) console.log(`  … and ${keep.length - 5} more (the last of which is the oldest, kept)\n`)
  else console.log()

  console.log(`  ── ${prune.length} would be pruned ──\n`)
  for (const d of prune) {
    const date = new Date(d.created).toISOString().slice(0, 10)
    console.log(`  ${date}  ${d.uid}  ${d.url}  (${d.state})`)
  }

  console.log(`\n  Nothing was deleted — this script only lists. If pruning ${prune.length} old production`)
  console.log(`  deployments (keeping the most recent ${KEEP}, plus the oldest) looks right, run vercel-production-prune-delete.mjs next.\n`)
} catch (err) {
  console.log(`\n  ✗ ${err.message}\n`)
  process.exit(1)
}
