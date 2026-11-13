import { getAdminClient } from './supabase/admin'
import { NIGHTLY_JOBS, type JobId, type JobOutcome, type JobRun, type RunKinds } from './jobRuns'

// The job_run table (migration 086): each nightly job's runs (jobRuns.ts).
// Uncached: the jobs themselves and the admin Watches tab. Saving a run
// never fails the job it records: a job that worked is not made to look
// broken by its own record. Without the table, jobs run as before and
// nothing is saved. A job that just broke is told of in the next
// nightly email (nightlyEmailRun.ts, jobAlert). What a run read of each kind of
// source is saved too (`kinds`, migration 087); without that column, the
// rest still is.

/** How long a job's runs are kept. */
export const KEEP_DAYS = 60

/** How many runs of each job the tab gets back. */
export const RUNS_SHOWN = 14

type Row = {
  id: string
  job: JobId
  started_at: string
  finished_at: string | null
  ok: boolean | null
  summary: string | null
  warning: string | null
  error: string | null
  kinds?: RunKinds | null
}

function fromRow(r: Row): JobRun {
  return { id: r.id, job: r.job, startedAt: r.started_at, finishedAt: r.finished_at, ok: r.ok, summary: r.summary, warning: r.warning, error: r.error, kinds: r.kinds ?? null }
}

export function runTableMissing(message: string | undefined): boolean {
  return !!message && /\bjob_run\b/.test(message) && /(does not exist|schema cache)/.test(message)
}

/** Migration 087 not run yet. */
export function kindsColumnMissing(message: string | undefined): boolean {
  return !!message && /\bkinds\b/.test(message) && /(does not exist|schema cache)/.test(message)
}

const quietly = (what: string) => (err: unknown) => console.error(`[job-run] ${what}:`, err)

/** Saves that a run started: its id, or null when nothing could be saved. */
async function startRun(job: JobId, now: Date): Promise<string | null> {
  const db = getAdminClient()
  const { data, error } = await db.from('job_run').insert({ job, started_at: now.toISOString() }).select('id').single()
  if (error) {
    if (!runTableMissing(error.message)) console.error(`[job-run] couldn’t save ${job}’s start:`, error.message)
    return null
  }
  const before = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString()
  await db.from('job_run').delete().eq('job', job).lt('started_at', before).then(({ error: e }) => e && console.error('[job-run] prune:', e.message), quietly('prune'))
  return (data as { id: string }).id
}

const COLUMNS = 'id, job, started_at, finished_at, ok, summary, warning, error'

async function finishRun(id: string, outcome: JobOutcome, now: Date): Promise<void> {
  const row = { finished_at: now.toISOString(), ok: outcome.ok, summary: outcome.summary, warning: outcome.warning ?? null, error: outcome.error ?? null }
  const save = (r: Record<string, unknown>) => getAdminClient().from('job_run').update(r).eq('id', id)
  let { error } = await save(outcome.kinds ? { ...row, kinds: outcome.kinds } : row)
  if (error && outcome.kinds && kindsColumnMissing(error.message)) ({ error } = await save(row))
  if (error) throw new Error(error.message)
}

/** Saves the finish; never throws. A job that broke is told of in the
 *  nightly email (nightlyEmailRun.ts, from these runs). */
async function finish(job: JobId, id: string, outcome: JobOutcome, now: Date): Promise<void> {
  try {
    await finishRun(id, outcome, now)
  } catch (err) {
    quietly(`couldn’t save ${job}’s finish`)(err)
  }
}

/** Runs a job and saves how it went. `outcome` reads its result; a job
 *  that throws is saved as failed and the error passed on. A run the
 *  platform stops is left unfinished, which the tab shows as cut off. */
export async function recordJobRun<T>(job: JobId, run: () => Promise<T>, outcome: (result: T) => JobOutcome, now: () => Date = () => new Date()): Promise<T> {
  const id = await startRun(job, now()).catch((err) => (quietly(`couldn’t save ${job}’s start`)(err), null))
  let result: T
  try {
    result = await run()
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    if (id) await finish(job, id, { ok: false, summary: 'Stopped with an error', error }, now())
    throw err
  }
  if (id) await finish(job, id, outcome(result), now())
  return result
}

/** Each job's latest runs, newest first. `available` is false without
 *  migration 086. */
export async function listJobRuns(): Promise<{ available: boolean; runs: Record<JobId, JobRun[]> }> {
  const runs = Object.fromEntries(NIGHTLY_JOBS.map((j) => [j.id, [] as JobRun[]])) as Record<JobId, JobRun[]>
  const read = (columns: string) =>
    Promise.all(NIGHTLY_JOBS.map((j) => getAdminClient().from('job_run').select(columns).eq('job', j.id).order('started_at', { ascending: false }).limit(RUNS_SHOWN)))
  let results = await read(`${COLUMNS}, kinds`)
  if (results.some((r) => kindsColumnMissing(r.error?.message))) results = await read(COLUMNS)
  for (const [i, { data, error }] of results.entries()) {
    if (error) {
      if (runTableMissing(error.message)) return { available: false, runs }
      throw new Error(`Failed to load the job runs: ${error.message}`)
    }
    runs[NIGHTLY_JOBS[i].id] = ((data ?? []) as unknown as Row[]).map(fromRow)
  }
  return { available: true, runs }
}

/** Each job's last three runs, newest first, for the nightly email to
 *  tell which broke (jobAlert). None without migration 086. */
export async function recentJobRuns(): Promise<Map<JobId, JobRun[]>> {
  const out = new Map<JobId, JobRun[]>()
  const results = await Promise.all(NIGHTLY_JOBS.map((j) => getAdminClient().from('job_run').select(COLUMNS).eq('job', j.id).order('started_at', { ascending: false }).limit(3)))
  for (const [i, { data, error }] of results.entries()) {
    if (error) {
      if (runTableMissing(error.message)) return new Map()
      throw new Error(`Failed to load the job runs: ${error.message}`)
    }
    out.set(NIGHTLY_JOBS[i].id, ((data ?? []) as unknown as Row[]).map(fromRow))
  }
  return out
}
