import { revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { TAGS } from '@/lib/cacheTags'
import { recordActivity, removeVisitorActivity } from '@/lib/activityStore'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { ui } from '@/lib/uiConfig'
import { resolveCapabilities } from '@/lib/categories'
import { getResourceById } from '@/lib/resourceStore'
import { getCategoryById } from '@/lib/categoryStore'
import { submitListingUpdate } from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { removalSubmission } from '@/lib/itemMarks'
import { isIso, parseItemTap, UUID, type MarkRow } from '@/lib/itemMarkRoutes'

// POST /api/resource/:id/item/gone   { field, item, turnstileToken, company }
// "Not anymore": a visitor says this one item isn't there (agreed Oct 1).
// Two things happen (decided Sep 25):
//   - at once, a warning on the item: "Reported gone today · we'll check
//     before taking it off" (details.itemGone, by mark_item, migration 064)
//   - the removal itself goes to the moderation queue, as an ordinary edit
//     suggestion taking that one item off. Approving it takes the item off;
//     rejecting it keeps the item and clears the warning.
// An item already reported and waiting on an admin isn't filed again.
//
// It files a submission, so it's held to what the submissions route holds
// edits to: the bot check, its rate limit, and the community's and the
// category's "edits allowed".

const FAILED = { ok: false, error: 'That didn’t send. Please try again.' }

export async function POST(request: Request, ctx: RouteContext<'/api/resource/[id]/item/gone'>) {
  const limited = await enforceRateLimit(request, 'submissions', { limit: 10, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  // Bot trap: accepted and ignored, so the bot can't tell.
  if (body && isHoneypotTripped(body)) return Response.json({ ok: true, changed: false })
  const tap = parseItemTap(body)
  if (!tap || !body) return Response.json({ ok: false, error: 'Which item?' }, { status: 400 })
  if (!(await verifyTurnstile(typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined, clientIp(request)))) {
    return Response.json({ ok: false, code: 'turnstile', error: 'Verification failed. Please try again.' }, { status: 403 })
  }
  if (!ui.contributions.edit) return Response.json({ ok: false, error: 'This action is not available.' }, { status: 403 })

  const admin = getAdminClient()
  const { data, error } = await admin.rpc('mark_item', {
    p_id: id,
    p_field: tap.field,
    p_item: tap.item,
    p_kind: 'gone',
    p_now: new Date().toISOString(),
  })
  if (error) {
    console.error('[item/gone] mark_item failed:', error)
    return Response.json(FAILED, { status: 502 })
  }
  const row = ((data ?? []) as MarkRow[])[0]
  if (!row) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  if (!row.out_changed) {
    // Someone said so already; it's with an admin.
    return Response.json({ ok: true, item: row.out_label, goneAt: row.out_at, changed: false })
  }

  // The warning is up; now the removal. If it can't be filed, the warning
  // comes back down: a warning nobody will ever review would stay forever.
  const undoMark = () =>
    admin.rpc('unmark_item', {
      p_id: id,
      p_field: tap.field,
      p_label: row.out_label,
      p_kind: 'gone',
      p_expected: row.out_at,
      p_previous: null,
      p_restore_gone: null,
    })
  let submissionId: string
  try {
    const listing = await getResourceById(id, row.out_community)
    const category = listing ? await getCategoryById(row.out_community, listing.category) : null
    if (!listing || !category) throw new Error('listing or category not found')
    if (!resolveCapabilities(category.capabilities).edit) {
      await undoMark()
      return Response.json({ ok: false, error: 'This action is not available for this category.' }, { status: 403 })
    }
    const submission = await submitListingUpdate(
      row.out_community,
      id,
      removalSubmission(category, listing, tap.field, row.out_label),
      `Tapped “Not anymore” on the listing: ${row.out_label} isn’t there.`,
      null,
    )
    submissionId = submission.id
    after(() => sendSubmissionNotification(submission).catch((err) => console.error('[item/gone] Admin notification failed:', err)))
  } catch (err) {
    console.error('[item/gone] could not file the removal:', err)
    await undoMark()
    return Response.json(FAILED, { status: 502 })
  }

  const [activityId = null] = await recordActivity([
    { community: row.out_community, resourceId: id, kind: 'item_reported_gone', source: 'visitor', fieldKey: tap.field, item: row.out_label },
  ])
  revalidateTag(TAGS.resources(row.out_community), 'max')
  return Response.json({ ok: true, item: row.out_label, goneAt: row.out_at, changed: true, submissionId, activityId })
}

// DELETE /api/resource/:id/item/gone   { field, item, goneAt, submissionId, activityId? }
// Undoes this browser's own "Not anymore", within the hour: the warning
// comes down (only while it's still the one this browser put up) and the
// removal leaves the queue (only while it's pending, and only that one).
// The submission's id is a random UUID that only the reporter was given.
const UNDO_WITHIN_MS = 60 * 60 * 1000

export async function DELETE(request: Request, ctx: RouteContext<'/api/resource/[id]/item/gone'>) {
  const limited = await enforceRateLimit(request, 'confirm', { limit: 20, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const tap = parseItemTap(body)
  if (!tap || !body) return Response.json({ ok: false, error: 'Which item?' }, { status: 400 })
  const { goneAt, submissionId } = body
  if (!isIso(goneAt) || typeof submissionId !== 'string' || !UUID.test(submissionId)) {
    return Response.json({ ok: false, error: 'Which report?' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: removed, error: delErr } = await admin
    .from('submission')
    .delete()
    .eq('id', submissionId)
    .eq('target_id', id)
    .eq('status', 'pending')
    .eq('operation', 'update')
    .gte('created_at', new Date(Date.now() - UNDO_WITHIN_MS).toISOString())
    .select('id')
  if (delErr) {
    console.error('[item/gone] could not withdraw the removal:', delErr)
    return Response.json({ ok: false, error: 'Could not undo that.' }, { status: 502 })
  }
  // Already reviewed (or too late): the admin's decision stands.
  if (!removed || removed.length === 0) return Response.json({ ok: true, changed: false })

  const { data, error } = await admin.rpc('unmark_item', {
    p_id: id,
    p_field: tap.field,
    p_label: tap.item,
    p_kind: 'gone',
    p_expected: goneAt,
    p_previous: null,
    p_restore_gone: null,
  })
  if (error) console.error('[item/gone] unmark_item failed:', error)
  const row = ((data ?? []) as { out_community: string; out_changed: boolean }[])[0]
  if (typeof body.activityId === 'number' && Number.isSafeInteger(body.activityId)) {
    await removeVisitorActivity(body.activityId, id, 'item_reported_gone')
  }
  if (row?.out_changed) revalidateTag(TAGS.resources(row.out_community), 'max')
  return Response.json({ ok: true, changed: true })
}
