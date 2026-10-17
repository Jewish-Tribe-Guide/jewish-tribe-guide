// Actually deletes old production deployment history to free up Deployment
// Storage — the follow-up to vercel-production-prune-dry-run.mjs, once its
// list has been reviewed. Irreversible: a deleted deployment is gone, not
// recoverable from Vercel's own UI or API afterward, and it also stops
// being a target Vercel's "instant rollback" dashboard action can pick.
//
//   node --env-file=.env.local scripts/vercel-production-prune-delete.mjs
//
// Same VERCEL_TOKEN / VERCEL_PROJECT / VERCEL_TEAM_ID / KEEP_PRODUCTION as
// the dry-run script (see its own header) — VERCEL_TOKEN needs write access
// this time, not just read, since a plain read-scope token will 403 on the
// delete calls.
//
// Requires CONFIRM_PRUNE_PRODUCTION=1 as a SEPARATE, explicit opt-in — a
// deliberately different name from the preview cleanup pair's
// CONFIRM_DELETE, so an env var left over from running THAT script earlier
// can never accidentally arm THIS one. Running this file with only the
// dry-run's env vars set prints what it WOULD delete and stops there, same
// shape as the dry run, on purpose.
//
// This is the one Vercel cleanup script here that DOES touch production
// deployments — see vercel-deployments-delete.mjs's own header for why that
// pair never does. Exists because this project has no Deployment Retention
// setting available (Hobby plan, not Pro), so nothing else ever prunes old
// production history on its own. KEEP_PRODUCTION (default 20, same default
// as the dry run) is the safety margin — see splitProductionByRetention's
// own doc (vercelDeployments.mjs) for what it does and doesn't guarantee.
//
// The single OLDEST production deployment overall is also always spared —
// the user's own call, purely for nostalgia, not a safety concern — and
// stays spared across a rate-limited rerun the same way the recent window
// does: this recomputes "oldest of what's left" fresh from a live re-fetch
// each time, never from a stale list.

import { fetchAllDeployments, splitByProductionSafety, splitProductionByRetention } from './vercelDeployments.mjs'

const TOKEN = process.env.VERCEL_TOKEN
const PROJECT = process.env.VERCEL_PROJECT
const TEAM_ID = process.env.VERCEL_TEAM_ID
const KEEP = Number(process.env.KEEP_PRODUCTION ?? 20)
const CONFIRMED = process.env.CONFIRM_PRUNE_PRODUCTION === '1'

if (!TOKEN || !PROJECT) {
  console.log('\n  Skipped — VERCEL_TOKEN or VERCEL_PROJECT not set. See vercel-production-prune-dry-run.mjs\'s own header.\n')
  process.exit(0)
}

if (!Number.isInteger(KEEP) || KEEP < 1) {
  console.log(`\n  ✗ KEEP_PRODUCTION must be a positive whole number — got "${process.env.KEEP_PRODUCTION}".\n`)
  process.exit(1)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function deleteOne(id) {
  const url = new URL(`https://api.vercel.com/v13/deployments/${id}`)
  if (TEAM_ID) url.searchParams.set('teamId', TEAM_ID)
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } })
  if (res.ok) return { ok: true }
  const bodyText = await res.text().catch(() => '')
  let parsed
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    // Not JSON — leave parsed undefined, bodyText still gets logged below.
  }
  return { ok: false, status: res.status, bodyText, error: parsed?.error }
}

try {
  const deployments = await fetchAllDeployments(TOKEN, PROJECT, TEAM_ID)
  const { production, preview } = splitByProductionSafety(deployments)
  const { keep, prune } = splitProductionByRetention(production, KEEP, { keepOldest: true })

  console.log(`\n  ${deployments.length} total deployments — ${production.length} production, ${preview.length} preview/branch (never touched by this script).`)
  console.log(`  Keeping the ${KEEP} most recent production deployments plus the single oldest (nostalgia); pruning ${prune.length} older ones.\n`)

  if (!CONFIRMED) {
    console.log(`  This is still a dry run — CONFIRM_PRUNE_PRODUCTION=1 is not set.`)
    console.log(`  Running with it set would DELETE all ${prune.length} production deployments listed above.`)
    console.log('  This cannot be undone, and removes them as rollback targets. Nothing was deleted.\n')
    process.exit(0)
  }

  console.log(`  CONFIRM_PRUNE_PRODUCTION=1 — pruning ${prune.length} old production deployments now.\n`)

  let deleted = 0
  const failures = []

  for (const d of prune) {
    const result = await deleteOne(d.uid)
    if (result.ok) {
      deleted++
      console.log(`  ✓ deleted  ${d.uid}  ${d.url}`)
    } else if (result.error?.code === 'rate_limited') {
      // Same cap as the preview delete script hits — see its own comment
      // here for the full explanation. Re-running this exact script later
      // picks up cleanly: it re-fetches the live list fresh, so anything
      // already deleted this run simply won't be in `prune` again, and
      // `keep` is recomputed fresh too so it can't drift as deletions
      // change which deployments are "most recent."
      const resetMs = result.error.limit?.reset
      const waitMin = resetMs ? Math.max(1, Math.ceil((resetMs - Date.now()) / 60000)) : 10
      console.log(`\n  Rate limited by Vercel's own deployment-removal cap (${result.error.limit?.total ?? 200} per window).`)
      console.log(`  ${deleted} deleted so far, ${prune.length - deleted} left. Wait ~${waitMin} more minute(s), then rerun this exact script —`)
      console.log('  it will pick up where this left off automatically.\n')
      process.exit(0)
    } else {
      failures.push({ id: d.uid, url: d.url, status: result.status, bodyText: result.bodyText })
      console.log(`  ✗ failed   ${d.uid}  ${d.url}  (${result.status})`)
    }
    await sleep(150)
  }

  console.log(`\n  Done — ${deleted} deleted, ${failures.length} failed, ${keep.length} production deployments kept (most recent + the oldest).\n`)
  if (failures.length) {
    console.log('  Failures:')
    for (const f of failures) console.log(`    ${f.id}  ${f.url}  (${f.status}): ${f.bodyText}`)
    console.log()
  }
} catch (err) {
  console.log(`\n  ✗ ${err.message}\n`)
  process.exit(1)
}
