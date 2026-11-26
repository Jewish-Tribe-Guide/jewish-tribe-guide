import { reportServerError } from '@/lib/serverError'
import { adminRead } from '@/lib/adminRoute'
import { getCommunityEmail, readEmail, saveCommunityEmail } from '@/lib/communityEmailStore'
import { listWatches } from '@/lib/watchStore'
import { isIgnoredSender, isNewsletterWatch } from '@/lib/newsletter'

// GET /api/admin/community-email — Settings › Team's Community email box and
// its own page (boards E2, E3): the address, whether the newsletter script
// in it has checked in, and when the last shul's or eruv's email came in.
export const GET = adminRead(async (_request: Request, { community }) => {
  try {
    const [own, { watches }] = await Promise.all([getCommunityEmail(community.slug), listWatches(community.slug)])
    const lastEmailAt =
      watches
        .filter((w) => isNewsletterWatch(w) && !isIgnoredSender(w))
        .map((w) => w.pageChangedAt)
        .filter((d): d is string => !!d)
        .sort()
        .pop() ?? null
    return Response.json({ ok: true, ...own, lastEmailAt }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    reportServerError('[admin/community-email] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the community email.'] }, { status: 502 })
  }
})

// POST { email } — Its address, Save.
export const POST = adminRead(async (request: Request, { community }) => {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null
  const email = readEmail(body?.email)
  if (!email) return Response.json({ ok: false, errors: ['That isn’t an email address.'] }, { status: 400 })
  try {
    if (!(await saveCommunityEmail(community.slug, email))) return Response.json({ ok: false, errors: ['It can’t be saved here yet.'] }, { status: 503 })
    return Response.json({ ok: true, email })
  } catch (err) {
    reportServerError('[admin/community-email] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save that.'] }, { status: 502 })
  }
})
