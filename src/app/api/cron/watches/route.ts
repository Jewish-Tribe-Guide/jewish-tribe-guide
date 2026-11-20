// GET|POST /api/cron/watches
//
// The morning watches (watchesRun.ts), a run per community (Nov 20). Until
// then one run read every community's watches inside one function's five
// minutes, so each community added shortened the others' share (134–170s
// of the 220s were already spent with one). Now the cron's call starts a
// run for each community, each a call of its own with its own five
// minutes, and answers once they have all started:
//
//   /api/cron/watches                 starts a run per community
//   /api/cron/watches?community=philly  that community's run, worked
//                                     through after the answer (after())
//
// Each run is recorded under its community (jobRunStore.ts), for its
// Watches tab and nightly email. The runs go at once; within one, never two
// reads on one site at a time (runSideBySide), but two communities' runs
// may each read a site they share.
//
// Auth: as sync-hours (cronAuth.ts); the calls it makes send the secret.

import { after, NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getAdminClient } from '@/lib/supabase/admin'
import { runWatches } from '@/lib/watchesRun'

export const maxDuration = 300

/** How long a community's run has to say it started. */
const START_WAIT_MS = 30_000

async function communitySlugs(): Promise<string[]> {
  const { data, error } = await getAdminClient().from('community').select('slug')
  if (error) throw new Error(`Couldn’t list the communities: ${error.message}`)
  return ((data ?? []) as { slug: string }[]).map((c) => c.slug).sort()
}

/** Starts each community's run, as a call of its own. */
async function startEach(req: NextRequest): Promise<NextResponse> {
  const headers: Record<string, string> = {}
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`
  // Set by Vercel when its deployment protection lets automation through.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const communities = await Promise.all(
    (await communitySlugs()).map(async (slug) => {
      const url = new URL('/api/cron/watches', req.nextUrl.origin)
      url.searchParams.set('community', slug)
      try {
        const res = await fetch(url, { method: 'POST', headers, cache: 'no-store', signal: AbortSignal.timeout(START_WAIT_MS) })
        if (!res.ok) console.error(`[cron/watches] ${slug}’s run didn’t start: ${res.status}`)
        return { community: slug, started: res.ok, status: res.status }
      } catch (err) {
        console.error(`[cron/watches] ${slug}’s run didn’t start:`, err)
        return { community: slug, started: false, error: err instanceof Error ? err.message : String(err) }
      }
    }),
  )
  return NextResponse.json({ ok: communities.every((c) => c.started), communities }, { status: communities.every((c) => c.started) ? 200 : 502 })
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const community = req.nextUrl.searchParams.get('community')
  if (!community) return await startEach(req)
  if (!(await communitySlugs()).includes(community)) return NextResponse.json({ ok: false, error: 'No such community' }, { status: 404 })
  // Its five minutes count from now; the call that started it is answered
  // at once, so it isn't held open for the run.
  const started = Date.now()
  after(() =>
    runWatches(community, started).then(
      () => undefined,
      (err) => console.error(`[cron/watches] ${community}’s run failed:`, err),
    ),
  )
  return NextResponse.json({ ok: true, community, started: true }, { status: 202 })
}

export const GET = handle
export const POST = handle
