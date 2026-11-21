import * as Sentry from '@sentry/nextjs'
import { NIGHTLY_JOBS, type JobId } from './jobRuns'

// ── A heartbeat outside the site (Nov 20, the health sweep) ─────────────────
// A nightly job that never starts writes nothing: no run in the Watches tab,
// no error, and the nightly email that would tell of it is a job too. So
// each job checks in with Sentry's cron monitors as it starts and ends, and
// Sentry, which runs nowhere near this site, emails when a check-in is late
// or a run fails.
//
// Off until SENTRY_CRON_MONITORS=on in Vercel's production settings: Sentry
// bills for monitors past its free allowance, so that's the owner's call.
// Sentry itself only runs on the live deployment (instrumentation.ts), so
// anywhere else this only runs the job. Each monitor is created on its
// first check-in, from the job's own schedule here.

//
// SENTRY_CRON_MONITORS is `on` for every job, or the jobs to watch by id,
// comma-separated. The plan has one monitor (Nov 21), so live sets it to
// `nightly-email`: that email already tells of any other job that failed or
// didn't run (nightlyEmailRun.ts), so the one thing nothing watched was the
// email itself.

/** Whether job `job` checks in with Sentry, from SENTRY_CRON_MONITORS. */
export function monitored(job: JobId, setting = process.env.SENTRY_CRON_MONITORS): boolean {
  const value = setting?.trim()
  if (!value) return false
  if (value === 'on') return true
  return value.split(',').some((id) => id.trim() === job)
}

/** Runs `fn` as job `job`'s check-in, when its monitor is on. */
export function cronHeartbeat<T>(job: JobId, fn: () => Promise<T>): Promise<T> {
  const spec = NIGHTLY_JOBS.find((j) => j.id === job)
  if (!monitored(job) || !spec) return fn()
  return Sentry.withMonitor(`job-${job}`, fn, {
    schedule: { type: 'crontab', value: spec.cron },
    timezone: 'Etc/UTC',
    // Late after half an hour; stopped after its own limit and a minute.
    checkinMargin: 30,
    maxRuntime: Math.ceil(spec.limitSeconds / 60) + 1,
  })
}
