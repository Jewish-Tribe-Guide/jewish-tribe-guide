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

/** The kinds of source the tab gives a line each (nightKinds.ts). */
export type NightKindId = 'google' | 'kosher' | 'hospitals' | 'eruvs' | 'times' | 'newsletters' | 'hours' | 'sites' | 'menus' | 'other'

/** How many of a kind's sources a run had, and how many it read. */
export type KindCount = { of: number; read: number }

/** job_run.kinds (migration 087): per community, per kind. */
export type RunKinds = Record<string, Partial<Record<NightKindId, KindCount>>>

/** What a run ends with. `warning`: it worked, but didn't get to
 *  everything, or wasn't set up. `kinds`: what it read of each kind. */
export type JobOutcome = { ok: boolean; summary: string; warning?: string | null; error?: string | null; kinds?: RunKinds | null }

export type JobRun = {
  id: string
  job: JobId
  startedAt: string
  finishedAt: string | null
  ok: boolean | null
  summary: string | null
  warning: string | null
  error: string | null
  /** Saved since migration 087; null before it, and on older runs. */
  kinds?: RunKinds | null
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
  | { ok: true; total: number; refreshed: number; synced: number; failed: number; flaggedClosed: number; statusChanged: number; kinds?: RunKinds }
  | { ok: false; error: string }

export function syncHoursOutcome(run: SyncHoursRun): JobOutcome {
  if (!run.ok) return { ok: false, summary: 'Couldn’t read the listings', error: run.error }
  const parts = [`Asked Google about ${plural(run.total, 'listing')}`, `refreshed ${run.refreshed}`]
  if (run.statusChanged) parts.push(`${plural(run.statusChanged, 'listing')} opened or closed`)
  return { ok: true, summary: parts.join(' · '), warning: run.failed ? `${plural(run.failed, 'listing')} couldn’t be asked` : null, kinds: run.kinds ?? null }
}

export type WatchesRun = { active: number; ran: number; notWorking: number; left: number; kinds?: RunKinds }

export function watchesOutcome(run: WatchesRun): JobOutcome {
  const parts = [`Checked ${run.ran} of ${plural(run.active, 'watch', 'watches')}`]
  if (run.notWorking) parts.push(`${run.notWorking} not working`)
  return { ok: true, summary: parts.join(' · '), warning: run.left ? `Ran out of time: ${run.left} left for the next night` : null, kinds: run.kinds ?? null }
}

/** readUnreadMenus's, per community. */
export type MenuReadRun = readonly { community: string; read: number; left: number }[]

/** `kinds`: per community, of the menus never read, how many it read
 *  (the Watches tab's Menus line). */
export function readMenusOutcome(run: { skipped: string } | { menus: MenuReadRun }): JobOutcome {
  if ('skipped' in run) return { ok: true, summary: 'Nothing read', warning: `Not set up: ${run.skipped}` }
  const read = sum(run.menus, (m) => m.read)
  const left = sum(run.menus, (m) => m.left)
  const kinds: RunKinds = Object.fromEntries(run.menus.map((m) => [m.community, { menus: { of: m.read + m.left, read: m.read } }]))
  if (!read && !left) return { ok: true, summary: 'No menus left to read', kinds }
  return { ok: true, summary: [`Read ${plural(read, 'menu')}`, left && `${left} left for the next nights`].filter(Boolean).join(' · '), kinds }
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

// ── Telling the admins (Oct 24) ─────────────────────────────────────────────
// As a broken watch is: one email when a job stops working, one when it
// works again, nothing on the nights between. Worked out at the end of
// each run from the job's last three. A run cut off can't send anything,
// so the next run tells of it. A job that stops running altogether sends
// nothing: only the tab shows that.

/** What was wrong with a run, or null. The latest run has just finished,
 *  so only an older one can be cut off. */
function problemOf(run: JobRun | undefined, latest: boolean): string | null {
  if (!run) return null
  if (!run.finishedAt) return latest ? null : 'stopped before it finished'
  if (run.ok === false) return run.error || 'stopped with an error'
  return run.warning || null
}

/** `broke`: it isn't working now; otherwise it works again. */
export type JobAlert = { job: JobId; name: string; broke: boolean; lines: string[] }

const runDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })

/** `runs`: the job's latest first, the first just finished. */
export function jobAlert(job: Pick<NightlyJob, 'id' | 'name'>, runs: readonly JobRun[]): JobAlert | null {
  const [now, before, earlier] = runs
  if (!now) return null
  const lines: string[] = []
  // The run before was cut off, and nobody was told: the one before it was fine.
  if (before && !before.finishedAt && !problemOf(earlier, false)) lines.push(`${runDay(before.startedAt)}: stopped before it finished`)
  const problem = problemOf(now, true)
  const was = problemOf(before, false)
  if (problem && !was) lines.push(`${runDay(now.startedAt)}: ${problem}`)
  else if (!problem && was) lines.push(`${runDay(now.startedAt)}: working again${now.summary ? ` (${now.summary})` : ''}`)
  // Broken is how it is now: cut off and then fine is working again.
  return lines.length ? { job: job.id, name: job.name, broke: !!problem, lines } : null
}
