// Actually deletes old Vercel deployments to free up Function Storage — the
// follow-up to vercel-deployments-dry-run.mjs, once its list has been
// reviewed. Irreversible: a deleted deployment is gone, not recoverable
// from Vercel's own UI or API afterward.
//
//   node --env-file=.env.local scripts/vercel-deployments-delete.mjs
//
// Same VERCEL_TOKEN / VERCEL_PROJECT / VERCEL_TEAM_ID as the dry-run script
// (see its own header) — VERCEL_TOKEN needs write access this time, not
// just read, since a plain read-scope token will 403 on the delete calls.
//
// Requires CONFIRM_DELETE=1 as a SEPARATE, explicit opt-in on top of those
// three — running this file with only the dry-run's env vars set prints
// what it WOULD delete and stops there, same shape as the dry run, on
// purpose: those three vars alone might already be sitting in .env.local
// from running the dry run earlier, and this being real (not another
// listing) needs its own unambiguous signal, not just "the same file
// happened to be invoked."
//
// Only ever targets what splitByProductionSafety (vercelDeployments.mjs)
// calls preview/branch deployments — no target 'production' deployment is
// ever touched, regardless of CONFIRM_DELETE, full stop.

import { fetchAllDeployments, splitByProductionSafety } from './vercelDeployments.mjs'

const TOKEN = process.env.VERCEL_TOKEN
const PROJECT = process.env.VERCEL_PROJECT
const TEAM_ID = process.env.VERCEL_TEAM_ID
const CONFIRMED = process.env.CONFIRM_DELETE === '1'

if (!TOKEN || !PROJECT) {
  console.log('\n  Skipped — VERCEL_TOKEN or VERCEL_PROJECT not set. See vercel-deployments-dry-run.mjs\'s own header.\n')
  process.exit(0)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function deleteOne(id) {
  const url = new URL(`https://api.vercel.com/v13/deployments/${id}`)
  if (TEAM_ID) url.searchParams.set('teamId', TEAM_ID)
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } })
  if (res.ok) return { ok: true }
  const body = await res.text().catch(() => '')
  return { ok: false, status: res.status, body }
}

try {
  const deployments = await fetchAllDeployments(TOKEN, PROJECT, TEAM_ID)
  const { production, preview } = splitByProductionSafety(deployments)

  console.log(`\n  ${deployments.length} total deployments — ${production.length} production (never touched), ${preview.length} preview/branch.\n`)

  if (!CONFIRMED) {
    console.log(`  This is still a dry run — CONFIRM_DELETE=1 is not set.`)
    console.log(`  Running with it set would DELETE all ${preview.length} preview/branch deployments listed above.`)
    console.log('  This cannot be undone. Nothing was deleted.\n')
    process.exit(0)
  }

  console.log(`  CONFIRM_DELETE=1 — deleting ${preview.length} preview/branch deployments now.\n`)

  let deleted = 0
  const failures = []

  for (const d of preview) {
    const result = await deleteOne(d.uid)
    if (result.ok) {
      deleted++
      console.log(`  ✓ deleted  ${d.uid}  ${d.url}`)
    } else {
      failures.push({ id: d.uid, url: d.url, status: result.status, body: result.body })
      console.log(`  ✗ failed   ${d.uid}  ${d.url}  (${result.status})`)
    }
    // A small gap between requests — Vercel's API is rate-limited, and a
    // few hundred deletes back-to-back with no pause is exactly the shape
    // that trips one.
    await sleep(150)
  }

  console.log(`\n  Done — ${deleted} deleted, ${failures.length} failed, ${production.length} production deployments left untouched.\n`)
  if (failures.length) {
    console.log('  Failures:')
    for (const f of failures) console.log(`    ${f.id}  ${f.url}  (${f.status}): ${f.body}`)
    console.log()
  }
} catch (err) {
  console.log(`\n  ✗ ${err.message}\n`)
  process.exit(1)
}
