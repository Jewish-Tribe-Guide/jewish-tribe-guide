import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import { listApprovedResources } from './resourceStore'
import { listEruvim } from './eruvStore'
import { resolveCommunity } from './communityStore'
import { runTableMissing, kindsColumnMissing, communityColumnMissing, ownOrSiteRuns } from './jobRunStore'
import { nameNight, nightsFrom, NIGHT_JOBS, type NamedNight, type NightRun } from './validatedNights'
import type { JobId, RunKinds } from './jobRuns'

// The nights Activity shows (validatedNights.ts), read from the job runs
// (job_run, kept 60 days) and named from the community's live listings.

/** Enough runs for the page's 30 days, two jobs a night, and reruns. */
const RUNS_READ = 90

/** Cached for the public site: the runs come in once a night, so an hour
 *  is soon enough, and an admin's save clears it with the change log. */
export async function listNights(community: string): Promise<NamedNight[]> {
  'use cache'
  cacheTag(TAGS.changes(community), TAGS.resources(community))
  cacheLife('hours')
  // Its own runs and the whole site's: another community's watches run of
  // the same night would otherwise stand in for its own (nightsFrom keeps
  // a night's latest). Without migration 101, every run, as before.
  const read = (own: boolean) => {
    const q = getAdminClient().from('job_run').select('job, started_at, finished_at, kinds').in('job', NIGHT_JOBS as JobId[]).not('finished_at', 'is', null)
    return (own ? q.or(ownOrSiteRuns(community)) : q).order('started_at', { ascending: false }).limit(RUNS_READ)
  }
  let { data, error } = await read(true)
  if (error && communityColumnMissing(error.message)) ({ data, error } = await read(false))
  // Before migrations 086 and 087 there's nothing to show.
  if (error) {
    if (runTableMissing(error.message) || kindsColumnMissing(error.message)) return []
    throw new Error(`Could not read the nightly runs: ${error.message}`)
  }
  const runs: NightRun[] = ((data ?? []) as { job: JobId; started_at: string; finished_at: string | null; kinds: RunKinds | null }[]).map((r) => ({
    job: r.job,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    kinds: r.kinds?.[community] ?? null,
  }))
  const [{ timezone }, listings, { eruvim }] = await Promise.all([
    resolveCommunity(community),
    listApprovedResources(community),
    listEruvim(community).catch(() => ({ eruvim: [] })),
  ])
  const names = new Map([...listings, ...eruvim].map((l) => [l.id, l.name]))
  return nightsFrom(runs, timezone)
    .map((n) => nameNight(n, (id) => names.get(id)))
    .filter((n) => n.groups.length > 0)
}
