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
import { fetchPlaceSync } from '@/lib/googlePlaces'

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
  if (!secret) return true // unset → open (dev only; set it in production)
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return bearer === secret || req.headers.get('x-cron-secret') === secret
}

async function runSync(): Promise<NextResponse> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('resource')
    .select('id,phone,address,details')
    .eq('status', 'approved')
    .not('details->>placeId', 'is', null)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as SyncedRow[]
  let synced = 0
  let failed = 0

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
    if (sync.hours) details.hours = sync.hours
    if (sync.businessStatus) details.businessStatus = sync.businessStatus

    const update: { details: Record<string, unknown>; phone?: string; address?: string } = { details }
    if (sync.phone) update.phone = sync.phone
    // Only fill a missing address — never overwrite a curated one (keeps `geo` in sync).
    if (!row.address && sync.address) update.address = sync.address

    await supabase.from('resource').update(update).eq('id', row.id)
    synced++
  }

  return NextResponse.json({ ok: true, total: rows.length, synced, failed })
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runSync()
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runSync()
}
