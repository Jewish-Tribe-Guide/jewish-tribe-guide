import { getAdminClient } from './supabase/admin'
import { NIGHTLY_JOBS, type JobId, type JobOutcome, type JobRun } from './jobRuns'

// The job_run table (migration 086): each nightly job's runs (jobRuns.ts).
// Uncached: the jobs themselves and the admin Watches tab. Saving a run
// never fails the job it records: a job that worked is not made to look
// broken by its own record. Without the table, jobs run as before and
// nothing is saved.

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
}

function fromRow(r: Row): JobRun {
  return { id: r.id, job: r.job, startedAt: r.started_at, finishedAt: r.finished_at, ok: r.ok, summary: r.summary, warning: r.warning, error: r.error }
}

export function runTableMissing(message: string | undefined): boolean {
  return !!message && /\bjob_run\b/.test(message) && /(does not exist|schema cache)/.test(message)
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

async function finishRun(id: string, outcome: JobOutcome, now: Date): Promise<void> {
  const { error } = await getAdminClient()
    .from('job_run')
    .update({ finished_at: now.toISOString(), ok: outcome.ok, summary: outcome.summary, warning: outcome.warning ?? null, error: outcome.error ?? null })
    .eq('id', id)
  if (error) console.error('[job-run] couldn’t save the finish:', error.message)
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
    if (id) await finishRun(id, { ok: false, summary: 'Stopped with an error', error }, now()).catch(quietly('finish'))
    throw err
  }
  if (id) await finishRun(id, outcome(result), now()).catch(quietly('finish'))
  return result
}

/** Each job's latest runs, newest first. `available` is false without
 *  migration 086. */
export async function listJobRuns(): Promise<{ available: boolean; runs: Record<JobId, JobRun[]> }> {
  const runs = Object.fromEntries(NIGHTLY_JOBS.map((j) => [j.id, [] as JobRun[]])) as Record<JobId, JobRun[]>
  const results = await Promise.all(
    NIGHTLY_JOBS.map((j) =>
      getAdminClient().from('job_run').select('id, job, started_at, finished_at, ok, summary, warning, error').eq('job', j.id).order('started_at', { ascending: false }).limit(RUNS_SHOWN),
    ),
  )
  for (const [i, { data, error }] of results.entries()) {
    if (error) {
      if (runTableMissing(error.message)) return { available: false, runs }
      throw new Error(`Failed to load the job runs: ${error.message}`)
    }
    runs[NIGHTLY_JOBS[i].id] = ((data ?? []) as Row[]).map(fromRow)
  }
  return { available: true, runs }
}
