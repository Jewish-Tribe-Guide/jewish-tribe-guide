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
import { cleanSchedule, readSchedules, schedulesKey, formatSchedulesSummary } from '@/lib/schedules'
import { UUID } from '@/lib/itemMarkRoutes'

// POST /api/resource/:id/schedule   { schedule, source?, turnstileToken, company }
// "Know their Sukkos times? Add them" on a shul's card (step 4, agreed
// Oct 1): one special schedule, sent as an edit suggestion for an admin to
// check, like "+ Add an item". The listing is read here and the edit built
// from it, never from the browser: the shul's times as stored, with this
// schedule added (or put in place of one of the same name).
//
// `source` is what it was read from, when it was pasted (step 4's AI
// reading): kept in the queue's note so the admin checks the times against
// it.

const FAILED = { ok: false, error: 'That didn’t send. Please try again.' }
export async function POST(request: Request, ctx: RouteContext<'/api/resource/[id]/schedule'>) {
  const limited = await enforceRateLimit(request, 'submissions', { limit: 10, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (body && isHoneypotTripped(body)) return Response.json({ ok: true })
  const schedule = cleanSchedule(body?.schedule)
  if (!body || !schedule) return Response.json({ ok: false, error: 'Add at least one time, on a day of the Yom Tov.' }, { status: 400 })
  if (!(await verifyTurnstile(typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined, clientIp(request)))) {
    return Response.json({ ok: false, code: 'turnstile', error: 'Verification failed. Please try again.' }, { status: 403 })
  }
  if (!ui.contributions.edit) return Response.json({ ok: false, error: 'This action is not available.' }, { status: 403 })
  const source = typeof body.source === 'string' ? body.source.trim().slice(0, 4000) : ''

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
    const kept = readSchedules(listing[key]).filter((s) => s.name.toLowerCase() !== schedule.name.toLowerCase())
    const note = [
      `Special times for ${schedule.name}, sent from the shul’s card.`,
      formatSchedulesSummary([schedule]),
      ...(source ? [`Read from what they pasted:\n${source}`] : []),
    ].join('\n\n')
    const submission = await submitListingUpdate(row.community_id, id, editSubmission(category, listing, { [key]: [...kept, schedule] }), note, null)
    after(() => sendSubmissionNotification(submission).catch((err) => console.error('[schedule] Admin notification failed:', err)))
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[schedule] could not file the schedule:', err)
    return Response.json(FAILED, { status: 502 })
  }
}
