import { after } from 'next/server'
import { reportServerError } from '@/lib/serverError'
import { adminRead } from '@/lib/adminRoute'
import { UUID } from '@/lib/itemMarkRoutes'
import { listLeftForAdmin, listUnread, markDone } from '@/lib/sentMessageStore'
import { MAX_ATTEMPTS, readAndFile } from '@/lib/messageFiling'
import { sendPostDoneEmail } from '@/lib/confirmationEmail'

// GET  /api/admin/sent-posts — posts sent with the "+ Add" box that the AI's
//      read couldn't file whole (Nov 27, docs/add-rethink.md): each as it
//      was sent, with what was left and why, for an admin to deal with by
//      hand. What it did file is in the queue as ordinary suggestions.
//      Also tries again, after answering, any post whose read never
//      finished (the read after Send died, or the AI was down): the queue
//      loading is the retry, so no job of its own is needed.
// POST /api/admin/sent-posts   body: { id }
//      Done: the admin dealt with it. Nothing on the site changes; the
//      visitor, if they left an email, hears it's on the site (tracker 103).

// The retries run in after(), inside this function's time.
export const maxDuration = 300

/** A read still going is left be: only one this old is tried again. */
const STUCK_MS = 10 * 60 * 1000

export const GET = adminRead(async (_request: Request, { community }) => {
  try {
    const posts = await listLeftForAdmin(community.slug)
    const apiKey = process.env.OPENAI_API_KEY
    if (apiKey) {
      after(async () => {
        try {
          for (const m of await listUnread(community.slug, STUCK_MS, MAX_ATTEMPTS)) await readAndFile(community, m, { apiKey })
        } catch (err) {
          reportServerError('[admin/sent-posts] retry failed:', err)
        }
      })
    }
    return Response.json({ ok: true, posts: posts.map((p) => ({ id: p.id, text: p.text, photoUrls: p.photoUrls, left: p.left, createdAt: p.createdAt })) })
  } catch (err) {
    reportServerError('[admin/sent-posts] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the posts.'] }, { status: 502 })
  }
})

export const POST = adminRead(async (request: Request, { community }) => {
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null
  if (typeof body?.id !== 'string' || !UUID.test(body.id)) return Response.json({ ok: false, errors: ['Which post?'] }, { status: 400 })
  try {
    const post = await markDone(community.slug, body.id)
    if (post?.email) {
      after(() => sendPostDoneEmail(post).catch((err) => reportServerError('[admin/sent-posts] the visitor’s email failed:', err)))
    }
    return Response.json({ ok: true, done: !!post })
  } catch (err) {
    reportServerError('[admin/sent-posts] POST failed:', err)
    return Response.json({ ok: false, errors: ['That didn’t save. Please try again.'] }, { status: 502 })
  }
})
