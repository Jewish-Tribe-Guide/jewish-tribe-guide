'use client'

import { useState } from 'react'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { hoursJobCategories } from '@/lib/hoursJob'
import type { NightKindId } from '@/lib/jobRuns'
import type { NightKindView } from '@/lib/nightKinds'
import { jobPlaceRows, type JobPlaceRow } from '@/lib/jobPlaceRows'
import { shortDay, watchJobOf, watchLine, watchSources, watchState, type WatchJob } from '@/lib/watchList'
import { kindOf } from '@/lib/placeKinds'
import { AdminBack, AdminBox, AdminRow, AdminSwitch, adminInputClass } from './AdminUI'
import { useAdminApi } from './useAdminApi'
import { noteJobSwitched, useWatchJobsAndReload } from './useWatchJobs'

// A job on Watches, opened (boards L2b, L2f, Nov 28): the Watching card
// (its switch, its state when that needs saying, its line), then From,
// what it reads, each opening Places showing what that source keeps.
// Which places it covers, and which have nothing to read, are Places'
// Watch filter now, not lists here. Kosher certification adds its lists
// here; Other pages keeps its pages, each with Stop or Read again.

export type NightlyRunsLoaded = { available: boolean; kinds: NightKindView[]; off?: NightKindId[] }

const button = 'inline-flex items-center justify-center min-h-11 px-3.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60'
const primary = `${button} border border-primary bg-primary text-white`

/** What a job adds, and how: a place and its page, or just a page. */
const ADDS: Partial<Record<NightKindId, { label: string; purpose: string; place?: string; placeholder: string }>> = {
  times: { label: '+ Add a shul', purpose: 'times', place: 'Which shul', placeholder: 'its-website.org/davening' },
  hours: { label: '+ Add a mikvah', purpose: 'hours', place: 'Which mikvah', placeholder: 'its-website.org/hours' },
  hospitals: { label: '+ Add a hospital', purpose: 'hospital', place: 'Which hospital', placeholder: 'refuah.com/hospitals/…' },
  kosher: { label: '+ Add a list', purpose: 'kosher', placeholder: 'the certifier’s list of places' },
  other: { label: '+ Add a page', purpose: 'other', placeholder: 'the page’s address' },
}

