'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { hoursJobCategories } from '@/lib/hoursJob'
import type { NightKindId } from '@/lib/jobRuns'
import { NIGHT_KINDS, type NightKindView } from '@/lib/nightKinds'
import { jobPlaceRows, type JobPlaceRow } from '@/lib/jobPlaceRows'
import { jobTitle } from '@/lib/keptCurrent'
import { pageFrom } from '@/lib/placeLink'
import { kindOf } from '@/lib/placeKinds'
import { JOB_STEPS, lastRunWord } from '@/lib/watchJobList'
import { AdminBack, AdminBox, AdminRow, adminInputClass } from './AdminUI'
import { useAdminApi } from './useAdminApi'
import { noteJobSwitched, useWatchJobsAndReload } from './useWatchJobs'

// A Watches row, opened (board W4, Nov 25): when it last read, Nothing to
// read (each place with why, in amber), Read (each with what it's read
// from), and Turn off this job, or Turn it back on once off. Adds from its
// header. The last-14-nights box and Not read last night went: Nothing to
// read says the same per place, and Watches' row says when the job ran.

export type NightlyRunsLoaded = { available: boolean; kinds: NightKindView[]; off?: NightKindId[] }

const button = 'inline-flex items-center justify-center min-h-11 px-3.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60'
const primary = `${button} border border-primary bg-primary text-white`
const secondary = `${button} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`

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

/** The one way to stop a job here. It says what stopping costs before it
 *  does; what the job checked then counts as Not checked. */
export function TurnOffJob({ kind, name, count, token }: { kind: NightKindId; name: string; count: number; token: string }) {
  const community = useCommunitySlug()
  const api = useAdminApi(token)
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function turnOff() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/admin/watches', { action: 'job-off', kind }, 'Could not turn it off.')
      noteJobSwitched(community, kind, true)
      router.push(`${adminBase(community)}/watches`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn it off.')
      setBusy(false)
    }
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="min-h-11 cursor-pointer self-start text-[0.9375rem] font-semibold text-red-700">
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

/** Under the title: "Read every night · last night", or what's wrong
 *  with the job itself; with no run yet, the job's own step. */
function subtitle(job: NightKindView, off: boolean, now: number): { text: string; bad: boolean } {
  if (off) return { text: 'Turned off', bad: false }
  const whole = job.fixes.find((f) => f.whole)
  if (whole) return { text: whole.why, bad: true }
  if (!job.lastAt) return { text: job.tracked.length ? 'Not run yet' : (JOB_STEPS[job.id] ?? 'Not run yet'), bad: false }
  const nightly = job.id !== 'links'
  const word = lastRunWord(job.lastAt, now, nightly)
  return { text: `${nightly ? 'Read every night' : 'Read every Sunday'} · ${/^(Last|Today|Yesterday)/.test(word) ? word[0].toLowerCase() + word.slice(1) : word}`, bad: false }
}

/** Read rows shown before "Show all" (board W4). */
const READ_SHOWN = 6

function TurnOnJob({ kind, token }: { kind: NightKindId; token: string }) {
  const community = useCommunitySlug()
  const api = useAdminApi(token)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function turnOn() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/admin/watches', { action: 'job-on', kind }, 'Could not turn it on.')
      noteJobSwitched(community, kind, false)
      router.push(`${adminBase(community)}/watches`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn it on.')
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={busy} onClick={() => void turnOn()} className={`${primary} self-start`}>
        {busy ? 'Turning on…' : 'Turn it back on'}
      </button>
      {error && <p className="m-0 text-sm text-red-700">{error}</p>}
    </div>
  )
}

export default function JobPage({ token, id }: { token: string; id: string }) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const api = useAdminApi(token)
  const { jobs, reload } = useWatchJobsAndReload(token)
  const [now] = useState(() => Date.now())
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
    <Link href={`${base}/places?add=${encodeURIComponent(eruvKind.id)}`} className={`${primary} whitespace-nowrap`}>
      + Add an eruv
    </Link>
  ) : undefined

  const name = job ?? known
  const title = name ? jobTitle(name.id, name.name) : ''
  const off = !!job && !!jobs.runs?.off?.includes(job.id)
  const sub = job && jobs.runs ? subtitle(job, off, now) : null
  const head = (
    <div className="flex flex-col gap-1">
      <AdminBack back={{ label: 'Watches', href: `${base}/watches` }} title={title} right={right} />
      {sub && <p className={`m-0 text-[0.9375rem] ${sub.bad ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>{sub.text}</p>}
    </div>
  )
  if (jobs.runs === null) return <div className="space-y-4">{head}<p className="text-sm text-red-700">Couldn’t load this job.</p></div>
  if (!job) return <div className="space-y-4">{head}<p className="text-sm text-muted">{known || jobs.runs === undefined ? 'Loading…' : 'No such job.'}</p></div>

  async function list(id: string, action: 'pause' | 'resume') {
    setError(null)
    try {
      await api.post('/api/admin/watches', { action, id }, 'Could not do that.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that.')
    }
  }
  const places = job.id === 'times' ? jobs.times?.places : job.id === 'hours' ? jobs.hours?.places : null
  const { missing, read } = jobPlaceRows(job.id, { tracked: job.tracked, places, eruvim: job.id === 'eruvs' ? jobs.eruvim?.eruvim : null })
  const shown = all ? read : read.slice(0, READ_SHOWN)
  const opens = (p: string) => page(pageFrom(p, `job/${job.id}`))
  const row = (r: JobPlaceRow, tone: string) =>
    r.page ? (
      <AdminRow key={r.key} href={opens(r.page)} name={r.name} line={<span className={tone}>{r.line}</span>} />
    ) : (
      <div key={r.key} className="flex min-h-11 items-center gap-2 px-4 py-2">
        <span className="flex flex-1 flex-col">
          <span className="text-[0.9375rem] font-semibold text-slate-900">{r.name}</span>
          <span className={`text-[0.8125rem] ${tone}`}>{r.line}</span>
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
      {head}
      {adding && known && <AddToJob kind={known.id} token={token} onDone={async () => { setAdding(false); await reload() }} />}
      {missing.length > 0 && <AdminBox title={`Nothing to read · ${missing.length}`}>{missing.map((r) => row(r, 'font-semibold text-amber-800'))}</AdminBox>}
      {read.length > 0 && (
        <AdminBox title={`Read · ${read.length}`}>
          {shown.map((r) => row(r, 'text-slate-600'))}
          {read.length > READ_SHOWN && (
            <button type="button" aria-expanded={all} onClick={() => setAll((a) => !a)} className="min-h-11 w-full cursor-pointer px-4 text-left text-[0.9375rem] font-semibold text-primary">
              {all ? 'Show fewer' : `Show all ${read.length}`}
            </button>
          )}
        </AdminBox>
      )}
      {error && <p className="m-0 text-sm text-red-700">{error}</p>}
      {off ? <TurnOnJob kind={job.id} token={token} /> : <TurnOffJob kind={job.id} name={title} count={job.tracked.length} token={token} />}
    </div>
  )
}
