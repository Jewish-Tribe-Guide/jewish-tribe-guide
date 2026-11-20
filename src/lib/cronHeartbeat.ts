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

/** Runs `fn` as job `job`'s check-in, when monitors are on. */
export function cronHeartbeat<T>(job: JobId, fn: () => Promise<T>): Promise<T> {
  const spec = NIGHTLY_JOBS.find((j) => j.id === job)
  if (process.env.SENTRY_CRON_MONITORS !== 'on' || !spec) return fn()
  return Sentry.withMonitor(`job-${job}`, fn, {
    schedule: { type: 'crontab', value: spec.cron },
    timezone: 'Etc/UTC',
    // Late after half an hour; stopped after its own limit and a minute.
    checkinMargin: 30,
    maxRuntime: Math.ceil(spec.limitSeconds / 60) + 1,
  })
}
