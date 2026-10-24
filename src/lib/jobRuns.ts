import type { WalkRouteRun } from './walkRouteJob'

// ── The nightly jobs and how each run went (Oct 24) ─────────────────────────
// Four jobs run on their own every night (vercel.json). Each run is saved
// in job_run (migration 086, jobRunStore.ts) when it starts and filled in
// when it ends, so the Watches tab can say what each one did, and when one
// failed, was cut off, or didn't run at all. Before this, only the watches
// kept anything, on each watch: the run that stopped after 29 of 107 of
// them on Oct 24 looked like a quiet morning. Pure: the tab reads it too.

export type JobId = 'sync-hours' | 'watches' | 'read-menus' | 'walk-routes'

export type NightlyJob = {
  id: JobId
  name: string
  /** How it works, for the tab: a line. */
  about: string
  /** The route's own time limit (maxDuration). A run not finished well
   *  past it was cut off. */
  limitSeconds: number
}

/** In the order they run (vercel.json's hours). */
export const NIGHTLY_JOBS: readonly NightlyJob[] = [
  {
    id: 'sync-hours',
    name: 'Google hours',
    about: 'Asks Google whether each listing is still open, and refreshes a seventh of their hours, phones and websites.',
    limitSeconds: 300,
  },
  {
    id: 'watches',
    name: 'Watches',
    about: 'Checks every watch below, most important first. What one couldn’t reach goes first the next night.',
    limitSeconds: 300,
  },
  {
    id: 'read-menus',
    name: 'Menus',
    about: 'Reads a few menus never read yet. Once read, each menu’s watch keeps it current.',
    limitSeconds: 60,
  },
  {
    id: 'walk-routes',
    name: 'Walks',
    about: 'Works out walking times along the streets. Most are done when a listing is approved; this catches up on the rest.',
    limitSeconds: 60,
  },
]

/** What a run ends with. `warning`: it worked, but didn't get to
 *  everything, or wasn't set up. */
export type JobOutcome = { ok: boolean; summary: string; warning?: string | null; error?: string | null }

export type JobRun = {
  id: string
  job: JobId
  startedAt: string
  finishedAt: string | null
  ok: boolean | null
  summary: string | null
  warning: string | null
  error: string | null
}

/** A daily job is late once a day and a few hours have gone by: Vercel
 *  starts a cron any time within its hour. */
export const LATE_AFTER_MS = 30 * 3_600_000

export type JobHealth =
  | { state: 'never' }
  | { state: 'running' }
  | { state: 'late'; since: string }
  | { state: 'cut off' }
  | { state: 'failed'; error: string }
  | { state: 'warning'; warning: string }
  | { state: 'ok' }

/** The latest run first. A missed night outranks how the run before it
 *  went: the job itself has stopped. */
export function jobHealth(job: Pick<NightlyJob, 'limitSeconds'>, runs: readonly JobRun[], now: number): JobHealth {
  const last = runs[0]
  if (!last) return { state: 'never' }
  const started = Date.parse(last.startedAt)
  if (now - started > LATE_AFTER_MS) return { state: 'late', since: last.startedAt }
  if (!last.finishedAt) return now - started > (job.limitSeconds + 60) * 1000 ? { state: 'cut off' } : { state: 'running' }
  if (last.ok === false) return { state: 'failed', error: last.error || 'It stopped with an error.' }
  if (last.warning) return { state: 'warning', warning: last.warning }
  return { state: 'ok' }
}

export const needsLook = (h: JobHealth) => h.state === 'late' || h.state === 'cut off' || h.state === 'failed' || h.state === 'warning'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const sum = <T,>(xs: readonly T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0)

// ── Each job's run, in a line ───────────────────────────────────────────────

export type SyncHoursRun =
  | { ok: true; total: number; refreshed: number; synced: number; failed: number; flaggedClosed: number; statusChanged: number }
  | { ok: false; error: string }

export function syncHoursOutcome(run: SyncHoursRun): JobOutcome {
  if (!run.ok) return { ok: false, summary: 'Couldn’t read the listings', error: run.error }
  const parts = [`Asked Google about ${plural(run.total, 'listing')}`, `refreshed ${run.refreshed}`]
  if (run.statusChanged) parts.push(`${plural(run.statusChanged, 'listing')} opened or closed`)
  return { ok: true, summary: parts.join(' · '), warning: run.failed ? `${plural(run.failed, 'listing')} couldn’t be asked` : null }
}

export type WatchesRun = { active: number; ran: number; notWorking: number; left: number }

export function watchesOutcome(run: WatchesRun): JobOutcome {
  const parts = [`Checked ${run.ran} of ${plural(run.active, 'watch', 'watches')}`]
  if (run.notWorking) parts.push(`${run.notWorking} not working`)
  return { ok: true, summary: parts.join(' · '), warning: run.left ? `Ran out of time: ${run.left} left for the next night` : null }
}

/** readUnreadMenus's, per community. */
export type MenuReadRun = readonly { read: number; left: number }[]

export function readMenusOutcome(run: { skipped: string } | { menus: MenuReadRun }): JobOutcome {
  if ('skipped' in run) return { ok: true, summary: 'Nothing read', warning: `Not set up: ${run.skipped}` }
  const read = sum(run.menus, (m) => m.read)
  const left = sum(run.menus, (m) => m.left)
  if (!read && !left) return { ok: true, summary: 'No menus left to read' }
  return { ok: true, summary: [`Read ${plural(read, 'menu')}`, left && `${left} left for the next nights`].filter(Boolean).join(' · ') }
}

export function walkRoutesOutcome(run: WalkRouteRun): JobOutcome {
  if ('skipped' in run) return { ok: true, summary: 'Nothing worked out', warning: `Not set up: ${run.skipped}` }
  const results = Object.values(run.results)
  const walks = sum(results, (r) => r.walks)
  const failed = sum(results, (r) => r.failed)
  const left = sum(results, (r) => r.leftForTomorrow)
  const parts = [walks ? `Worked out ${plural(walks, 'walk')}` : 'Nothing new to work out']
  if (left) parts.push(`${left} left for the next night`)
  return { ok: true, summary: parts.join(' · '), warning: failed ? `${plural(failed, 'walk')} couldn’t be worked out` : null }
}
