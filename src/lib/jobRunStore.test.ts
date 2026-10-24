import { afterEach, describe, expect, it, vi } from 'vitest'

// The job_run table, faked: what's inserted, updated and pruned, and an
// error to answer with when a test wants one.
type Call = { op: 'insert' | 'update' | 'delete' | 'select'; values?: Record<string, unknown>; filters: [string, string, unknown][] }
const db = vi.hoisted(() => ({ calls: [] as Call[], error: null as { message: string } | null, rows: [] as Record<string, unknown>[] }))

function chain(call: Call) {
  const result = () => ({ data: call.op === 'insert' ? { id: 'run-1' } : db.rows, error: db.error })
  const c: Record<string, unknown> = {
    select: () => c,
    single: () => Promise.resolve(result()),
    eq: (col: string, v: unknown) => (call.filters.push(['eq', col, v]), c),
    lt: (col: string, v: unknown) => (call.filters.push(['lt', col, v]), c),
    order: () => c,
    limit: () => Promise.resolve(result()),
    then: (ok: (r: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad),
  }
  return c
}

vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      insert: (values: Record<string, unknown>) => {
        const call: Call = { op: 'insert', values, filters: [] }
        db.calls.push(call)
        return chain(call)
      },
      update: (values: Record<string, unknown>) => {
        const call: Call = { op: 'update', values, filters: [] }
        db.calls.push(call)
        return chain(call)
      },
      delete: () => {
        const call: Call = { op: 'delete', filters: [] }
        db.calls.push(call)
        return chain(call)
      },
      select: () => chain({ op: 'select', filters: [] }),
    }),
  }),
}))

const { recordJobRun, listJobRuns } = await import('./jobRunStore')

const START = new Date('2026-10-24T07:47:00.000Z')
const END = new Date('2026-10-24T07:49:00.000Z')
const clock = () => {
  let n = 0
  return () => (n++ === 0 ? START : END)
}

afterEach(() => {
  db.calls.length = 0
  db.error = null
  db.rows = []
  vi.restoreAllMocks()
})

describe('recordJobRun', () => {
  it('saves the start, then the finish with what the run did', async () => {
    const result = await recordJobRun('watches', async () => ({ ran: 107 }), (r) => ({ ok: true, summary: `Checked ${r.ran}` }), clock())
    expect(result).toEqual({ ran: 107 })
    expect(db.calls[0]).toMatchObject({ op: 'insert', values: { job: 'watches', started_at: START.toISOString() } })
    const finish = db.calls.find((c) => c.op === 'update')!
    expect(finish.values).toEqual({ finished_at: END.toISOString(), ok: true, summary: 'Checked 107', warning: null, error: null })
    expect(finish.filters).toEqual([['eq', 'id', 'run-1']])
  })

  it('keeps 60 days of the job’s runs', async () => {
    await recordJobRun('walk-routes', async () => null, () => ({ ok: true, summary: '' }), clock())
    const prune = db.calls.find((c) => c.op === 'delete')!
    expect(prune.filters).toEqual([
      ['eq', 'job', 'walk-routes'],
      ['lt', 'started_at', '2026-08-25T07:47:00.000Z'],
    ])
  })

  it('a job that throws is saved as failed, and the error passed on', async () => {
    await expect(recordJobRun('sync-hours', async () => Promise.reject(new Error('Google answered 403')), () => ({ ok: true, summary: '' }), clock())).rejects.toThrow('Google answered 403')
    expect(db.calls.find((c) => c.op === 'update')!.values).toMatchObject({ ok: false, error: 'Google answered 403' })
  })

  // Before migration 086, or with the database down: the job runs as
  // before, and its record never makes it look broken.
  it('runs the job when nothing can be saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.error = { message: 'relation "public.job_run" does not exist' }
    const run = vi.fn(async () => 'done')
    await expect(recordJobRun('read-menus', run, () => ({ ok: true, summary: '' }), clock())).resolves.toBe('done')
    expect(run).toHaveBeenCalledTimes(1)
    expect(db.calls.some((c) => c.op === 'update')).toBe(false)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('a save that fails is logged, not thrown', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.error = { message: 'connection reset' }
    await expect(recordJobRun('watches', async () => 'done', () => ({ ok: true, summary: '' }), clock())).resolves.toBe('done')
    expect(logged).toHaveBeenCalled()
  })
})

describe('listJobRuns', () => {
  it('says when migration 086 hasn’t been run', async () => {
    db.error = { message: 'Could not find the table \'public.job_run\' in the schema cache' }
    expect((await listJobRuns()).available).toBe(false)
  })

  it('each job’s runs, as the tab reads them', async () => {
    db.rows = [{ id: 'r', job: 'watches', started_at: START.toISOString(), finished_at: null, ok: null, summary: null, warning: null, error: null }]
    const { available, runs } = await listJobRuns()
    expect(available).toBe(true)
    expect(runs.watches).toEqual([{ id: 'r', job: 'watches', startedAt: START.toISOString(), finishedAt: null, ok: null, summary: null, warning: null, error: null }])
  })
})
