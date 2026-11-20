import { revalidateTag } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit } from '@/lib/rateLimit'
import { TAGS } from '@/lib/cacheTags'
import { recordActivity, removeVisitorConfirmation } from '@/lib/activityStore'
import { readUndo, signUndo } from '@/lib/confirmUndo'

// POST /api/resource/:id/confirm   body: { section? }
// Records that a visitor verified the community-curated info is still accurate.
// With a section ("womenTevillah"), just that section's hours (Oct 6), in
// details.sectionConfirmed.
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

/** A section, by its yes/no field's key ("womenTevillah"): a mikvah's
 *  women's, men's or keilim hours, each confirmed on its own (Oct 6;
 *  confirm_section checks it's really one of the listing's). Undefined when
 *  none was sent; null when what was sent can't be one. */
async function sectionOf(request: Request): Promise<string | null | undefined> {
  const body = (await request
    .clone()
    .json()
    .catch(() => ({}))) as { section?: unknown }
  if (body.section === undefined) return undefined
  return typeof body.section === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(body.section) ? body.section : null
}

/** The listing's (or box's) date as it stands, read just before a Yes, so
 *  the undo can put it back (src/lib/confirmUndo.ts). Read outside the
 *  RPC's lock, and that's safe: anything that moves the date in between
 *  moves it to about now, so the RPC then sees it inside the cooldown and
 *  changes nothing, and no undo is offered for a Yes that didn't land. */
async function dateBefore(id: string, section: string | undefined): Promise<string | null> {
  const { data } = await getAdminClient().from('resource').select('details').eq('id', id).maybeSingle()
  const details = (data as { details?: Record<string, unknown> | null } | null)?.details ?? {}
  const v = section ? (details.sectionConfirmed as Record<string, unknown> | undefined)?.[section] : details.confirmedAt
  return typeof v === 'string' ? v : null
}

export async function POST(request: Request, ctx: RouteContext<'/api/resource/[id]/confirm'>) {
  const limited = await enforceRateLimit(request, 'confirm', { limit: 20, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  const section = await sectionOf(request)
  if (section === null) return Response.json({ ok: false, error: 'Invalid section.' }, { status: 400 })

  const now = new Date().toISOString()
  const prev = await dateBefore(id, section)
  const { data, error } = section
    ? await getAdminClient().rpc('confirm_section', { p_id: id, p_section: section, p_now: now, p_cooldown_seconds: COOLDOWN_SECONDS })
    : await getAdminClient().rpc('confirm_resource', { p_id: id, p_now: now, p_cooldown_seconds: COOLDOWN_SECONDS })
  if (error) {
    console.error('[confirm] rpc failed:', error)
    return Response.json({ ok: false, error: 'Could not save confirmation.' }, { status: 502 })
  }
  const row = ((data ?? []) as RpcRow[])[0]
  if (!row) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })

  let activityId: number | null = null
  if (row.out_changed) {
    ;[activityId = null] = await recordActivity([
      { community: row.out_community, resourceId: id, kind: 'listing_confirmed', source: 'visitor', ...(section ? { fieldKey: section } : {}) },
    ])
    // Same cached listApprovedResources() every category page reads through —
    // without this, the confirmation the visitor just made wouldn't show for
    // the next visitor until the cache's own lifetime elapsed.
    revalidateTag(TAGS.resources(row.out_community), 'max')
  }
  const undo = row.out_changed && row.out_confirmed_at ? signUndo({ id, section: section ?? null, at: row.out_confirmed_at, prev }) : null
  return Response.json({ ok: true, confirmedAt: row.out_confirmed_at, changed: row.out_changed, activityId, undo })
}

// DELETE /api/resource/:id/confirm   body: { undo, activityId?, section? }
// Undoes a Yes made by mistake, putting back the date the listing had before
// it (or none). `undo` is the signed note the POST handed this browser
// (src/lib/confirmUndo.ts): the date to restore comes from the note, which
// the server wrote, never from the browser. Until Nov 20 the browser sent
// that date itself, so anyone could backdate or wipe any listing's check.
// The undo also happens only if the listing still carries the date this Yes
// set, so it can't erase someone else's confirmation made in between.
export async function DELETE(request: Request, ctx: RouteContext<'/api/resource/[id]/confirm'>) {
  const limited = await enforceRateLimit(request, 'confirm', { limit: 20, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  const section = await sectionOf(request)
  if (section === null) return Response.json({ ok: false, error: 'Invalid section.' }, { status: 400 })
  const body = (await request.json().catch(() => ({}))) as { undo?: unknown; activityId?: unknown }

  const note = readUndo(body.undo, id, section ?? null)
  if (!note) return Response.json({ ok: false, error: 'This can no longer be undone.' }, { status: 400 })
  const expected = note.at
  const previous = note.prev

  const { data, error } = section
    ? await getAdminClient().rpc('unconfirm_section', { p_id: id, p_section: section, p_expected: expected, p_previous: previous })
    : await getAdminClient().rpc('unconfirm_resource', { p_id: id, p_expected: expected, p_previous: previous })
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
