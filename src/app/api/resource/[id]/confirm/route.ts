import { revalidateTag } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit } from '@/lib/rateLimit'
import { TAGS } from '@/lib/cacheTags'
import { recordActivity, removeVisitorConfirmation } from '@/lib/activityStore'

// POST /api/resource/:id/confirm
// Records that a visitor verified the community-curated info is still accurate.
// Writes confirmedAt into details (same pattern as googleSyncedAt) — no separate
// column needed, surfaces automatically via the normalizeRow spread.
//
// Public and one-tap, so it's built to be leaned on:
//   - The write is one key under a row lock (confirm_resource), not a
//     read-modify-write of the whole details object that could undo an
//     approval or another confirmation landing at the same moment.
//   - Only a live listing can be confirmed.
//   - A repeat within ten minutes is a no-op. A script looping on the button
//     can't keep a listing looking fresh, and can't make the site refetch.
//   - Only that community's listings are thrown out of the cache, and only
//     when something changed — not every tag of every community per tap.
// No Turnstile, deliberately: e2e/budgets.spec.ts holds that browsing never
// loads it, and a one-tap confirmation can't wait on a challenge.

const COOLDOWN_SECONDS = 600
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RpcRow = { out_community: string; out_confirmed_at: string | null; out_changed: boolean }

function isIso(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v))
}

export async function POST(request: Request, ctx: RouteContext<'/api/resource/[id]/confirm'>) {
  const limited = await enforceRateLimit(request, 'confirm', { limit: 20, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })

  const { data, error } = await getAdminClient().rpc('confirm_resource', {
    p_id: id,
    p_now: new Date().toISOString(),
    p_cooldown_seconds: COOLDOWN_SECONDS,
  })
  if (error) {
    console.error('[confirm] rpc failed:', error)
    return Response.json({ ok: false, error: 'Could not save confirmation.' }, { status: 502 })
  }
  const row = ((data ?? []) as RpcRow[])[0]
  if (!row) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })

  let activityId: number | null = null
  if (row.out_changed) {
    ;[activityId = null] = await recordActivity([
      { community: row.out_community, resourceId: id, kind: 'listing_confirmed', source: 'visitor' },
    ])
    // Same cached listApprovedResources() every category page reads through —
    // without this, the confirmation the visitor just made wouldn't show for
    // the next visitor until the cache's own lifetime elapsed.
    revalidateTag(TAGS.resources(row.out_community), 'max')
  }
  return Response.json({ ok: true, confirmedAt: row.out_confirmed_at, changed: row.out_changed, activityId })
}

// DELETE /api/resource/:id/confirm
// Undoes a confirmation made by mistake, restoring whatever confirmedAt (or
// none) was in place before it — body: { previousConfirmedAt?, confirmedAt?,
// activityId? }. `confirmedAt` is the stamp this browser was given; when it's
// sent, the undo only happens if the listing still carries it, so undoing
// can't erase someone else's confirmation made in between. (A page loaded
// before this existed doesn't send it, and gets the old behaviour.)
export async function DELETE(request: Request, ctx: RouteContext<'/api/resource/[id]/confirm'>) {
  const limited = await enforceRateLimit(request, 'confirm', { limit: 20, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as {
    previousConfirmedAt?: unknown
    confirmedAt?: unknown
    activityId?: unknown
  }

  // Public and unauthenticated, so these values are untrusted: they are
  // written straight into the listing's details and shown to every visitor.
  // The client only ever sends back timestamps this route issued, so anything
  // that isn't a real ISO date is refused rather than stored.
  const previous = body.previousConfirmedAt
  if (previous !== undefined && previous !== null && !isIso(previous)) {
    return Response.json({ ok: false, error: 'Invalid previous confirmation.' }, { status: 400 })
  }
  const expected = body.confirmedAt
  if (expected !== undefined && expected !== null && !isIso(expected)) {
    return Response.json({ ok: false, error: 'Invalid confirmation.' }, { status: 400 })
  }

  const { data, error } = await getAdminClient().rpc('unconfirm_resource', {
    p_id: id,
    p_expected: expected ?? null,
    p_previous: previous ?? null,
  })
  if (error) {
    console.error('[confirm] undo rpc failed:', error)
    return Response.json({ ok: false, error: 'Could not undo confirmation.' }, { status: 502 })
  }
  const row = ((data ?? []) as RpcRow[])[0]
  if (!row) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })

  if (row.out_changed) {
    if (typeof body.activityId === 'number' && Number.isSafeInteger(body.activityId)) {
      await removeVisitorConfirmation(body.activityId, id)
    }
    revalidateTag(TAGS.resources(row.out_community), 'max')
  }
  return Response.json({ ok: true, confirmedAt: row.out_confirmed_at ?? null, changed: row.out_changed })
}
