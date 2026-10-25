import { describe, expect, it } from 'vitest'
import { jobAlert, jobHealth, LATE_AFTER_MS, needsLook, readMenusOutcome, syncHoursOutcome, walkRoutesOutcome, watchesOutcome, type JobRun } from './jobRuns'

const NOW = Date.parse('2026-10-24T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000

function run(over: Partial<JobRun>): JobRun {
  return { id: 'r', job: 'watches', startedAt: ago(4 * 3_600_000), finishedAt: ago(4 * 3_600_000 - MIN), ok: true, summary: 'Checked 107 of 107 watches', warning: null, error: null, ...over }
}

const job = { limitSeconds: 300 }

describe('jobHealth: how a nightly job’s last run went', () => {
  it('a run that finished and worked', () => {
    expect(jobHealth(job, [run({})], NOW)).toEqual({ state: 'ok' })
  })

  it('no run yet', () => {
    expect(jobHealth(job, [], NOW)).toEqual({ state: 'never' })
  })

  // Oct 24: the watches run was stopped by the platform, so it never saved
  // its finish. That must show, not read as a quiet night.
  it('a run never finished, well past its time limit, was cut off', () => {
    const started = run({ startedAt: ago(10 * MIN), finishedAt: null, ok: null })
    expect(jobHealth(job, [started], NOW)).toEqual({ state: 'cut off' })
    expect(needsLook(jobHealth(job, [started], NOW))).toBe(true)
  })

  it('a run inside its time limit is still running', () => {
    expect(jobHealth(job, [run({ startedAt: ago(2 * MIN), finishedAt: null, ok: null })], NOW)).toEqual({ state: 'running' })
  })

  it('a run that ended with an error failed, with the error', () => {
    expect(jobHealth(job, [run({ ok: false, error: 'Google answered 403' })], NOW)).toEqual({ state: 'failed', error: 'Google answered 403' })
  })

  it('a run that worked but didn’t get to everything needs a look', () => {
    const h = jobHealth(job, [run({ warning: 'Ran out of time: 27 left for the next night' })], NOW)
    expect(h).toEqual({ state: 'warning', warning: 'Ran out of time: 27 left for the next night' })
    expect(needsLook(h)).toBe(true)
  })

  // A missed night means the schedule itself stopped, whatever the run
  // before it did.
  it('no run for more than a day and a few hours: it didn’t run', () => {
    const old = run({ startedAt: ago(LATE_AFTER_MS + MIN), finishedAt: ago(LATE_AFTER_MS) })
    expect(jobHealth(job, [old], NOW)).toEqual({ state: 'late', since: old.startedAt })
  })

  it('a run started late in its hour the night before is not late', () => {
    expect(jobHealth(job, [run({ startedAt: ago(25 * 3_600_000) })], NOW)).toEqual({ state: 'ok' })
  })

  it('only the latest run counts', () => {
    expect(jobHealth(job, [run({}), run({ ok: false, error: 'x' })], NOW)).toEqual({ state: 'ok' })
  })
})

describe('each job’s run, in a line', () => {
  it('watches: how many of how many, and what ran out of time', () => {
    expect(watchesOutcome({ active: 107, ran: 107, notWorking: 0, left: 0 })).toEqual({ ok: true, summary: 'Checked 107 of 107 watches', warning: null, kinds: null })
    expect(watchesOutcome({ active: 107, ran: 80, notWorking: 2, left: 27 })).toEqual({
      ok: true,
      summary: 'Checked 80 of 107 watches · 2 not working',
      warning: 'Ran out of time: 27 left for the next night',
      kinds: null,
    })
    expect(watchesOutcome({ active: 1, ran: 1, notWorking: 0, left: 0, kinds: { philly: { eruvs: { of: 1, read: 1 } } } }).kinds).toEqual({ philly: { eruvs: { of: 1, read: 1 } } })
  })

  it('Google hours: what it asked, and what it couldn’t', () => {
    expect(syncHoursOutcome({ ok: true, total: 140, refreshed: 20, synced: 138, failed: 2, flaggedClosed: 1, statusChanged: 1 })).toEqual({
      ok: true,
      summary: 'Asked Google about 140 listings · refreshed 20 · 1 listing opened or closed',
      warning: '2 listings couldn’t be asked',
      kinds: null,
    })
    expect(syncHoursOutcome({ ok: false, error: 'db down' })).toMatchObject({ ok: false, error: 'db down' })
  })

  it('menus: read and left, or not set up', () => {
    expect(readMenusOutcome({ menus: [{ community: 'philly', read: 3, left: 20 }] })).toEqual({
      ok: true,
      summary: 'Read 3 menus · 20 left for the next nights',
      kinds: { philly: { menus: { of: 23, read: 3 } } },
    })
    expect(readMenusOutcome({ menus: [] })).toMatchObject({ ok: true, summary: 'No menus left to read' })
    expect(readMenusOutcome({ skipped: 'no OPENAI_API_KEY' })).toMatchObject({ warning: 'Not set up: no OPENAI_API_KEY' })
  })

  it('walks: worked out, nothing new, or not set up', () => {
    const r = (over: object) => ({ listings: 30, asked: 0, walks: 0, failed: 0, leftForTomorrow: 0, ...over })
    expect(walkRoutesOutcome({ ok: true, results: { philly: r({}) } })).toEqual({ ok: true, summary: 'Nothing new to work out', warning: null })
    expect(walkRoutesOutcome({ ok: true, results: { philly: r({ walks: 12, failed: 3, leftForTomorrow: 5 }) } })).toEqual({
      ok: true,
      summary: 'Worked out 12 walks · 5 left for the next night',
      warning: '3 walks couldn’t be worked out',
    })
    expect(walkRoutesOutcome({ ok: true, skipped: 'OPENROUTESERVICE_API_KEY is not set' })).toMatchObject({ warning: 'Not set up: OPENROUTESERVICE_API_KEY is not set' })
  })
})

describe('jobAlert: emailing once when a job breaks, once when it works again', () => {
  const JOB = { id: 'watches' as const, name: 'Watches' }
  const night = (n: number, over: Partial<JobRun> = {}) =>
    run({ id: `n${n}`, startedAt: `2026-10-${String(24 - n).padStart(2, '0')}T07:47:00.000Z`, finishedAt: `2026-10-${String(24 - n).padStart(2, '0')}T07:49:00.000Z`, ...over })
  const fine = night
  const failed = (n: number) => night(n, { ok: false, error: 'Google answered 403' })
  const cutOff = (n: number) => night(n, { finishedAt: null, ok: null, summary: null })

  it('nothing while it keeps working', () => {
    expect(jobAlert(JOB, [fine(0), fine(1), fine(2)])).toBeNull()
  })

  it('the night it breaks, with why', () => {
    expect(jobAlert(JOB, [failed(0), fine(1)])).toEqual({ job: 'watches', name: 'Watches', broke: true, lines: ['Oct 24: Google answered 403'] })
  })

  it('a job’s first run breaking', () => {
    expect(jobAlert(JOB, [failed(0)])).toMatchObject({ broke: true })
  })

  it('nothing on the nights it stays broken', () => {
    expect(jobAlert(JOB, [failed(0), failed(1), fine(2)])).toBeNull()
  })

  it('the night it works again', () => {
    expect(jobAlert(JOB, [fine(0), failed(1)])).toEqual({ job: 'watches', name: 'Watches', broke: false, lines: ['Oct 24: working again (Checked 107 of 107 watches)'] })
  })

  it('a run that ran out of time is a break too', () => {
    expect(jobAlert(JOB, [night(0, { warning: 'Ran out of time: 27 left for the next night' }), fine(1)])).toMatchObject({ broke: true, lines: ['Oct 24: Ran out of time: 27 left for the next night'] })
  })

  // A run cut off can't send anything: the next one tells of it.
  it('the next run tells of a run cut off, and that it works again', () => {
    expect(jobAlert(JOB, [fine(0), cutOff(1), fine(2)])).toEqual({
      job: 'watches',
      name: 'Watches',
      broke: false,
      lines: ['Oct 23: stopped before it finished', 'Oct 24: working again (Checked 107 of 107 watches)'],
    })
  })

  it('a run cut off, then one that failed: one email, still broken', () => {
    expect(jobAlert(JOB, [failed(0), cutOff(1), fine(2)])).toEqual({ job: 'watches', name: 'Watches', broke: true, lines: ['Oct 23: stopped before it finished'] })
  })

  it('cut off night after night: told once', () => {
    expect(jobAlert(JOB, [night(0, { warning: 'x' }), cutOff(1), cutOff(2)])).toBeNull()
  })
})
