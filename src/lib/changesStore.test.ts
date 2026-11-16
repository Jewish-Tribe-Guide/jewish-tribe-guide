import { beforeEach, describe, expect, it, vi } from 'vitest'

// The log read for What changed, against a fake client: every `select` is
// answered by `answer(table, columns, ins)`, `ins` being its `.in()` filters.
type Answer = (table: string, columns: string, ins: Record<string, readonly string[]>) => { data: unknown; error: unknown }
const m = vi.hoisted(() => ({ answer: (() => ({ data: [], error: null })) as Answer, selects: [] as [string, string][] }))
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      let columns = ''
      const ins: Record<string, readonly string[]> = {}
      const b: Record<string, unknown> = {}
      b.select = (c: string) => {
        columns = c
        m.selects.push([table, c])
        return b
      }
      for (const name of ['eq', 'order', 'limit', 'range']) b[name] = () => b
      b.in = (column: string, values: readonly string[]) => {
        ins[column] = values
        return b
      }
      b.then = (resolve: (v: unknown) => void) => resolve(m.answer(table, columns, ins))
      return b
    },
  }),
}))
vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))

const { listChangeLogUncached } = await import('./changesStore')

const logRow = { id: 1, created_at: '2026-10-01T22:00:00Z', kind: 'listing_edited', source: 'submission', item: null, field_key: null, submission_id: null, resource_id: 'bj' }
const changes = [{ key: 'hours', label: 'Hours', value: 'Sunday 11 AM – 10 PM' }]
const bj = { id: 'bj', name: 'Ben & Jerry’s', category: 'restaurant', status: 'approved' }
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
      if (table !== 'activity') return { data: [bj], error: null }
      if (columns.includes('changes')) return missing('changes')
      if (columns.includes('hidden_at')) return missing('hidden_at')
      return { data: [logRow], error: null }
    }
    const [row] = await listChangeLogUncached('philly')
    expect(row).toMatchObject({ id: 1, changes: null, hidden: false })
    expect(m.selects.filter(([t]) => t === 'activity')).toHaveLength(3)
  })

  // Dev shares its project with the write suites, whose fixtures' rows
  // (4,307 in two weeks, Nov 15, on listings deleted again) filled the 400
  // newest and left the page empty. It reads only rows on listings the
  // community has, newest first across every chunk of them.
  it('reads only rows on listings the community has, newest first, so deleted test listings can’t crowd them out', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ id: `l${i}`, name: `Place ${i}`, category: 'restaurant', status: 'approved' }))
    const log = [
      ...Array.from({ length: 500 }, (_, i) => ({ ...logRow, id: 1000 + i, created_at: '2026-11-15T12:00:00Z', resource_id: `gone-${i}` })),
      { ...logRow, id: 1, created_at: '2026-11-01T10:00:00Z', resource_id: 'l3' },
      { ...logRow, id: 2, created_at: '2026-11-02T10:00:00Z', resource_id: 'l240' },
    ]
    m.answer = (table, _columns, ins) => {
      if (table === 'resource') return { data: many, error: null }
      const allowed = ins.resource_id ?? []
      return { data: log.filter((r) => allowed.includes(r.resource_id)).slice(0, 400), error: null }
    }
    const rows = await listChangeLogUncached('philly')
    expect(rows.map((r) => [r.id, r.listing?.name])).toEqual([
      [2, 'Place 240'],
      [1, 'Place 3'],
    ])
  })

  it('reads each place’s own picture, for its row (board W9)', async () => {
    m.answer = (table) => (table === 'activity' ? { data: [logRow], error: null } : { data: [{ ...bj, photo: 'https://x/bj.jpeg' }], error: null })
    const [row] = await listChangeLogUncached('philly')
    expect(m.selects.find(([t]) => t === 'resource')?.[1]).toContain('photo:details->>photo')
    expect(row!.listing).toMatchObject({ photo: 'https://x/bj.jpeg' })
  })

  it('any other failure says so', async () => {
    m.answer = (table) => (table === 'resource' ? { data: [bj], error: null } : { data: null, error: { message: 'permission denied' } })
    await expect(listChangeLogUncached('philly')).rejects.toThrow(/Could not read the activity log: permission denied/)
  })
})
