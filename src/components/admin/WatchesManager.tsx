'use client'

import { useState } from 'react'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { jobLists, lastRunWord, needsFixing, watchesSentence } from '@/lib/watchJobList'
import type { NightKindId } from '@/lib/jobRuns'
import type { NightKindView } from '@/lib/nightKinds'
import { AdminBack, AdminBox, AdminRow, AdminRows } from './AdminUI'
import { BadMark, GoodMark } from './JobPage'
import { JobsNotLoaded } from './WatchKinds'
import { coverageOf, forgetWatchJobs, useWatchJobsAndReload } from './useWatchJobs'

// ── Watches (the user, Oct 31; boards "Watches" and "a new admin") ──────────
// One page, for a new admin and an old one alike. A sentence on whether
// anything needs fixing, what does, each job with when it last ran and a check
// or an X, the jobs that need one step, and how many places have something no
// job checks. What a watch finds waits in To do, not here. A place's own page
// opens on its own from Needs fixing and from a job (PlacePage.tsx).

/** For tests: start from nothing. */
export function forgetWatchesTab() {
  forgetWatchJobs()
}

/** The jobs, under the source they read (WatchesInPlaces10). */
const WATCH_SOURCES: { title: string; jobs: NightKindId[] }[] = [
  { title: 'Google', jobs: ['google'] },
  { title: 'Websites', jobs: ['times', 'hours', 'sites', 'menus', 'eruvs', 'other'] },
  { title: 'Email', jobs: ['newsletters'] },
  { title: 'Outside lists', jobs: ['kosher', 'hospitals'] },
  { title: 'Link check', jobs: ['links'] },
]

/** A list goes by whose it is, with what it's read for under it. */
const OUTSIDE: Partial<Record<NightKindId, { name: string; about: string }>> = {
  kosher: { name: 'Keystone-K and Mekor Habracha', about: 'Kosher certification' },
  hospitals: { name: 'Refuah', about: 'Hospitals' },
}

function JobRow({ job, base, now }: { job: NightKindView; base: string; now: number }) {
  const bad = job.fixes.length > 0
  const outside = OUTSIDE[job.id]
  const when = job.lastAt ? lastRunWord(job.lastAt, now, job.id !== 'newsletters' && job.id !== 'links') : undefined
  const href = job.id === 'newsletters' ? `${base}/watches/newsletters` : `${base}/watches/job/${job.id}`
  return (
    <AdminRow
      href={href}
      name={outside?.name ?? job.name}
      line={[outside?.about, when].filter(Boolean).join(' · ') || undefined}
      aside={!job.lastAt ? 'Not run yet' : bad ? <BadMark /> : <GoodMark />}
    />
  )
}

export default function WatchesManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const { jobs } = useWatchJobsAndReload(token)
  // Read once per render pass for every row alike; the tab is reloaded to refresh.
  const [now] = useState(() => Date.now())
  const base = adminBase(community)

  if (jobs.runs === undefined || jobs.categories === undefined) return <p className="text-sm text-muted">Loading…</p>
  if (jobs.runs === null || jobs.categories === null) return <p className="text-sm text-red-700">Couldn’t load the watches.</p>
  if (!jobs.runs.available) return <p className="text-sm text-amber-800">Nightly runs aren’t recorded on this site yet.</p>

  const lists = jobLists(jobs.categories, jobs.runs.kinds, jobs.runs.off ?? [])
  const fixes = needsFixing(lists.jobs)
  const sentence = watchesSentence(lists.jobs, fixes.length)
  const coverage = coverageOf(jobs)
  const unwatched = coverage ? [...coverage.values()].filter((c) => c.notWatched.length > 0).length : null

  return (
    <div className="flex flex-col gap-3">
      <AdminBack back={{ label: 'Places', href: `${base}/places` }} title="Watches" />
      <div className="flex items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-4 py-3.5" data-testid="watches-sentence">
        {sentence.tone === 'good' && <GoodMark label="" />}
        {sentence.tone === 'bad' && <BadMark label="" />}
        <p className="m-0 text-lg font-semibold leading-snug text-slate-900">{sentence.text}</p>
      </div>
      <JobsNotLoaded jobs={jobs} />
      {fixes.length > 0 && (
        <AdminBox title="Needs fixing">
          <AdminRows items={fixes}>
            {(f) => <AdminRow key={`${f.name}${f.why}`} href={f.page ? `${base}/watches/${f.page}` : `${base}/watches`} name={f.name} line={<span className="text-amber-800">{f.why}</span>} />}
          </AdminRows>
        </AdminBox>
      )}
      {WATCH_SOURCES.map((source) => {
        const here = source.jobs.flatMap((id) => lists.jobs.filter((j) => j.id === id))
        return here.length > 0 ? (
          <AdminBox key={source.title} title={source.title}>
            {here.map((j) => (
              <JobRow key={j.id} job={j} base={base} now={now} />
            ))}
          </AdminBox>
        ) : null
      })}
      {lists.steps.length > 0 && (
        <AdminBox title="Needs one step">
          {lists.steps.map((s) => (
            <AdminRow key={s.id} href={s.id === 'newsletters' ? `${base}/watches/newsletters` : `${base}/watches/job/${s.id}`} name={s.name} line={s.step} />
          ))}
        </AdminBox>
      )}
      {lists.more.length > 0 && (
        <AdminBox>
          <AdminRow href={`${base}/watches/add`} name={<span className="text-primary">+ Add a watch</span>} />
        </AdminBox>
      )}
      {unwatched !== null && unwatched > 0 && (
        <AdminBox title="Not watched">
          <AdminRow href={`${base}/places?checked=not-watched`} name={`${unwatched} ${unwatched === 1 ? 'place' : 'places'}`} />
        </AdminBox>
      )}
    </div>
  )
}
