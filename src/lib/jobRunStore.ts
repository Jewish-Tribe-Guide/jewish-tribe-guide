import { reportServerError } from './serverError'
import { schemaMissing } from './supabase/schemaMissing'
import { cronHeartbeat } from './cronHeartbeat'
import { getAdminClient } from './supabase/admin'
import { NIGHTLY_JOBS, type JobId, type JobOutcome, type JobRun, type RunKinds } from './jobRuns'

// The job_run table (migration 086): each nightly job's runs (jobRuns.ts).
// Uncached: the jobs themselves and the admin Watches tab. Saving a run
// never fails the job it records: a job that worked is not made to look
// broken by its own record. Without the table, jobs run as before and
// nothing is saved. A job that just broke is told of in the next
// nightly email (nightlyEmailRun.ts, jobAlert). What a run read of each kind of
// source is saved too (`kinds`, migration 087); without that column, the
// rest still is. Which community a run was for is saved too
// (`community_id`, migration 101): the watches run once per community;
// every other job's runs are the whole site's (null). Without that column,
// runs save and read as one list.

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
  return schemaMissing('job_run', message)
}

/** Migration 101 not run yet. */
export function communityColumnMissing(message: string | undefined): boolean {
  return schemaMissing('community_id', message)
}

/** A community's runs and the whole site's: `community_id` null or its own. */
export const ownOrSiteRuns = (community: string) => `community_id.is.null,community_id.eq."${community.replace(/["\\]/g, '')}"`

/** Migration 087 not run yet. */
export function kindsColumnMissing(message: string | undefined): boolean {
  return schemaMissing('kinds', message)
}

const quietly = (what: string) => (err: unknown) => console.error(`[job-run] ${what}:`, err)

/** Saves that a run started: its id, or null when nothing could be saved. */
async function startRun(job: JobId, now: Date, community?: string): Promise<string | null> {
  const db = getAdminClient()
  const insert = (row: Record<string, unknown>) => db.from('job_run').insert(row).select('id').single()
  const row = { job, started_at: now.toISOString() }
  let { data, error } = await insert(community ? { ...row, community_id: community } : row)
  if (error && community && communityColumnMissing(error.message)) ({ data, error } = await insert(row))
  if (error) {
    if (!runTableMissing(error.message)) console.error(`[job-run] couldn’t save ${job}’s start:`, error.message)
    return null
  }
  const before = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString()
  await db.from('job_run').delete().eq('job', job).lt('started_at', before).then(({ error: e }) => e && console.error('[job-run] prune:', e.message), quietly('prune'))
  return (data as { id: string }).id
}

const COLUMNS = 'id, job, started_at, finished_at, ok, summary, warning, error'

/** Each job's latest `limit` runs, a query a job: a community's own and the
 *  whole site's when `community` is given. Falls back without the columns
 *  migrations 087 (kinds) and 101 (community_id) add. */
async function latestRuns(limit: number, community: string | undefined, withKinds: boolean) {
  const read = (kinds: boolean, own: boolean) =>
    Promise.all(
      NIGHTLY_JOBS.map((j) => {
        const q = getAdminClient().from('job_run').select(kinds ? `${COLUMNS}, kinds` : COLUMNS).eq('job', j.id)
        return (own && community ? q.or(ownOrSiteRuns(community)) : q).order('started_at', { ascending: false }).limit(limit)
      }),
    )
  let kinds = withKinds
  let own = !!community
  let results = await read(kinds, own)
  if (own && results.some((r) => communityColumnMissing(r.error?.message))) results = await read(kinds, (own = false))
  if (kinds && results.some((r) => kindsColumnMissing(r.error?.message))) results = await read((kinds = false), own)
  return results
}

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
export function recordJobRun<T>(job: JobId, run: () => Promise<T>, outcome: (result: T) => JobOutcome, now: () => Date = () => new Date(), community?: string): Promise<T> {
  // A community's own watches run is one of several the cron's one call
  // starts: that call is the job's heartbeat (cron/watches).
  const go = () => recordRun(job, run, outcome, now, community)
  return community ? go() : cronHeartbeat(job, go)
}

async function recordRun<T>(job: JobId, run: () => Promise<T>, outcome: (result: T) => JobOutcome, now: () => Date, community?: string): Promise<T> {
  const id = await startRun(job, now(), community).catch((err) => (quietly(`couldn’t save ${job}’s start`)(err), null))
  let result: T
  try {
    result = await run()
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    reportServerError(`[job ${job}] stopped with an error${community ? ` (${community})` : ''}:`, err)
    if (id) await finish(job, id, { ok: false, summary: 'Stopped with an error', error }, now())
    throw err
  }
  const told = outcome(result)
  // Told of beyond the Watches tab and the nightly email, which is itself a
  // job and can be the one that broke (Nov 20, the health sweep).
  if (!told.ok) reportServerError(`[job ${job}] failed${community ? ` (${community})` : ''}:`, told.error || told.summary)
  if (id) await finish(job, id, told, now())
  return result
}

/** Each job's latest runs, newest first: with `community`, its own runs
 *  and the whole site's, never another community's. `available` is false
 *  without migration 086. */
export async function listJobRuns(community?: string): Promise<{ available: boolean; runs: Record<JobId, JobRun[]> }> {
  const runs = Object.fromEntries(NIGHTLY_JOBS.map((j) => [j.id, [] as JobRun[]])) as Record<JobId, JobRun[]>
  const results = await latestRuns(RUNS_SHOWN, community, true)
  for (const [i, { data, error }] of results.entries()) {
    if (error) {
      if (runTableMissing(error.message)) return { available: false, runs }
      throw new Error(`Failed to load the job runs: ${error.message}`)
    }
    runs[NIGHTLY_JOBS[i].id] = ((data ?? []) as unknown as Row[]).map(fromRow)
  }
  return { available: true, runs }
}

/** Each job's last three runs, newest first, for a community's nightly
 *  email to tell which broke (jobAlert): its own and the whole site's.
 *  None without migration 086. */
export async function recentJobRuns(community?: string): Promise<Map<JobId, JobRun[]>> {
  const out = new Map<JobId, JobRun[]>()
  const results = await latestRuns(3, community, false)
  for (const [i, { data, error }] of results.entries()) {
    if (error) {
      if (runTableMissing(error.message)) return new Map()
      throw new Error(`Failed to load the job runs: ${error.message}`)
    }
    out.set(NIGHTLY_JOBS[i].id, ((data ?? []) as unknown as Row[]).map(fromRow))
  }
  return out
}
