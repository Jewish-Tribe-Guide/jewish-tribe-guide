import { after } from 'next/server'
import { submitListingUpdate } from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { editSubmission } from '@/lib/editSubmission'
import { readSchedules, regularMinyanim, schedulesKey } from '@/lib/schedules'
import { applyUpdate, changesAnything, cleanUpdate, readAnything } from '@/lib/scheduleUpdate'
import { editableListing, failsBotCheck, keptSourceUrl, openListingWrite, pastedSource } from '@/lib/listingWrite'

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
// isn't filed: the card confirms the times instead (/confirm). Except a
// week: the same as the usual times, it's still that week's schedule, and
// is posted as it (the user, Oct 23).
const postsSomething = (u: NonNullable<ReturnType<typeof cleanUpdate>>) => changesAnything(u) || (u.kind === 'week' && readAnything(u))

const FAILED = { ok: false, error: 'That didn’t send. Please try again.' }

export async function POST(request: Request, ctx: RouteContext<'/api/resource/[id]/times'>) {
  const opened = await openListingWrite(request, ctx)
  if (opened instanceof Response) return opened
  const { id, body } = opened
  const update = cleanUpdate(body?.update)
  if (!body || !update) return Response.json({ ok: false, error: 'Those times couldn’t be read. Please try again.' }, { status: 400 })
  if (!postsSomething(update)) return Response.json({ ok: false, error: 'Nothing to change: these are the times the guide has.' }, { status: 400 })
  const bot = await failsBotCheck(request, body)
  if (bot) return bot
  const source = pastedSource(body.source)
  const sourceUrl = keptSourceUrl(body.sourceUrl)

  try {
    const found = await editableListing(id, (c) => c.detailFields.find((f) => f.type === 'minyanim'))
    if (found instanceof Response) return found
    const { community, listing, category, field } = found

    const key = schedulesKey(field.key)
    const applied = applyUpdate(regularMinyanim(listing[field.key]), readSchedules(listing[key]), update, {
      evenIfSame: true,
      // Today where the shul is: its community's clock, not the deployment's.
      keepBefore: new Intl.DateTimeFormat('en-CA', { timeZone: community.timezone }).format(new Date()),
    })
    const note = [
      update.kind === 'week' ? 'Times for particular days, sent from the shul’s card.' : `${update.season ? `Their ${update.season} schedule` : 'Their schedule'}, sent from the shul’s card.`,
      applied.changes.join('\n'),
      ...(source ? [`Read from what they pasted:\n${source}`] : []),
      ...(sourceUrl ? [`Read from their photo or PDF: ${sourceUrl}`] : []),
    ].join('\n\n')
    const submission = await submitListingUpdate(
      community.slug,
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
