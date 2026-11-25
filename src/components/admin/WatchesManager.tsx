'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { keptCurrent, type KeptRow } from '@/lib/keptCurrent'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { AdminBack, AdminBox, AdminRow } from './AdminUI'
import type { CommunityEmailLoaded } from './CommunityEmailPage'
import { JobsNotLoaded } from './WatchKinds'
import { useAdminApi } from './useAdminApi'
import { forgetWatchJobs, useWatchJobsAndReload } from './useWatchJobs'

// ── Watches (boards W1 and W2, Nov 25) ──────────────────────────────────────
// What's kept current, one row each, saying where it's read from and when;
// each opens its job page, which lists every place it covers and what each
// is missing (W4). What a watch finds waits on To do, and so does any place
// one couldn't read: the card at the top says so and opens it. A community
// without its community email set up is asked for it first: the shuls' and
// eruvs' emails need it.
//
// Gone from here (the user: "a box waiting to explode"): the sentence,
// Needs fixing (To do has it), + Add a watch (one place's source is added on
// the place, a list covering many on its row's page), How watches work,
// Look again and Needs one step. Their pages (watches/add, watches/about,
// job/look-again) still open from their addresses.

/** For tests: start from nothing. */
export function forgetWatchesTab() {
  forgetWatchJobs()
}

const TONE: Record<KeptRow['tone'], string> = { ok: 'text-slate-600', none: 'text-slate-500', bad: 'font-semibold text-amber-800' }

export default function WatchesManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const api = useAdminApi(token)
  const { jobs } = useWatchJobsAndReload(token)
  // Read once per render pass for every row alike; the tab is reloaded to refresh.
  const [now] = useState(() => Date.now())
  const base = adminBase(community)
  const [own, setOwn] = useState<CommunityEmailLoaded | null>(null)
  const loadOwn = useCallback(async () => {
    setOwn((await api.get<CommunityEmailLoaded>('/api/admin/community-email', '').catch(() => null)) ?? null)
  }, [api])
  useLoadOnMount(loadOwn)

  const back = <AdminBack back={{ label: 'Places', href: `${base}/places` }} title="Watches" />
  if (jobs.runs === undefined || jobs.categories === undefined) return <div className="flex flex-col gap-3">{back}<p className="text-sm text-muted">Loading…</p></div>
  if (jobs.runs === null || jobs.categories === null) return <div className="flex flex-col gap-3">{back}<p className="text-sm text-red-700">Couldn’t load the watches.</p></div>
  if (!jobs.runs.available) return <div className="flex flex-col gap-3">{back}<p className="text-sm text-amber-800">Nightly runs aren’t recorded on this site yet.</p></div>

  const rows = keptCurrent(jobs.categories, jobs.runs.kinds, jobs.runs.off ?? [], now)
  const anyRead = rows.some((r) => r.tone !== 'none')
  const card = 'flex items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-4 py-3.5 min-h-11 text-slate-900 hover:bg-slate-50'

  return (
    <div className="flex flex-col gap-3">
      {back}
      {own && !(own.email && own.checkedAt) && (
        <Link href={`${base}/team/email`} className={card}>
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-base font-semibold">The community email</span>
            <span className="text-sm text-slate-600">Needed for the shuls’ and eruvs’ emails</span>
          </span>
          <span className="shrink-0 inline-flex items-center min-h-10 rounded-lg bg-primary px-4 text-[0.9375rem] font-semibold text-white">Set it up</span>
        </Link>
      )}
      {anyRead && (
        <Link href={base} className={card}>
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-base font-semibold">What they found waits on To do</span>
            <span className="text-sm text-slate-600">And any place a watch couldn’t read</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      )}
      <JobsNotLoaded jobs={jobs} />
      <AdminBox title="Kept current">
        {rows.map((r) => (
          <AdminRow key={r.key} href={`${base}/watches/job/${r.job}`} name={r.name} line={r.from} aside={<span className={TONE[r.tone]}>{r.when}</span>} />
        ))}
      </AdminBox>
    </div>
  )
}
