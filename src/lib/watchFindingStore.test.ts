import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FINDING_SOURCES } from './watchFindings'

// Nov 23: a job with several watches (kosher: Keystone-K, Mekor, KCL) read
// each watch's findings on its own, twice, which Sentry flagged as an N+1
// on the Watches page. Now one read of the waiting and one of the decided,
// however many watches the job has, the findings still in watch order.

type Call = { table: string; filters: unknown[][] }
const db = vi.hoisted(() => ({ calls: [] as Call[], rows: [] as Record<string, unknown>[] }))
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const call: Call = { table, filters: [] }
      db.calls.push(call)
      const rows = () => (table === 'submission' ? db.rows.filter((r) => call.filters.every(([op, col, v]) => {
        if (op === 'eq' && col === 'status') return r.status === v
        if (op === 'neq' && col === 'status') return r.status !== v
        if (op === 'in' && col === 'submitted_by->>name') return (v as string[]).includes((r.submitted_by as { name: string }).name)
        if (op === 'eq' && col === 'submitted_by->>name') return (r.submitted_by as { name: string }).name === v
        return true
      })) : [])
      const q: Record<string, unknown> = {}
      for (const op of ['select', 'order', 'range']) q[op] = () => q
      for (const op of ['eq', 'neq', 'in']) q[op] = (col: string, v: unknown) => (call.filters.push([op, col, v]), q)
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok)
      return q
    },
  }),
}))

const { jobFindings } = await import('./watchFindingStore')

const names = FINDING_SOURCES.kosher
const row = (id: string, name: string, status = 'pending') => ({
  id, status, target_id: null, reviewed_at: null, operation: 'create', submitted_by: { name },
  payload: { name: id, category: 'restaurant' }, created_at: `2026-11-0${id.slice(1)}T00:00:00Z`,
})

beforeEach(() => {
  db.calls.length = 0
  // Newest first by date, and the second watch's before the first's.
  db.rows = [row('s1', names[1]), row('s2', names[0]), row('s3', names[2]), row('s4', names[0], 'approved')]
})

describe('jobFindings', () => {
  it('reads all of a job’s watches at once: one read waiting, one decided', async () => {
    expect(names.length).toBeGreaterThan(1)
    await jobFindings('philly', 'kosher', [])
    expect(db.calls.filter((c) => c.table === 'submission')).toHaveLength(2)
  })

  it('still lists them a watch at a time, in the job’s order', async () => {
    const { findings } = await jobFindings('philly', 'kosher', [])
    expect(findings.map((f) => f.id)).toEqual(['s2', 's1', 's3'])
  })
})
