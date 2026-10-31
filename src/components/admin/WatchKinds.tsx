'use client'

import { watchKinds, type WatchJobsIn, type WatchKind } from '@/lib/watchPlaces'
import { jobsSettled, type Jobs } from './useWatchJobs'

// What the jobs say of each kind of place, for its page (WatchKindPage.tsx).
// Since Oct 31 no row opens these from Watches: a place's own link does, from
// Needs fixing, a job's list or To do. The page waits until every job has
// answered, so its counts don't climb as each comes in.

/** What the jobs say, put together; null until the categories and
 *  Google's places (every listing a job reads) are in. */
export function kindsOf(jobs: Jobs, base: string, now: number): { kinds: WatchKind[]; settled: boolean } | null {
  if (!jobs.categories || !jobs.google) return null
  const input: WatchJobsIn = {
    categories: jobs.categories,
    google: jobs.google.places,
    dishes: jobs.dishes ?? null,
    hours: jobs.hours?.places ?? null,
    times: jobs.times?.places ?? null,
    sites: jobs.sites ?? null,
    hospitals: jobs.hospitals ?? null,
    kosher: jobs.kosher ?? null,
    eruvim: jobs.eruvim ?? null,
    links: jobs.links ?? null,
  }
  return { kinds: watchKinds(input, base, now), settled: jobsSettled(jobs) }
}

// The jobs whose findings the counts take in, by the name each goes by.
// Categories and Google's places are what the rows are built from, so those
// failing shows no rows at all.
const COUNTED_JOBS: [keyof Jobs, string][] = [
  ['dishes', 'Dishes'],
  ['hospitals', 'Hospitals'],
  ['hours', 'Mikvah hours'],
  ['times', 'Shul times'],
  ['sites', 'Websites'],
  ['eruvim', 'Eruv status'],
  ['kosher', 'Kosher lists'],
  ['links', 'Links'],
]

/** The jobs that couldn't be loaded: their findings are missing from every
 *  count, so the counts aren't the whole story. */
export function jobsNotLoaded(jobs: Jobs): string[] {
  return COUNTED_JOBS.filter(([key]) => jobs[key] === null).map(([, name]) => name)
}

/** "Not loaded: Dishes · Shul times", or nothing when every job loaded. */
export function JobsNotLoaded({ jobs }: { jobs: Jobs }) {
  const names = jobsNotLoaded(jobs)
  if (names.length === 0) return null
  return (
    <p className="text-[12.5px] font-medium text-amber-800 sm:text-[13px]" data-testid="jobs-not-loaded">
      Not loaded: {names.join(' · ')}
    </p>
  )
}
