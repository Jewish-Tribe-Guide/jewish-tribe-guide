'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { findWatches, listedJobs, watchAside, watchState, type WatchJob } from '@/lib/watchList'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { AdminGroup, AdminRow } from './AdminUI'
import type { CommunityEmailLoaded } from './CommunityEmailPage'
import { JobsNotLoaded } from './WatchKinds'
import { useAdminApi } from './useAdminApi'
import { forgetWatchJobs, useWatchJobsAndReload } from './useWatchJobs'

// ── Watches (tracker 108, board L1, Nov 28) ─────────────────────────────────
// Its own tab now. Every job under what a visitor would look for (Every
// place, Shuls, Food…), each row its name, with "Off" or "Runs when…" on
// the right when it isn't running (or why, when it should be and isn't).
// The search finds a job by its name, or by a source it reads ("Google"
// finds Basic information, "From Google"). A community without its email set
// up is asked for it first: the shuls' and eruvs' emails need it.
//
// What a job finds waits on To do, as before; the card saying so went with
// the boards. The old pages (watches/add, watches/about, job/look-again)
// still open from their addresses.

/** For tests: start from nothing. */
export function forgetWatchesTab() {
  forgetWatchJobs()
}

const field = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-[0.9375rem] text-slate-900'

export default function WatchesManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const api = useAdminApi(token)
  const { jobs } = useWatchJobsAndReload(token)
  const base = adminBase(community)
  const [query, setQuery] = useState('')
  const [own, setOwn] = useState<CommunityEmailLoaded | null>(null)
  const loadOwn = useCallback(async () => {
    setOwn((await api.get<CommunityEmailLoaded>('/api/admin/community-email', '').catch(() => null)) ?? null)
  }, [api])
  useLoadOnMount(loadOwn)

  if (jobs.runs === undefined) return <p className="text-sm text-muted">Loading…</p>
  if (jobs.runs === null) return <p className="text-sm text-red-700">Couldn’t load the watches.</p>
  if (!jobs.runs.available) return <p className="text-sm text-amber-800">Nightly runs aren’t recorded on this site yet.</p>

  const views = jobs.runs.kinds
  const off = jobs.runs.off ?? []
  const listed = listedJobs(views)
  const href = (j: WatchJob) => `${base}/watches/job/${j.id}`
  const aside = (j: WatchJob) => {
    const a = watchAside(j, watchState(j, views, off))
    return a && <span className={a.bad ? 'font-semibold text-amber-800' : 'text-slate-500'}>{a.text}</span>
  }
  const found = findWatches(query, listed, views)
  const headings = [...new Set(listed.map((j) => j.heading))]
  const card = 'flex items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-4 py-3.5 min-h-11 text-slate-900 hover:bg-slate-50'

  return (
    <div className="flex flex-col gap-3">
      <label className={`${field} flex items-center gap-2`}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#64748b" strokeWidth="1.8" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a job, or a source like Google"
          aria-label="Find a job, or a source like Google"
          className="min-w-0 flex-1 border-0 bg-transparent outline-none"
        />
      </label>
      {own && !(own.email && own.checkedAt) && !query.trim() && (
        <Link href={`${base}/team/email`} className={card}>
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-base font-semibold">The community email</span>
            <span className="text-sm text-slate-600">Needed for the shuls’ and eruvs’ emails</span>
          </span>
          <span className="shrink-0 inline-flex items-center min-h-10 rounded-lg bg-primary px-4 text-[0.9375rem] font-semibold text-white">Set it up</span>
        </Link>
      )}
      <JobsNotLoaded jobs={jobs} />
      {query.trim() ? (
        found.length ? (
          <AdminGroup title="Found">
            {found.map((f) => (
              <AdminRow key={f.job.id} href={href(f.job)} name={f.job.name} line={f.line ?? undefined} aside={aside(f.job)} />
            ))}
          </AdminGroup>
        ) : (
          <p className="m-0 text-sm text-slate-600">No job or source called that.</p>
        )
      ) : (
        headings.map((h) => (
          <AdminGroup key={h} title={h}>
            {listed
              .filter((j) => j.heading === h)
              .map((j) => (
                <AdminRow key={j.id} href={href(j)} name={j.name} aside={aside(j)} />
              ))}
          </AdminGroup>
        ))
      )}
    </div>
  )
}
