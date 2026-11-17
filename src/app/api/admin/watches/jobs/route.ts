import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { JOB_READS, type JobKey } from '@/lib/watchJobReads'
import { GET as categories } from '../../categories/route'
import { GET as dishes } from '../../main-dishes/route'
import { GET as listings } from '../../listings/route'
import { GET as eruv } from '../eruv/route'
import { GET as google } from '../google/route'
import { GET as hospitals } from '../hospitals/route'
import { GET as hours } from '../hours/route'
import { GET as kosher } from '../kosher/route'
import { GET as links } from '../links/route'
import { GET as lookAgain } from '../look-again/route'
import { GET as runs } from '../runs/route'
import { GET as sites } from '../sites/route'

// GET /api/admin/watches/jobs?only=dishes,places — every watch job's read
//     in one request: { ok, jobs: { [job]: what its own route answers, or
//     null when it failed } }. `only` narrows it to the jobs a save changed.
// Admin only (and each job's own route checks again).
//
// Why one request: an admin screen read all thirteen at once from the
// browser, which opens six connections to a server over HTTP/1.1 (the
// tests' `next start`), so they queued, and a place's screen showed
// nothing until the third round came back — over 3s on a busy runner,
// where admin-write's openPlace failed on it (Nov 16). Here they run side
// by side on the server, through the same handlers, so nothing about
// what each returns can drift from its own route.

type Handler = (request: Request) => Promise<Response>

/** Each job's route handler; its path and query are JOB_READS'. */
const HANDLERS: Record<JobKey, Handler> = {
  categories,
  dishes,
  hospitals,
  hours,
  times: hours,
  sites,
  eruvim: eruv,
  kosher,
  google,
  links,
  runs,
  places: listings,
  lookAgain,
}

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const only = new URL(request.url).searchParams.get('only')
  const keys = (only ? only.split(',') : Object.keys(JOB_READS)).filter((k): k is JobKey => k in JOB_READS)

  const answers = await Promise.all(
    keys.map(async (key) => {
      const handler = HANDLERS[key]
      const url = new URL(JOB_READS[key], request.url)
      url.searchParams.set('community', community.slug)
      try {
        const res = await handler(new Request(url, { headers: request.headers }))
        return [key, res.ok ? await res.json() : null] as const
      } catch (err) {
        console.error(`[admin/watches/jobs] ${key} failed:`, err)
        return [key, null] as const
      }
    }),
  )
  return Response.json({ ok: true, jobs: Object.fromEntries(answers) })
}
