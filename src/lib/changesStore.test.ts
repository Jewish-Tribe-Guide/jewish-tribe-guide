import { beforeEach, describe, expect, it, vi } from 'vitest'

// The log read for What changed, against a fake client: every `select` is
// answered by `answer(table, columns)`.
const m = vi.hoisted(() => ({ answer: (() => ({ data: [], error: null })) as (table: string, columns: string) => { data: unknown; error: unknown }, selects: [] as [string, string][] }))
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      let columns = ''
      const b: Record<string, unknown> = {}
      b.select = (c: string) => {
        columns = c
        m.selects.push([table, c])
        return b
      }
      for (const name of ['eq', 'in', 'order', 'limit']) b[name] = () => b
      b.then = (resolve: (v: unknown) => void) => resolve(m.answer(table, columns))
      return b
    },
  }),
}))
vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))

const { listChangeLogUncached } = await import('./changesStore')

const logRow = { id: 1, created_at: '2026-10-01T22:00:00Z', kind: 'listing_edited', source: 'submission', item: null, field_key: null, submission_id: null, resource_id: 'bj' }
const changes = [{ key: 'hours', label: 'Hours', value: 'Sunday 11 AM – 10 PM' }]
const missing = (column: string) => ({ data: null, error: { message: `column activity.${column} does not exist` } })

beforeEach(() => {
  m.selects = []
})

describe('reading the log for What changed', () => {
  it('reads what each edit changed, and whether it’s hidden', async () => {
    m.answer = (table) => (table === 'activity' ? { data: [{ ...logRow, hidden_at: null, changes }], error: null } : { data: [{ id: 'bj', name: 'Ben & Jerry’s', category: 'restaurant', status: 'approved' }], error: null })
    const [row] = await listChangeLogUncached('philly')
    expect(row).toMatchObject({ id: 1, changes, hidden: false, fieldKey: null, listing: { name: 'Ben & Jerry’s' } })
  })

  it('before migration 069 (no changes) and 068 (no hidden_at), reads what’s there', async () => {
    m.answer = (table, columns) => {
      if (table !== 'activity') return { data: [], error: null }
      if (columns.includes('changes')) return missing('changes')
      if (columns.includes('hidden_at')) return missing('hidden_at')
      return { data: [logRow], error: null }
    }
    const [row] = await listChangeLogUncached('philly')
    expect(row).toMatchObject({ id: 1, changes: null, hidden: false })
    expect(m.selects.filter(([t]) => t === 'activity')).toHaveLength(3)
  })

  it('any other failure says so', async () => {
    m.answer = () => ({ data: null, error: { message: 'permission denied' } })
    await expect(listChangeLogUncached('philly')).rejects.toThrow(/Could not read the activity log: permission denied/)
  })
})
