'use client'

import Link from 'next/link'
import { kindSourcesText, notWatched, watchKinds, type WatchJobsIn, type WatchKind } from '@/lib/watchPlaces'
import { jobsSettled, type Jobs } from './useWatchJobs'

// The Watches tab's rows, one per kind of place (FinalMain and
// FinalPhoneTab, Oct 24): its sources, then how many of its places wait
// for you, aren't checked, and are up to date. The row opens the kind's
// page (WatchKindPage.tsx). The counts wait until every job has answered,
// so they don't climb as each comes in.

/** What the jobs say, put together; null until the categories and
 *  Google's places (every listing a job reads) are in. */
export function kindsOf(jobs: Jobs, base: string, now: number): { kinds: WatchKind[]; notWatched: string[]; settled: boolean } | null {
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
  const kinds = watchKinds(input, base, now)
  // A kind with no address whose places' websites are read has its row.
  const rows = new Set(kinds.map((k) => k.label))
  return { kinds, notWatched: notWatched(jobs.categories).filter((l) => !rows.has(l)), settled: jobsSettled(jobs) }
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

function Stat({ n, label, flag }: { n: number; label: string; flag?: boolean }) {
  return (
    <span className="flex flex-col sm:min-w-[6.5rem]">
      <b className={`text-base sm:text-[17px] ${flag && n > 0 ? 'text-amber-800' : 'text-slate-900'}`}>{n}</b>
      <span className="text-xs text-muted sm:text-[12.5px]">{label}</span>
    </span>
  )
}

const Chevron = ({ className = '' }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`shrink-0 text-slate-400 ${className}`}>
    <path d="M6 4l4 4-4 4" />
  </svg>
)

export default function WatchKinds({ jobs, base, now }: { jobs: Jobs; base: string; now: number }) {
  const all = kindsOf(jobs, base, now)
  const failed = jobs.categories === null || jobs.google === null
  return (
    <section className="rounded-lg border border-slate-200 bg-white" aria-label="What the watches keep current">
      {failed ? (
        <p className="px-4 py-3 text-sm text-slate-500">Couldn&rsquo;t load what the watches keep current.</p>
      ) : !all ? (
        <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {all.kinds.map((k) => (
              <li key={k.id}>
                <Link href={`${base}/watches/kind/${k.id}`} className="flex flex-col gap-2 px-3.5 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-6 sm:px-4 sm:py-3.5" data-testid="kind-row">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15.5px] font-bold text-slate-900">{k.label}</span>
                      <span className="text-[12.5px] text-muted sm:text-[13px]">{kindSourcesText(k.sources)}</span>
                    </span>
                    <Chevron className="sm:hidden" />
                  </span>
                  {all.settled ? (
                    <span className="grid grid-cols-3 gap-2 sm:flex sm:gap-5">
                      <Stat n={k.counts.waiting} label="waiting for you" flag />
                      <Stat n={k.counts.notChecked} label="not checked" flag />
                      <Stat n={k.counts.upToDate} label="up to date" />
                    </span>
                  ) : (
                    <span className="text-sm text-slate-500" data-testid="kind-loading">
                      Loading…
                    </span>
                  )}
                  <Chevron className="hidden sm:block" />
                </Link>
              </li>
            ))}
          </ul>
          {all.notWatched.length > 0 && <p className="border-t border-slate-100 px-3.5 py-3 text-[12.5px] text-muted sm:px-4 sm:text-[13px]">Not watched: {all.notWatched.join(' · ')}</p>}
          {all.settled && jobsNotLoaded(jobs).length > 0 && (
            <div className="border-t border-slate-100 px-3.5 py-3 sm:px-4">
              <JobsNotLoaded jobs={jobs} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
