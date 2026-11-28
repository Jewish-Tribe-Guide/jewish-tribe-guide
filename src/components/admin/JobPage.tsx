'use client'

import { useState } from 'react'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import type { NightKindId } from '@/lib/jobRuns'
import type { NightKindView } from '@/lib/nightKinds'
import { jobPlaceRows, type JobPlaceRow } from '@/lib/jobPlaceRows'
import { shortDay, watchJobOf, watchSources, watchState, type WatchJob } from '@/lib/watchList'
import { AdminBack, AdminBox, AdminGroup, AdminSwitch, adminInputClass } from './AdminUI'
import KosherLists from './KosherLists'
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

/** Other pages adds a page by hand; what it finds waits on To do. */
function AddPage({ token, onDone }: { token: string; onDone: () => Promise<void> }) {
  const api = useAdminApi(token)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/admin/watches', { action: 'add', url, purpose: 'other' }, 'Could not add it.')
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add it.')
      setBusy(false)
    }
  }

  return (
    <AdminBox>
      <div className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1.5 text-[0.8125rem] text-slate-600">
          Its page
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="the page’s address" className={adminInputClass} />
        </label>
        {error && <p className="m-0 text-sm text-red-700">{error}</p>}
        <button type="button" disabled={busy || !url.trim()} onClick={() => void send()} className={`${primary} self-start`}>
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
function WatchingCard({ job, views, off, token }: { job: WatchJob; views: readonly NightKindView[]; off: readonly NightKindId[]; token: string }) {
  const community = useCommunitySlug()
  const api = useAdminApi(token)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const s = watchState(job, views, off)
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
      <p className="m-0 px-4 pb-3 text-sm text-slate-600" data-testid="watching-line">{job.line}</p>
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
  // From: what it reads, as plain rows (board L2b; the user, Nov 28: not
  // links). Broken links has none: it opens the links listings already have.
  const from =
    watch.id === 'kosher' ? (
      <KosherLists views={views} token={token} onChanged={reload} />
    ) : (
      sources.length > 0 && (
        <AdminGroup title="From">
          {sources.map((src) => (
            <div key={src.key} data-testid="from-row" className="flex min-h-[52px] items-center border-b border-slate-100 px-4 py-2.5 text-[0.9375rem] font-semibold text-slate-900 last:border-b-0">
              {src.label}
            </div>
          ))}
        </AdminGroup>
      )
    )

  if (watch.id !== 'other') {
    return (
      <div className="flex flex-col gap-3">
        {head}
        <WatchingCard job={watch} views={views} off={jobs.runs.off ?? []} token={token} />
        {from}
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
            + Add a page
          </button>
        }
      />
      <WatchingCard job={watch} views={views} off={jobs.runs.off ?? []} token={token} />
      {adding && <AddPage token={token} onDone={async () => { setAdding(false); await reload() }} />}
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
