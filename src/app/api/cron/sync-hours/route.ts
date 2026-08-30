// GET|POST /api/cron/sync-hours
//
// Refreshes hours / phone / website / business status from Google Places for
// every listing that has a `details.placeId` (assigned by
// scripts/backfill-place-ids.mjs). This is the hosted equivalent of
// scripts/sync-google-hours.mjs — point any scheduler at it.
//
// Host-agnostic scheduling: protect the route with a CRON_SECRET and have your
// scheduler send it. Works from anything that can make an HTTP request —
// GitHub Actions, a server crontab, cron-job.org, a Vercel cron, etc. Example:
//
//   # weekly, from a crontab:
//   0 6 * * 1  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                https://your-domain.com/api/cron/sync-hours
//
// Auth: if CRON_SECRET is set, the request must send it as either
// `Authorization: Bearer <secret>` or `x-cron-secret: <secret>` (a 401 otherwise).
// If CRON_SECRET is unset, the route runs unauthenticated — fine for local dev,
// but set it in production so the endpoint can't be triggered by anyone.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendStatusChangeDigest, type StatusChange } from '@/lib/email'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { syncOneListing, type SyncedRow } from '@/lib/syncListing'

// Does network + DB work, so it's never prerendered or cached — that follows
// from the work itself now rather than from a `dynamic` export, which Cache
// Components rejects.


// Best-effort ping to a dead-man's-switch monitor (e.g. healthchecks.io) so a
// silently broken sync — Google API key revoked, quota exhausted, an
// unhandled exception — shows up as a missed check-in instead of just stale
// hours nobody notices. `/fail` is the convention healthchecks.io (and
// compatible services) use for an explicit failure ping vs. a plain success
// ping. A monitor outage must never fail the actual sync, hence the swallow.
async function pingHealthcheck(ok: boolean): Promise<void> {
  const base = process.env.CRON_HEALTHCHECK_URL
  if (!base) return
  try {
    await fetch(ok ? base : `${base}/fail`, { method: 'GET' })
  } catch {
    // Best-effort.
  }
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // No secret configured. Open in dev for convenience, but FAIL CLOSED in
    // production: an unauthenticated endpoint that fans out to paid Google
    // Places calls per listing is a billing-runaway risk if anyone finds the
    // URL. Set CRON_SECRET in the production environment (e.g. Vercel env vars)
    // so the route — and Vercel's own cron — can authenticate.
    return process.env.NODE_ENV !== 'production'
  }
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return bearer === secret || req.headers.get('x-cron-secret') === secret
}

// Safety ceiling: the largest number of listings one sync run will touch, i.e.
// the max paid Google Place Details calls per invocation. Bounds the cost of any
// single run regardless of directory size or how often the route is triggered.
// Override with SYNC_MAX_RECORDS; defaults to 500.
function maxRecords(): number {
  const n = Number(process.env.SYNC_MAX_RECORDS)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 500
}

async function runSync(): Promise<NextResponse> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('resource')
    .select('id,name,phone,address,details,category,community_id')
    .eq('status', 'approved')
    .not('details->>placeId', 'is', null)
    // Cap the number of paid Google Place Details calls a single run can make.
    .limit(maxRecords())

  if (error) {
    await pingHealthcheck(false)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as SyncedRow[]
  let synced = 0
  let failed = 0
  let flaggedClosed = 0
  const statusChanges: StatusChange[] = []

  for (const row of rows) {
    const result = await syncOneListing(row)
    if (result.outcome === 'failed') {
      failed++
      continue
    }
    synced++
    if (result.statusChange) statusChanges.push(result.statusChange)
    if (result.flaggedClosed) flaggedClosed++
  }

  // Resources are served through the same cached listApprovedResources()
  // every category page uses (cacheLife('hours')) — without this, a synced
  // hours/phone/closure change would sit invisible to visitors for up to an
  // hour after the very sync meant to keep it current.
  if (synced > 0) await revalidatePublicContent()

  // One digest for the whole run, closures and reopenings alike. Never fails
  // the sync: the listings are already updated by this point, and an email
  // provider hiccup must not turn a successful sync into a failed cron.
  await sendStatusChangeDigest(statusChanges).catch((err) =>
    console.error('[sync-hours] status digest failed:', err),
  )

  await pingHealthcheck(true)
  return NextResponse.json({
    ok: true,
    total: rows.length,
    synced,
    failed,
    flaggedClosed,
    statusChanged: statusChanges.length,
  })
}

// Catches anything runSync itself doesn't (a thrown error, not just its own
// { ok: false } responses) so an unhandled exception still registers as a
// failed check-in instead of just vanishing.
async function runSyncGuarded(): Promise<NextResponse> {
  try {
    return await runSync()
  } catch (err) {
    await pingHealthcheck(false)
    throw err
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runSyncGuarded()
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runSyncGuarded()
}
