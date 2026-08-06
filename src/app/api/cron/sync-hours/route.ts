// GET|POST /api/cron/sync-hours
//
// Refreshes hours / phone / business status from Google Places for every listing
// that has a `details.placeId` (assigned by scripts/backfill-place-ids.mjs).
// This is the hosted equivalent of scripts/sync-google-hours.mjs — point any
// scheduler at it.
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
import { fetchPlaceSync, nextGoogleFields, syncMayWrite, type OwnableSyncField } from '@/lib/googlePlaces'
import { submitGoogleClosure } from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'

// Does network + DB work; never prerender or cache it.
export const dynamic = 'force-dynamic'

type SyncedRow = {
  id: string
  phone: string | null
  address: string | null
  details: Record<string, unknown>
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
    .select('id,phone,address,details')
    .eq('status', 'approved')
    .not('details->>placeId', 'is', null)
    // Cap the number of paid Google Place Details calls a single run can make.
    .limit(maxRecords())

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as SyncedRow[]
  let synced = 0
  let failed = 0
  let flaggedClosed = 0

  for (const row of rows) {
    const placeId = String(row.details.placeId)
    const sync = await fetchPlaceSync(placeId)
    if (!sync) {
      failed++
      continue
    }

    const details: Record<string, unknown> = {
      ...row.details,
      googleSyncedAt: new Date().toISOString(),
    }
    // Google-only concepts with no curated counterpart — always refreshed.
    if (sync.businessStatus) details.businessStatus = sync.businessStatus
    if (sync.description && !details.googleDescription) details.googleDescription = sync.description

    // Everything else is written only where Google owns the field: one it
    // filled itself, or one still empty. See syncMayWrite in googlePlaces.ts.
    const wrote: OwnableSyncField[] = []
    const update: { details: Record<string, unknown>; phone?: string; address?: string } = { details }

    if (sync.hours && syncMayWrite(row.details, 'hours', row.details?.hours)) {
      details.hours = sync.hours
      wrote.push('hours')
    }
    if (sync.phone && syncMayWrite(row.details, 'phone', row.phone)) {
      update.phone = sync.phone
      wrote.push('phone')
    }
    // Filling an address also keeps `geo` honest, so it stays gated on being
    // empty the same way it always was — now via the shared ownership rule.
    if (sync.address && syncMayWrite(row.details, 'address', row.address)) {
      update.address = sync.address
      wrote.push('address')
    }

    details.googleFields = nextGoogleFields(row.details, wrote)

    await supabase.from('resource').update(update).eq('id', row.id)
    synced++

    // Route permanent closures through the moderation queue so an admin can
    // review and approve before the listing is removed from the public directory.
    if (sync.businessStatus === 'CLOSED_PERMANENTLY') {
      try {
        const submission = await submitGoogleClosure(row.id)
        if (submission) {
          flaggedClosed++
          await sendSubmissionNotification(submission).catch(() => {})
        }
      } catch (err) {
        console.error(`[sync-hours] submitGoogleClosure failed for ${row.id}:`, err)
      }
    }
  }

  return NextResponse.json({ ok: true, total: rows.length, synced, failed, flaggedClosed })
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runSync()
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runSync()
}
