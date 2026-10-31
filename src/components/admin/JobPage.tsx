'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { fetchJson } from '@/lib/fetchJson'
import { hoursJobCategories } from '@/lib/hoursJob'
import type { NightKindId } from '@/lib/jobRuns'
import { NIGHT_KINDS, type KindNight, type NightKindView } from '@/lib/nightKinds'
import { HOSPITAL_CATEGORY } from '@/lib/refuahMatch'
import { withCommunity } from '@/lib/useCommunityData'
import { JOB_STEPS } from '@/lib/watchJobList'
import { AdminBack, AdminBox, AdminRow, adminInputClass } from './AdminUI'
import { useWatchJobsAndReload } from './useWatchJobs'

// A job, opened (board "a job"): how last night went and when it runs, what
// it didn't read, all it tracks, its last 14 nights with a check or an X, and
// Turn off this job. A job that needs its one step says it here, and adds
// here. Newsletters have their own page (NewslettersPage.tsx).

export type NightlyRunsLoaded = { available: boolean; kinds: NightKindView[]; off?: NightKindId[] }

const button = 'inline-flex items-center justify-center min-h-11 px-3.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60'
const primary = `${button} border border-primary bg-primary text-white`
const secondary = `${button} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`

export function GoodMark({ label = 'Good' }: { label?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label} className="shrink-0">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function BadMark({ label = 'Something wrong' }: { label?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2.4" strokeLinecap="round" role="img" aria-label={label} className="shrink-0">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  )
}

/** What a job adds, and how: a place and its page, or just a page. */
const ADDS: Partial<Record<NightKindId, { label: string; purpose: string; place?: string; placeholder: string }>> = {
  times: { label: '+ Add a shul', purpose: 'times', place: 'Which shul', placeholder: 'its-website.org/davening' },
  hours: { label: '+ Add a mikvah', purpose: 'hours', place: 'Which mikvah', placeholder: 'its-website.org/hours' },
  hospitals: { label: '+ Add a hospital', purpose: 'hospital', place: 'Which hospital', placeholder: 'refuah.com/hospitals/…' },
  kosher: { label: '+ Add a list', purpose: 'kosher', placeholder: 'the certifier’s list of places' },
  other: { label: '+ Add a page', purpose: 'other', placeholder: 'the page’s address' },
}

function AddToJob({ kind, token, onDone }: { kind: NightKindId; token: string; onDone: () => Promise<void> }) {
  const community = useCommunitySlug()
  const { jobs } = useWatchJobsAndReload(token)
  const add = ADDS[kind]!
  const [place, setPlace] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const categories = jobs.categories ?? []
  const ids = new Set((kind === 'hospitals' ? categories.filter((c) => c.id === HOSPITAL_CATEGORY) : hoursJobCategories(categories, kind === 'times' ? 'times' : 'hours')).map((c) => c.id))
  const places = (jobs.places ?? []).filter((p) => p.status === 'approved' && ids.has(p.category)).sort((a, b) => a.name.localeCompare(b.name))

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await fetchJson(
        withCommunity('/api/admin/watches', community),
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          // Only a purpose the Add a watch form offers goes by it; a Refuah page is checked by its address.
          body: JSON.stringify({ action: 'add', url, ...(add.place ? { resourceId: place } : {}), ...(kind === 'hospitals' ? {} : { purpose: add.purpose }) }),
        },
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
          <label className="flex flex-col gap-1.5 text-[13px] text-slate-600">
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
        <label className="flex flex-col gap-1.5 text-[13px] text-slate-600">
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

/** The one way to stop a job here. It says what stopping costs before it
 *  does; what the job checked then counts as Not watched. */
export function TurnOffJob({ kind, name, count, token }: { kind: NightKindId; name: string; count: number; token: string }) {
  const community = useCommunitySlug()
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function turnOff() {
    setBusy(true)
    setError(null)
    try {
      await fetchJson(
        withCommunity('/api/admin/watches', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'job-off', kind }) },
        'Could not turn it off.',
      )
      router.push(`${adminBase(community)}/watches`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn it off.')
      setBusy(false)
    }
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="min-h-11 cursor-pointer text-[15px] font-semibold text-slate-600">
        Turn off this job
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <p className="m-0 text-sm text-slate-800">
        Turn off {name}?{count > 0 && ` ${count} ${count === 1 ? 'place' : 'places'} won’t be checked.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void turnOff()} className={primary}>
          {busy ? 'Turning off…' : 'Turn it off'}
        </button>
        <button type="button" disabled={busy} onClick={() => setAsking(false)} className={secondary}>
          Leave it on
        </button>
      </div>
      {error && <p className="m-0 text-sm text-red-700">{error}</p>}
    </div>
  )
}

/** "Last night: 15 of 16 read"; with no run yet, the job's own step. */
function statusLine(job: NightKindView): string {
  if (!job.lastAt) return job.tracked.length ? 'Not run yet' : (JOB_STEPS[job.id] ?? 'Not run yet')
  return /^(Didn’t run|Failed|Running)/.test(job.count) ? job.count : `Last night: ${job.count}`
}

function NightRow({ night }: { night: KindNight }) {
  return (
    <li className="flex min-h-10 items-center justify-between gap-2 border-b border-slate-100 px-3 text-sm last:border-b-0">
      <span className="font-semibold text-slate-900">{night.date}</span>
      {night.tone === 'good' ? <GoodMark label={night.result} /> : night.tone === 'bad' ? <BadMark label={night.result} /> : <span className="text-[13px] text-slate-400">{night.result}</span>}
    </li>
  )
}

/** Tracked rows shown before "Show all". */
const TRACKED_SHOWN = 2

export default function JobPage({ token, id }: { token: string; id: string }) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const { jobs, reload } = useWatchJobsAndReload(token)
  const [adding, setAdding] = useState(false)
  const [all, setAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const known = NIGHT_KINDS.find((k) => k.id === id)
  const job: NightKindView | undefined = jobs.runs?.kinds.find((k) => k.id === id) ?? (known && jobs.runs ? { id: known.id, name: known.name, about: known.about, when: null, count: 'Not run yet', trouble: null, misses: [], tracked: [], nights: [], fixes: [], lastAt: null, schedule: '' } : undefined)
  const page = (p: string) => `${base}/watches/${p}`
  const add = known && ADDS[known.id]
  const eruvKind = known?.id === 'eruvs' ? jobs.categories?.find((c) => c.kind === 'eruv') : undefined
  const right = add ? (
    <button type="button" aria-expanded={adding} onClick={() => setAdding((a) => !a)} className={`${primary} whitespace-nowrap`}>
      {add.label}
    </button>
  ) : eruvKind ? (
    <Link href={page(`kind/${eruvKind.id}`)} className={`${primary} whitespace-nowrap`}>
      + Add an eruv
    </Link>
  ) : undefined

  const head = <AdminBack back={{ label: 'Watches', href: `${base}/watches` }} title={job?.name ?? known?.name ?? ''} right={right} />
  if (jobs.runs === null) return <div className="space-y-4">{head}<p className="text-sm text-red-700">Couldn’t load this job.</p></div>
  if (!job) return <div className="space-y-4">{head}<p className="text-sm text-muted">{known || jobs.runs === undefined ? 'Loading…' : 'No such job.'}</p></div>
  const off = jobs.runs?.off?.includes(job.id)

  async function list(id: string, action: 'pause' | 'resume') {
    setError(null)
    try {
      await fetchJson(
        withCommunity('/api/admin/watches', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id }) },
        'Could not do that.',
      )
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that.')
    }
  }
  const tracked = all ? job.tracked : job.tracked.slice(0, TRACKED_SHOWN)

  return (
    <div className="flex flex-col gap-3">
      {head}
      {adding && known && <AddToJob kind={known.id} token={token} onDone={async () => { setAdding(false); await reload() }} />}
      <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-3.5">
        <p className="m-0 text-lg font-semibold text-slate-900">{statusLine(job)}</p>
        {job.schedule && <p className="m-0 mt-0.5 text-[13px] text-slate-600">{job.schedule}</p>}
      </div>
      {job.misses.length > 0 && (
        <AdminBox title={job.id === 'links' ? 'Needs a look' : 'Not read last night'}>
          {job.misses.map((m, i) => (m.page ? <AdminRow key={i} href={page(m.page)} name={m.name} line={<span className="text-amber-800">{m.why}</span>} /> : (
            <div key={i} className="px-4 py-2.5">
              <p className="m-0 text-[15px] font-semibold text-slate-900">{m.name}</p>
              <p className="m-0 text-[13px] text-amber-800">{m.why}</p>
            </div>
          )))}
        </AdminBox>
      )}
      {job.tracked.length > 0 && (
        <AdminBox title={`All ${job.tracked.length} tracked`}>
          {tracked.map((t, i) => (t.page ? <AdminRow key={i} href={page(t.page)} name={t.name} /> : (
            <div key={i} className="flex min-h-11 items-center gap-2 px-4 py-2">
              <span className="flex-1 text-[15px] font-semibold text-slate-900">{t.name}</span>
              <span className={`text-[13px] ${t.bad ? 'text-amber-800' : 'text-slate-500'}`}>{t.status}</span>
              {t.watch && (
                <button type="button" onClick={() => void list(t.watch!.id, t.watch!.active ? 'pause' : 'resume')} className="min-h-11 cursor-pointer whitespace-nowrap text-[13px] font-semibold text-primary">
                  {t.watch.active ? 'Stop' : 'Read again'}
                </button>
              )}
            </div>
          )))}
          {job.tracked.length > TRACKED_SHOWN && (
            <button type="button" aria-expanded={all} onClick={() => setAll((a) => !a)} className="min-h-11 w-full cursor-pointer px-4 text-left text-[15px] font-semibold text-slate-900">
              {all ? 'Show fewer' : `Show all ${job.tracked.length}`}
            </button>
          )}
        </AdminBox>
      )}
      {error && <p className="m-0 text-sm text-red-700">{error}</p>}
      {job.nights.length > 0 && (
        <AdminBox title="Last 14 nights">
          <ul className="m-0 list-none p-0">
            {job.nights.map((n) => (
              <NightRow key={n.date} night={n} />
            ))}
          </ul>
        </AdminBox>
      )}
      {!off && <TurnOffJob kind={job.id} name={job.name} count={job.tracked.length} token={token} />}
    </div>
  )
}
