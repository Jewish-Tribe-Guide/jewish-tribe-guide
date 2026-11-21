import { reportServerError } from '@/lib/serverError'
import { revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit } from '@/lib/rateLimit'
import { TAGS } from '@/lib/cacheTags'
import { recordActivity, removeVisitorActivity } from '@/lib/activityStore'
import { resolveCapabilities } from '@/lib/categories'
import { getResourceById } from '@/lib/resourceStore'
import { getCategoryById } from '@/lib/categoryStore'
import { submitListingUpdate } from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { removalSubmission } from '@/lib/itemMarks'
import { goneReportWaiting, isIso, ownRemovalWaiting, parseItemTap, UUID, withdrawPending, type MarkRow } from '@/lib/itemMarkRoutes'
import { editableCommunity, failsBotCheck, openListingWrite } from '@/lib/listingWrite'

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
  // Bot trap: accepted and ignored, so the bot can't tell.
  const opened = await openListingWrite(request, ctx, { ok: true, changed: false })
  if (opened instanceof Response) return opened
  const { id, body } = opened
  const tap = parseItemTap(body)
  if (!tap || !body) return Response.json({ ok: false, error: 'Which item?' }, { status: 400 })
  const bot = await failsBotCheck(request, body)
  if (bot) return bot
  // Before the warning goes up: a community that takes no edits gets none.
  try {
    const community = await editableCommunity(id)
    if (community instanceof Response) return community
  } catch (err) {
    reportServerError('[item/gone] could not read the listing:', err)
    return Response.json(FAILED, { status: 502 })
  }

  const admin = getAdminClient()
  const { data, error } = await admin.rpc('mark_item', {
    p_id: id,
    p_field: tap.field,
    p_item: tap.item,
    p_kind: 'gone',
    p_now: new Date().toISOString(),
  })
  if (error) {
    reportServerError('[item/gone] mark_item failed:', error)
    return Response.json(FAILED, { status: 502 })
  }
  const row = ((data ?? []) as MarkRow[])[0]
  if (!row) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  if (!row.out_changed) {
    // Someone said so already; it's with an admin. Unless nothing waits for
    // one: a warning left up when filing it failed (Nov 21, the save
    // survey). Then this files it, and the warning is reviewed after all.
    let waiting = true
    try {
      waiting = await goneReportWaiting(id, tap.field, row.out_label)
    } catch (err) {
      reportServerError('[item/gone] could not read the queue:', err)
    }
    if (waiting) return Response.json({ ok: true, item: row.out_label, goneAt: row.out_at, changed: false })
  }

  // The warning is up; now the removal. If it can't be filed, the warning
  // comes back down: a warning nobody will ever review would stay forever.
  // If it can't come down either, Sentry hears: the next "Not anymore" on
  // the item files the removal (above).
  const undoMark = async () => {
    const { error: undoErr } = await admin.rpc('unmark_item', {
      p_id: id,
      p_field: tap.field,
      p_label: row.out_label,
      p_kind: 'gone',
      p_expected: row.out_at,
      p_previous: null,
      p_restore_gone: null,
    })
    if (undoErr) reportServerError(`[item/gone] a warning on ${id} (${row.out_label}) is up with nothing in the queue:`, undoErr)
  }
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
    after(() => sendSubmissionNotification(submission).catch((err) => reportServerError('[item/gone] Admin notification failed:', err)))
  } catch (err) {
    reportServerError('[item/gone] could not file the removal:', err)
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

  // The warning comes down before the removal leaves the queue (Nov 21,
  // the save survey). The other way, a warning that failed to come down
  // stayed up with nothing in the queue, and trying again found the
  // removal gone and changed nothing. Now a failure here changes nothing
  // and Undo can be tried again; one at the withdrawal leaves a removal
  // with no warning, which an admin still sees and decides.
  let waiting: boolean
  try {
    waiting = await ownRemovalWaiting(submissionId, id)
  } catch (err) {
    reportServerError('[item/gone] could not read the removal:', err)
    return Response.json({ ok: false, error: 'Could not undo that.' }, { status: 502 })
  }
  // Already reviewed (or too late): the admin's decision stands.
  if (!waiting) return Response.json({ ok: true, changed: false })

  const admin = getAdminClient()
  const { data, error } = await admin.rpc('unmark_item', {
    p_id: id,
    p_field: tap.field,
    p_label: tap.item,
    p_kind: 'gone',
    p_expected: goneAt,
    p_previous: null,
    p_restore_gone: null,
  })
  if (error) {
    reportServerError('[item/gone] unmark_item failed:', error)
    return Response.json({ ok: false, error: 'Could not undo that.' }, { status: 502 })
  }
  try {
    await withdrawPending(submissionId, id)
  } catch (err) {
    reportServerError('[item/gone] the warning is down, but the removal stays in the queue:', err)
  }
  const row = ((data ?? []) as { out_community: string; out_changed: boolean }[])[0]
  if (typeof body.activityId === 'number' && Number.isSafeInteger(body.activityId)) {
    await removeVisitorActivity(body.activityId, id, 'item_reported_gone')
  }
  if (row?.out_changed) revalidateTag(TAGS.resources(row.out_community), 'max')
  return Response.json({ ok: true, changed: true })
}
