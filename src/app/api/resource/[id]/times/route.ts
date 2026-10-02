import { after } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { ui } from '@/lib/uiConfig'
import { resolveCapabilities } from '@/lib/categories'
import { getResourceById } from '@/lib/resourceStore'
import { getCategoryById } from '@/lib/categoryStore'
import { submitListingUpdate } from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { editSubmission } from '@/lib/editSubmission'
import { readSchedules, regularMinyanim, schedulesKey } from '@/lib/schedules'
import { applyUpdate, changesAnything, cleanUpdate } from '@/lib/scheduleUpdate'
import { UUID } from '@/lib/itemMarkRoutes'

// POST /api/resource/:id/times   { update, source?, sourceUrl?, turnstileToken, company }
// "Update their times" on a shul's card (agreed Oct 1): the result the
// person saw and sent (scheduleUpdate.ts), filed as an edit suggestion for
// an admin to check, like "+ Add an item". The listing is read here and
// the edit built from it, never from the browser: what the result says
// about the shul's own minyanim (by id and day) is applied to the times as
// stored. A week's times become a dated schedule beside them.
//
// `source` / `sourceUrl`: what it was read from, kept in the queue's note so
// the admin checks the times against it. A result that changes nothing
// isn't filed: the card confirms the times instead (/confirm).

const FAILED = { ok: false, error: 'That didn’t send. Please try again.' }

export async function POST(request: Request, ctx: RouteContext<'/api/resource/[id]/times'>) {
  const limited = await enforceRateLimit(request, 'submissions', { limit: 10, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (body && isHoneypotTripped(body)) return Response.json({ ok: true })
  const update = cleanUpdate(body?.update)
  if (!body || !update) return Response.json({ ok: false, error: 'Those times couldn’t be read. Please try again.' }, { status: 400 })
  if (!changesAnything(update)) return Response.json({ ok: false, error: 'Nothing to change: these are the times the guide has.' }, { status: 400 })
  if (!(await verifyTurnstile(typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined, clientIp(request)))) {
    return Response.json({ ok: false, code: 'turnstile', error: 'Verification failed. Please try again.' }, { status: 403 })
  }
  if (!ui.contributions.edit) return Response.json({ ok: false, error: 'This action is not available.' }, { status: 403 })
  const source = typeof body.source === 'string' ? body.source.trim().slice(0, 4000) : ''
  // A photo or PDF it was read from: only one the reader kept, in the
  // guide's own storage (/api/schedule/read), never any other address.
  const keptAt = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-assets/schedule-source/`
  const sourceUrl = typeof body.sourceUrl === 'string' && body.sourceUrl.startsWith(keptAt) && /^[\w.-]+$/.test(body.sourceUrl.slice(keptAt.length)) ? body.sourceUrl : null

  try {
    const { data: row } = await getAdminClient()
      .from('resource')
      .select('community_id')
      .eq('id', id)
      .eq('status', 'approved')
      .maybeSingle<{ community_id: string }>()
    const listing = row ? await getResourceById(id, row.community_id) : null
    const category = listing && row ? await getCategoryById(row.community_id, listing.category) : null
    const field = category?.detailFields.find((f) => f.type === 'minyanim')
    if (!listing || !category || !field || !row) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
    if (!resolveCapabilities(category.capabilities).edit) {
      return Response.json({ ok: false, error: 'This action is not available for this category.' }, { status: 403 })
    }

    const key = schedulesKey(field.key)
    const applied = applyUpdate(regularMinyanim(listing[field.key]), readSchedules(listing[key]), update)
    const note = [
      update.kind === 'week' ? 'Times for particular days, sent from the shul’s card.' : `${update.season ? `Their ${update.season} schedule` : 'Their schedule'}, sent from the shul’s card.`,
      applied.changes.join('\n'),
      ...(source ? [`Read from what they pasted:\n${source}`] : []),
      ...(sourceUrl ? [`Read from their photo or PDF: ${sourceUrl}`] : []),
    ].join('\n\n')
    const submission = await submitListingUpdate(
      row.community_id,
      id,
      editSubmission(category, listing, { [field.key]: applied.minyanim, [key]: applied.schedules }),
      note,
      null,
    )
    after(() => sendSubmissionNotification(submission).catch((err) => console.error('[times] Admin notification failed:', err)))
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[times] could not file the update:', err)
    return Response.json(FAILED, { status: 502 })
  }
}