function AddToJob({ kind, token, onDone }: { kind: NightKindId; token: string; onDone: () => Promise<void> }) {
  const api = useAdminApi(token)
  const { jobs } = useWatchJobsAndReload(token)
  const add = ADDS[kind]!
  const [place, setPlace] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const categories = jobs.categories ?? []
  const ids = new Set((kind === 'hospitals' ? categories.filter((c) => kindOf(c) === 'hospitals') : hoursJobCategories(categories, kind === 'times' ? 'times' : 'hours')).map((c) => c.id))
  const places = (jobs.places ?? []).filter((p) => p.status === 'approved' && ids.has(p.category)).sort((a, b) => a.name.localeCompare(b.name))

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await api.post(
        '/api/admin/watches',
        // Only a purpose the Add a watch form offers goes by it; a Refuah page is checked by its address.
        { action: 'add', url, ...(add.place ? { resourceId: place } : {}), ...(kind === 'hospitals' ? {} : { purpose: add.purpose }) },
        'Could not add it.',
      )
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add it.')
      setBusy(false)
    }
  }

  return (
    <AdminBox>
      <div className="flex flex-col gap-3 p-4">
        {add.place && (
          <label className="flex flex-col gap-1.5 text-[0.8125rem] text-slate-600">
            {add.place}
            <select value={place} onChange={(e) => setPlace(e.target.value)} className={adminInputClass}>
              <option value="">Pick one</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-[0.8125rem] text-slate-600">
          Its page
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={add.placeholder} className={adminInputClass} />
        </label>
        {error && <p className="m-0 text-sm text-red-700">{error}</p>}
        <button type="button" disabled={busy || !url.trim() || (!!add.place && !place)} onClick={() => void send()} className={`${primary} self-start`}>
          {busy ? 'Adding…' : 'Add it'}
        </button>
      </div>
    </AdminBox>
  )
}

/** The Watching card (boards L2b, L2f, Nov 28): the switch, what it's
 *  doing when that needs saying (Off · last read Nov 27, Runs when…, or
 *  what's wrong with it), and the job's line. No confirm: turning it back
 *  on is the same switch. */
function WatchingCard({ job, views, token }: { job: WatchJob; views: readonly NightKindView[]; token: string }) {
  const community = useCommunitySlug()
  const api = useAdminApi(token)
  const { jobs } = useWatchJobsAndReload(token)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const s = watchState(job, views, jobs.runs?.off ?? [])
  const on = s.state !== 'off'

  async function flip(turnOn: boolean) {
    setBusy(true)
    setError(null)
    try {
      for (const kind of job.kinds) {
        await api.post('/api/admin/watches', { action: turnOn ? 'job-on' : 'job-off', kind }, turnOn ? 'Could not turn it on.' : 'Could not turn it off.')
        noteJobSwitched(community, kind, !turnOn)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that.')
    } finally {
      setBusy(false)
    }
  }

  const state =
    s.state === 'off'
      ? { text: s.lastAt ? `Off · last read ${shortDay(s.lastAt)}` : 'Off', bad: false }
      : s.state === 'new'
        ? { text: job.runsWhen, bad: false }
        : s.trouble
          ? { text: s.trouble, bad: true }
          : null
  return (
    <div className="overflow-hidden rounded-[10px] border border-slate-200 bg-white" data-testid="watching">
      <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-bold text-slate-900">Watching</span>
          {state && <span className={`text-[0.8125rem] ${state.bad ? 'font-semibold text-amber-800' : 'text-slate-600'}`} data-testid="watching-state">{state.text}</span>}
        </span>
        <span className={busy ? 'pointer-events-none opacity-60' : ''}>
          <AdminSwitch checked={on} onChange={(v) => void flip(v)} label={`${job.name} on`} />
        </span>
      </div>
      <p className="m-0 px-4 pb-3 text-sm text-slate-600" data-testid="watching-line">{watchLine(job, views)}</p>
      {error && <p className="m-0 px-4 pb-3 text-sm text-red-700">{error}</p>}
    </div>
  )
}

/** Read rows shown before "Show all" (board W4), on Other pages. */
const READ_SHOWN = 6

export default function JobPage({ token, id }: { token: string; id: string }) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const api = useAdminApi(token)
  const { jobs, reload } = useWatchJobsAndReload(token)
  const [adding, setAdding] = useState(false)
  const [all, setAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shul emails' and a place's own website's old addresses open the job
  // they're part of now.
  const watch = watchJobOf(id)
  const title = watch?.name ?? ''
  const views = jobs.runs?.kinds ?? []
  const head = <AdminBack back={{ label: 'Watches', href: `${base}/watches` }} title={title} />
  if (jobs.runs === null) return <div className="space-y-4">{head}<p className="text-sm text-red-700">Couldn’t load this job.</p></div>
  if (!watch) return <div className="space-y-4">{head}<p className="text-sm text-muted">No such job.</p></div>
  if (jobs.runs === undefined) return <div className="space-y-4">{head}<p className="text-sm text-muted">Loading…</p></div>

  const sources = watchSources(watch, views)
  // From: what it reads, each opening Places showing what that source
  // keeps (board L2b). A job with one kind of source has none; its line says it.
  const from = sources.length > 0 && (
    <AdminBox title="From">
      {sources.map((src) => (
        <AdminRow key={src.key} href={`${base}/places?watch=${watch.id}&source=${encodeURIComponent(src.key)}`} name={src.label} />
      ))}
    </AdminBox>
  )

  if (watch.id !== 'other') {
    const add = watch.id === 'kosher' ? ADDS.kosher : undefined
    return (
      <div className="flex flex-col gap-3">
        {head}
        <WatchingCard job={watch} views={views} token={token} />
        {from}
        {add && (
          <button type="button" aria-expanded={adding} onClick={() => setAdding((a) => !a)} className="min-h-11 cursor-pointer self-start text-[0.9375rem] font-semibold text-primary">
            {add.label}
          </button>
        )}
        {adding && <AddToJob kind="kosher" token={token} onDone={async () => { setAdding(false); await reload() }} />}
      </div>
    )
  }

  // Other pages (added by hand): each page, with Stop or Read again.
  const job = views.find((k) => k.id === 'other')
  async function list(watchId: string, action: 'pause' | 'resume') {
    setError(null)
    try {
      await api.post('/api/admin/watches', { action, id: watchId }, 'Could not do that.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that.')
    }
  }
  const { read } = jobPlaceRows('other', { tracked: job?.tracked ?? [], places: null, eruvim: null }, () => true)
  const shown = all ? read : read.slice(0, READ_SHOWN)
  const row = (r: JobPlaceRow) => (
    <div key={r.key} className="flex min-h-11 items-center gap-2 px-4 py-2">
      <span className="flex flex-1 flex-col">
        <span className="text-[0.9375rem] font-semibold text-slate-900">{r.name}</span>
        <span className="text-[0.8125rem] text-slate-600">{r.line}</span>
      </span>
      {r.watch && (
        <button type="button" onClick={() => void list(r.watch!.id, r.watch!.active ? 'pause' : 'resume')} className="min-h-11 cursor-pointer whitespace-nowrap text-[0.8125rem] font-semibold text-primary">
          {r.watch.active ? 'Stop' : 'Read again'}
        </button>
      )}
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      <AdminBack
        back={{ label: 'Watches', href: `${base}/watches` }}
        title={title}
        right={
          <button type="button" aria-expanded={adding} onClick={() => setAdding((a) => !a)} className={`${primary} whitespace-nowrap`}>
            {ADDS.other!.label}
          </button>
        }
      />
      <WatchingCard job={watch} views={views} token={token} />
      {adding && <AddToJob kind="other" token={token} onDone={async () => { setAdding(false); await reload() }} />}
      {read.length > 0 && (
        <AdminBox title={`Read · ${read.length}`}>
          {shown.map(row)}
          {read.length > READ_SHOWN && (
            <button type="button" aria-expanded={all} onClick={() => setAll((a) => !a)} className="min-h-11 w-full cursor-pointer px-4 text-left text-[0.9375rem] font-semibold text-primary">
              {all ? 'Show fewer' : `Show all ${read.length}`}
            </button>
          )}
        </AdminBox>
      )}
      {error && <p className="m-0 text-sm text-red-700">{error}</p>}
    </div>
  )
}
