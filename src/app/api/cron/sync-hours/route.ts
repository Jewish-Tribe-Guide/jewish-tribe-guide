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
import { fetchPlaceSync, nextGoogleFields, syncMayWrite, type OwnableSyncField } from '@/lib/googlePlaces'
import { submitGoogleClosure } from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { listCategories } from '@/lib/categoryStore'
import type { CategoryConfig } from '@/lib/categories'

// Does network + DB work, so it's never prerendered or cached — that follows
// from the work itself now rather than from a `dynamic` export, which Cache
// Components rejects.

type SyncedRow = {
  id: string
  name: string
  phone: string | null
  address: string | null
  details: Record<string, unknown>
  category: string
  community_id: string
}

// The category's Website field key, matched by label — same convention
// ListingForm.tsx's intake autofill uses, since categories predate a fixed
// key convention for this field. Cached per community so a run with many
// listings across few categories doesn't refetch the same category list once
// per row.
const categoriesCache = new Map<string, Promise<CategoryConfig[]>>()

async function websiteFieldKey(communityId: string, categoryId: string): Promise<string | undefined> {
  let categories = categoriesCache.get(communityId)
  if (!categories) {
    categories = listCategories(communityId)
    categoriesCache.set(communityId, categories)
  }
  const category = (await categories).find((c) => c.id === categoryId)
  return category?.detailFields.find((f) => f.type === 'url' && f.label.trim().toLowerCase() === 'website')?.key
}

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
    const update: {
      details: Record<string, unknown>
      name?: string
      phone?: string
      address?: string
    } = { details }

    if (sync.name && syncMayWrite(row.details, 'name', row.name)) {
      update.name = sync.name
      wrote.push('name')
    }
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
    // Website lives in `details` under a category-specific key (matched by
    // label, not a fixed key) rather than its own resource column — see
    // websiteFieldKey above.
    const websiteKey = await websiteFieldKey(row.community_id, row.category)
    if (sync.website && websiteKey && syncMayWrite(row.details, 'website', row.details?.[websiteKey])) {
      details[websiteKey] = sync.website
      wrote.push('website')
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

  // Resources are served through the same cached listApprovedResources()
  // every category page uses (cacheLife('hours')) — without this, a synced
  // hours/phone/closure change would sit invisible to visitors for up to an
  // hour after the very sync meant to keep it current.
  if (synced > 0) await revalidatePublicContent()

  await pingHealthcheck(true)
  return NextResponse.json({ ok: true, total: rows.length, synced, failed, flaggedClosed })
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
