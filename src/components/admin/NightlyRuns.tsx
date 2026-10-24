'use client'

import { useState } from 'react'
import { jobHealth, type JobHealth, type JobRun, type NightlyJob } from '@/lib/jobRuns'

// ── The Watches tab's "Nightly runs" (Oct 24) ───────────────────────────────
// A row per job that runs on its own every night (jobRuns.ts): how it
// works, what its last run did, and, without opening anything, when it
// failed, was cut off or didn't run. Tapping a row opens the runs before.

export type NightlyJobLoaded = NightlyJob & { runs: JobRun[] }
export type NightlyRunsLoaded = { available: boolean; jobs: NightlyJobLoaded[] }

const PILL: Record<'ok' | 'bad' | 'todo' | 'off', string> = {
  ok: 'bg-green-50 text-green-800',
  bad: 'bg-red-50 text-red-700',
  todo: 'bg-amber-50 text-amber-800',
  off: 'bg-slate-100 text-slate-600',
}

function pillOf(h: JobHealth): { tone: keyof typeof PILL; text: string } {
  switch (h.state) {
    case 'ok':
      return { tone: 'ok', text: 'Worked' }
    case 'warning':
      return { tone: 'todo', text: 'Needs a look' }
    case 'failed':
      return { tone: 'bad', text: 'Failed' }
    case 'cut off':
      return { tone: 'bad', text: 'Cut off' }
    case 'late':
      return { tone: 'bad', text: 'Didn’t run' }
    case 'running':
      return { tone: 'off', text: 'Running' }
    case 'never':
      return { tone: 'off', text: 'Not run yet' }
  }
}

function when(iso: string, now: number): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const today = new Date(now).toDateString() === d.toDateString()
  return today ? `Today ${time}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

/** What the last run did, or what's wrong, in a line. */
function LastLine({ health, last, now }: { health: JobHealth; last: JobRun | undefined; now: number }) {
  if (!last) return <span className="block text-sm text-slate-500">No run recorded yet.</span>
  const at = when(last.startedAt, now)
  switch (health.state) {
    case 'late':
      return <span className="block text-sm font-medium text-red-700">Hasn&rsquo;t run since {when(health.since, now)}.</span>
    case 'cut off':
      return <span className="block text-sm font-medium text-red-700">{at}: stopped before it finished.</span>
    case 'failed':
      return <span className="block text-sm font-medium text-red-700">{at}: {health.error}</span>
    case 'running':
      return <span className="block text-sm text-slate-700">{at}: running now.</span>
    default:
      return (
        <span className="block text-sm text-slate-700">
          {at} · {last.summary}
          {health.state === 'warning' && <span className="block font-medium text-amber-800">{health.warning}</span>}
        </span>
      )
  }
}

function runLine(run: JobRun): string {
  if (!run.finishedAt) return 'Didn’t finish'
  if (run.ok === false) return run.error || 'Failed'
  return [run.summary, run.warning].filter(Boolean).join(' · ')
}

function JobRow({ job, now }: { job: NightlyJobLoaded; now: number }) {
  const [open, setOpen] = useState(false)
  const health = jobHealth(job, job.runs, now)
  const pill = pillOf(health)
  return (
    <li className="px-4 py-3" data-testid="nightly-job">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="block w-full cursor-pointer text-left">
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block font-semibold text-slate-900">{job.name}</span>
            <span className="block text-xs text-muted">{job.about}</span>
            <LastLine health={health} last={job.runs[0]} now={now} />
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[pill.tone]}`}>{pill.text}</span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`text-slate-400 ${open ? 'rotate-180' : ''}`}>
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
        </span>
      </button>
      {open &&
        (job.runs.length > 1 ? (
          <ul className="mt-2 space-y-1" aria-label={`${job.name}: earlier runs`}>
            {job.runs.slice(1).map((r) => (
              <li key={r.id} className="flex gap-3 text-sm">
                <span className="w-32 shrink-0 text-slate-500">{when(r.startedAt, now)}</span>
                <span className={!r.finishedAt || r.ok === false ? 'text-red-700' : r.warning ? 'text-amber-800' : 'text-slate-700'}>{runLine(r)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{job.runs.length ? 'No earlier runs.' : 'Its first run is tonight.'}</p>
        ))}
    </li>
  )
}

/** `runs`: undefined while loading, null when it couldn't be loaded. */
export default function NightlyRuns({ runs, now }: { runs: NightlyRunsLoaded | null | undefined; now: number }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white" aria-label="Nightly runs">
      <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-900">Nightly runs</h2>
      {runs === undefined ? (
        <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>
      ) : runs === null ? (
        <p className="px-4 py-3 text-sm text-slate-500">Couldn&rsquo;t load the nightly runs.</p>
      ) : !runs.available ? (
        <p className="px-4 py-3 text-sm text-amber-800">Keeping a record of the nightly runs needs database migration 086.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {runs.jobs.map((j) => (
            <JobRow key={j.id} job={j} now={now} />
          ))}
        </ul>
      )}
    </section>
  )
}
