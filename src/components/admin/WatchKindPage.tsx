'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { placeSourcesText, type WatchState } from '@/lib/watchPlaces'
import { useWatchJobsAndReload } from './useWatchJobs'
import OpenedPlace from './OpenedPlace'
import { kindsOf } from './WatchKinds'

// One kind of place on the Watches tab (FinalChanges2, FinalPhoneShuls,
// Oct 24): its places in three tabs, Waiting for you, Not checked and Up to
// date. A place waiting or not checked says why; one up to date, where
// it's read from. One up to date or not checked opens here (OpenedPlace.tsx:
// in its boxes, piece 2; by what's wrong, piece 3); one waiting still opens
// the job page that holds it, until piece 4.

const TABS: { key: WatchState; label: string; none: string }[] = [
  { key: 'waiting', label: 'Waiting for you', none: 'Nothing waiting.' },
  { key: 'not_checked', label: 'Not checked', none: 'Everything is checked.' },
  { key: 'up_to_date', label: 'Up to date', none: 'None yet.' },
]

// On the left on a computer, on the right on a phone, as drawn.
const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="shrink-0 text-slate-400 sm:order-first">
    <path d="M6 4l4 4-4 4" />
  </svg>
)

export default function WatchKindPage({ token, category }: { token: string; category: string }) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const { jobs, reload } = useWatchJobsAndReload(token)
  // Read once, for every row alike; the page is reloaded to refresh.
  const [now] = useState(() => Date.now())
  const [picked, setPicked] = useState<WatchState | null>(null)
  // The place opened, and what it was called, to say where it went when a
  // read finds it something to check.
  const [open, setOpen] = useState<{ id: string; name: string; tab: WatchState } | null>(null)
  const all = kindsOf(jobs, base, now)
  const kind = all?.kinds.find((k) => k.id === category)

  const back = (
    <Link href={`${base}/watches`} className="text-sm font-semibold text-primary hover:underline">
      ‹ Watches
    </Link>
  )
  if (jobs.categories === null || jobs.google === null) return <div className="space-y-4">{back}<p className="text-sm text-red-700">Couldn&rsquo;t load the places.</p></div>
  if (!all || !all.settled) return <div className="space-y-4">{back}<p className="text-sm text-muted">Loading…</p></div>
  if (!kind) return <div className="space-y-4">{back}<p className="text-sm text-slate-600">Nothing of this kind is watched.</p></div>

  const count = { waiting: kind.counts.waiting, not_checked: kind.counts.notChecked, up_to_date: kind.counts.upToDate }
  // Opens on the first tab with anything in it.
  const active = picked ?? TABS.find((t) => count[t.key] > 0)?.key ?? 'waiting'
  const places = kind.places.filter((p) => p.state === active)
  const tab = TABS.find((t) => t.key === active)!
  // Opened from this tab, and a read or a fix moved it to another.
  const moved = open && open.tab === active ? kind.places.find((p) => p.id === open.id && p.state !== active) : undefined

  return (
    <div className="space-y-3.5">
      {back}
      <h1 className="text-xl font-bold text-slate-900 sm:text-[22px]">{kind.label}</h1>
      <div role="tablist" aria-label={`${kind.label} by state`} className="-mx-1 flex gap-0.5 overflow-x-auto border-b border-slate-200 px-1 sm:gap-1">
        {TABS.map((t) => {
          const on = t.key === active
          const flag = t.key !== 'up_to_date' && count[t.key] > 0
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPicked(t.key)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-2 py-2 text-[13.5px] font-semibold sm:px-3 sm:text-sm ${on ? 'border-primary text-primary' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
            >
              {t.label} <span className={on ? '' : flag ? 'text-amber-800' : 'text-slate-500'}>{count[t.key]}</span>
            </button>
          )
        })}
      </div>
      {moved && (
        <p className="text-sm text-slate-700" role="status">
          {moved.name}: now in {TABS.find((t) => t.key === moved.state)!.label}.
        </p>
      )}
      {places.length === 0 ? (
        <p role="tabpanel" className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          {tab.none}
        </p>
      ) : (
        <ul role="tabpanel" aria-label={`${kind.label} ${tab.label.toLowerCase()}`} className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {places.map((p) => {
            const inner = (
              <>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-bold text-slate-900">{p.name}</span>
                  {!p.pill && p.sources.length > 0 && <span className="text-[13px] text-muted">{placeSourcesText(p.sources)}</span>}
                </span>
                {p.pill && (
                  <span className={`whitespace-nowrap rounded-full border px-2 py-px text-xs font-semibold ${p.red ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{p.pill}</span>
                )}
                <Chevron />
              </>
            )
            const row = 'flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 sm:px-4 sm:py-3'
            if (p.state === 'waiting') {
              return (
                <li key={p.id}>
                  <Link href={p.href} className={row} data-testid="kind-place">
                    {inner}
                  </Link>
                </li>
              )
            }
            if (open?.id === p.id) {
              return <OpenedPlace key={p.id} place={p} kindLabel={kind.label} jobs={jobs} token={token} community={community} now={now} onClose={() => setOpen(null)} onChanged={reload} />
            }
            return (
              <li key={p.id}>
                <button type="button" aria-expanded="false" onClick={() => setOpen({ id: p.id, name: p.name, tab: p.state })} className={row} data-testid="kind-place">
                  {inner}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
