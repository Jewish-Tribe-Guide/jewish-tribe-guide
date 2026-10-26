import { afterEach, describe, expect, it, vi } from 'vitest'

// The job_run table, faked: what's inserted, updated and pruned, and an
// error to answer with when a test wants one.
type Call = { op: 'insert' | 'update' | 'delete' | 'select'; values?: Record<string, unknown>; filters: [string, string, unknown][] }
const db = vi.hoisted(() => ({
  calls: [] as Call[],
  error: null as { message: string } | null,
  rows: [] as Record<string, unknown>[],
  /** An error for one call alone: a column the table hasn't got. */
  errorFor: null as ((call: Call) => { message: string } | null) | null,
}))

function chain(call: Call) {
  const result = () => ({ data: call.op === 'insert' ? { id: 'run-1' } : db.rows, error: db.errorFor?.(call) ?? db.error })
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
      select: (columns: string) => {
        const call: Call = { op: 'select', values: { columns }, filters: [] }
        db.calls.push(call)
        return chain(call)
      },
    }),
  }),
}))

const sent = vi.hoisted(() => [] as unknown[])
vi.mock('./email', () => ({ sendJobAlert: async (alert: unknown) => void sent.push(alert) }))

const { recordJobRun, listJobRuns } = await import('./jobRunStore')

const START = new Date('2026-10-24T07:47:00.000Z')
const END = new Date('2026-10-24T07:49:00.000Z')
const clock = () => {
  let n = 0
  return () => (n++ === 0 ? START : END)
}

afterEach(() => {
  sent.length = 0
  db.calls.length = 0
  db.error = null
  db.errorFor = null
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

  // Oct 25: what it read of each kind, for the Watches tab's last 14 nights.
  it('saves what the run read of each kind of source', async () => {
    const kinds = { philly: { eruvs: { of: 5, read: 1 } } }
    await recordJobRun('watches', async () => null, () => ({ ok: true, summary: 'Checked 1 of 5', kinds }), clock())
    expect(db.calls.find((c) => c.op === 'update')!.values).toMatchObject({ ok: true, kinds })
  })

  it('without migration 087, saves the rest of the run', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.errorFor = (c) => (c.op === 'update' && c.values && 'kinds' in c.values ? { message: 'Could not find the \'kinds\' column of \'job_run\' in the schema cache' } : null)
    await recordJobRun('watches', async () => null, () => ({ ok: true, summary: 'Checked 1 of 5', kinds: { philly: {} } }), clock())
    const updates = db.calls.filter((c) => c.op === 'update')
    expect(updates).toHaveLength(2)
    expect(updates[1].values).toEqual({ finished_at: END.toISOString(), ok: true, summary: 'Checked 1 of 5', warning: null, error: null })
    expect(logged).not.toHaveBeenCalled()
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

  // The job's last runs as the table holds them after this one's finish.
  it('emails the admins when this run broke the job', async () => {
    db.rows = [
      { id: 'run-1', job: 'watches', started_at: START.toISOString(), finished_at: END.toISOString(), ok: false, summary: 'Stopped with an error', warning: null, error: 'boom' },
      { id: 'run-0', job: 'watches', started_at: '2026-10-23T07:47:00.000Z', finished_at: '2026-10-23T07:49:00.000Z', ok: true, summary: 'Checked 107 of 107 watches', warning: null, error: null },
    ]
    await expect(recordJobRun('watches', async () => Promise.reject(new Error('boom')), () => ({ ok: true, summary: '' }), clock())).rejects.toThrow('boom')
    expect(sent).toEqual([{ job: 'watches', name: 'Watches', broke: true, lines: ['Oct 24: boom'] }])
  })

  it('emails nothing while the job keeps working', async () => {
    db.rows = [
      { id: 'run-1', job: 'watches', started_at: START.toISOString(), finished_at: END.toISOString(), ok: true, summary: 'Checked 107', warning: null, error: null },
      { id: 'run-0', job: 'watches', started_at: '2026-10-23T07:47:00.000Z', finished_at: '2026-10-23T07:49:00.000Z', ok: true, summary: 'Checked 107', warning: null, error: null },
    ]
    await recordJobRun('watches', async () => null, () => ({ ok: true, summary: 'Checked 107' }), clock())
    expect(sent).toEqual([])
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
    expect(runs.watches).toEqual([{ id: 'r', job: 'watches', startedAt: START.toISOString(), finishedAt: null, ok: null, summary: null, warning: null, error: null, kinds: null }])
  })

  it('reads what each run read of each kind', async () => {
    db.rows = [{ id: 'r', job: 'watches', started_at: START.toISOString(), finished_at: END.toISOString(), ok: true, summary: '', warning: null, error: null, kinds: { philly: { menus: { of: 33, read: 0 } } } }]
    expect((await listJobRuns()).runs.watches[0].kinds).toEqual({ philly: { menus: { of: 33, read: 0 } } })
  })

  it('without migration 087, reads the runs without it', async () => {
    db.errorFor = (c) => (c.op === 'select' && String(c.values?.columns).includes('kinds') ? { message: 'column job_run.kinds does not exist' } : null)
    db.rows = [{ id: 'r', job: 'watches', started_at: START.toISOString(), finished_at: null, ok: null, summary: null, warning: null, error: null }]
    const { available, runs } = await listJobRuns()
    expect(available).toBe(true)
    expect(runs.watches[0]).toMatchObject({ id: 'r', kinds: null })
  })
})
