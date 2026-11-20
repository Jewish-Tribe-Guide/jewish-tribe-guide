import { reportServerError } from '@/lib/serverError'
import { after } from 'next/server'
import { submitListingUpdate } from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { editSubmission } from '@/lib/editSubmission'
import { cleanSchedule, readSchedules, schedulesKey, formatSchedulesSummary } from '@/lib/schedules'
import { fetchFestivals } from '@/lib/festivals'
import { mergeSchedule, scheduleDayDates } from '@/lib/scheduleUpdate'
import { editableListing, failsBotCheck, keptSourceUrl, openListingWrite, pastedSource } from '@/lib/listingWrite'

// POST /api/resource/:id/schedule   { schedule, source?, turnstileToken, company }
// "Know their Sukkos times? Add them" on a shul's card (step 4, agreed
// Oct 1): one special schedule, sent as an edit suggestion for an admin to
// check, like "+ Add an item". The listing is read here and the edit built
// from it, never from the browser: the shul's times as stored, with this
// schedule added, or merged day by day into one of the same name.
//
// `source` is what it was read from, when it was pasted (step 4's AI
// reading): kept in the queue's note so the admin checks the times against
// it.

const FAILED = { ok: false, error: 'That didn’t send. Please try again.' }
export async function POST(request: Request, ctx: RouteContext<'/api/resource/[id]/schedule'>) {
  const opened = await openListingWrite(request, ctx)
  if (opened instanceof Response) return opened
  const { id, body } = opened
  const schedule = cleanSchedule(body?.schedule)
  if (!body || !schedule) return Response.json({ ok: false, error: 'Add at least one time, on a day of the Yom Tov.' }, { status: 400 })
  const bot = await failsBotCheck(request, body)
  if (bot) return bot
  const source = pastedSource(body.source)
  // A photo or PDF it was read from, by either reader (keptSourceUrl): this
  // one used to take only the schedule reader's, so a Yom Tov schedule read
  // in the "+ Add" box lost its photo on the way to the queue.
  const sourceUrl = keptSourceUrl(body.sourceUrl)

  try {
    const found = await editableListing(id, (c) => c.detailFields.find((f) => f.type === 'minyanim'))
    if (found instanceof Response) return found
    const { community, listing, category, field } = found

    const key = schedulesKey(field.key)
    // One of the same name is merged day by day: Shemini Atzeres's times
    // sent now keep the Chol HaMoed ones already there. The festival's
    // dates where the shul is: its community's clock.
    const festival = (await fetchFestivals(community.timezone)).find((f) => f.from <= schedule.to && schedule.from <= f.to)
    const schedules = mergeSchedule(readSchedules(listing[key]), schedule, (d, s) => scheduleDayDates(d, s, festival?.days))
    const note = [
      `Special times for ${schedule.name}, sent from the shul’s card.`,
      formatSchedulesSummary([schedule]),
      ...(source ? [`Read from what they pasted:\n${source}`] : []),
      ...(sourceUrl ? [`Read from their photo or PDF: ${sourceUrl}`] : []),
    ].join('\n\n')
    const submission = await submitListingUpdate(community.slug, id, editSubmission(category, listing, { [key]: schedules }), note, null)
    after(() => sendSubmissionNotification(submission).catch((err) => reportServerError('[schedule] Admin notification failed:', err)))
    return Response.json({ ok: true })
  } catch (err) {
    reportServerError('[schedule] could not file the schedule:', err)
    return Response.json(FAILED, { status: 502 })
  }
}
