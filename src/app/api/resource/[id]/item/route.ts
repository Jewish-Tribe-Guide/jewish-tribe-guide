import { revalidateTag } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit } from '@/lib/rateLimit'
import { TAGS } from '@/lib/cacheTags'
import { recordActivity, removeVisitorActivity } from '@/lib/activityStore'
import { isIso, ITEM_COOLDOWN_SECONDS, parseItemTap, UUID, type MarkRow } from '@/lib/itemMarkRoutes'

// POST /api/resource/:id/item   { field, item }
// "Still here": a visitor saw this one item on the shelf (agreed Oct 1).
// The item's date becomes now, at once, with no review (decided Sep 25),
// and a "reported gone" on it goes: someone has seen it since.
//
// Mark as current's rules (see ../confirm/route.ts), for the same reasons:
// one key under a row lock (mark_item, migration 064), only a live listing,
// only an item it lists in one of its category's item lists, a repeat
// within ten minutes changes nothing, the same rate limit, no bot check.

export async function POST(request: Request, ctx: RouteContext<'/api/resource/[id]/item'>) {
  const limited = await enforceRateLimit(request, 'confirm', { limit: 20, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  const tap = parseItemTap(await request.json().catch(() => null))
  if (!tap) return Response.json({ ok: false, error: 'Which item?' }, { status: 400 })

  const { data, error } = await getAdminClient().rpc('mark_item', {
    p_id: id,
    p_field: tap.field,
    p_item: tap.item,
    p_kind: 'seen',
    p_now: new Date().toISOString(),
    p_cooldown_seconds: ITEM_COOLDOWN_SECONDS,
  })
  if (error) {
    console.error('[item] mark_item failed:', error)
    return Response.json({ ok: false, error: 'Could not save that.' }, { status: 502 })
  }
  const row = ((data ?? []) as MarkRow[])[0]
  if (!row) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })

  let activityId: number | null = null
  if (row.out_changed) {
    ;[activityId = null] = await recordActivity([
      { community: row.out_community, resourceId: id, kind: 'item_confirmed', source: 'visitor', fieldKey: tap.field, item: row.out_label },
    ])
    revalidateTag(TAGS.resources(row.out_community), 'max')
  }
  return Response.json({
    ok: true,
    item: row.out_label,
    seenAt: row.out_at,
    previous: row.out_previous,
    clearedGone: row.out_cleared_gone,
    changed: row.out_changed,
    activityId,
  })
}

// DELETE /api/resource/:id/item   { field, item, seenAt, previous?, clearedGone?, activityId? }
// Undoes this browser's own "Still here": only while the item still carries
// the date it was given (`seenAt`), so it can't erase someone else's since.
// The date before it goes back, and a "reported gone" it cleared returns.
export async function DELETE(request: Request, ctx: RouteContext<'/api/resource/[id]/item'>) {
  const limited = await enforceRateLimit(request, 'confirm', { limit: 20, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const tap = parseItemTap(body)
  if (!tap || !body) return Response.json({ ok: false, error: 'Which item?' }, { status: 400 })

  // Untrusted, and written straight back onto the listing: only real dates,
  // and never one later than the date being undone.
  const { seenAt, previous = null, clearedGone = null } = body
  if (!isIso(seenAt)) return Response.json({ ok: false, error: 'Invalid date.' }, { status: 400 })
  for (const v of [previous, clearedGone]) {
    if (v !== null && (!isIso(v) || Date.parse(v) > Date.parse(seenAt))) {
      return Response.json({ ok: false, error: 'Invalid date.' }, { status: 400 })
    }
  }

  const { data, error } = await getAdminClient().rpc('unmark_item', {
    p_id: id,
    p_field: tap.field,
    p_label: tap.item,
    p_kind: 'seen',
    p_expected: seenAt,
    p_previous: previous,
    p_restore_gone: clearedGone,
  })
  if (error) {
    console.error('[item] unmark_item failed:', error)
    return Response.json({ ok: false, error: 'Could not undo that.' }, { status: 502 })
  }
  const row = ((data ?? []) as { out_community: string; out_changed: boolean }[])[0]
  if (!row) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })

  if (row.out_changed) {
    if (typeof body.activityId === 'number' && Number.isSafeInteger(body.activityId)) {
      await removeVisitorActivity(body.activityId, id, 'item_confirmed')
    }
    revalidateTag(TAGS.resources(row.out_community), 'max')
  }
  return Response.json({ ok: true, changed: row.out_changed })
}
