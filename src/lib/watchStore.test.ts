import { beforeEach, describe, expect, it, vi } from 'vitest'

// Migration 085 adds `last_check`, what a watch's last full read found. The
// live database runs the code before the migration, and the daily run must
// keep working there: without the column, the watches are listed and every
// run saved, less what it found.
const m = vi.hoisted(() => ({ hasColumn: true, selects: [] as string[], updates: [] as Record<string, unknown>[] }))
const missing = { message: 'column watch.last_check does not exist' }
const row = { id: 'w1', community_id: 'philly', kind: 'website', url: 'https://x.org/', resource_id: null, label: null, active: true, created_at: 'c', created_by: null, last_run_at: null, last_ok_at: null, last_error: null, failing_since: null, last_filed: null, page_hash: null, page_changed_at: null }
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      let cols = ''
      let patch: Record<string, unknown> | null = null
      const result = () => {
        if (patch) {
          if (!m.hasColumn && 'last_check' in patch) return { data: null, error: missing }
          m.updates.push(patch)
          return { data: null, error: null }
        }
        m.selects.push(cols)
        if (!m.hasColumn && cols.includes('last_check')) return { data: null, error: missing }
        return { data: [m.hasColumn ? { ...row, last_check: { result: 'agrees' } } : row], error: null }
      }
      const q: Record<string, unknown> = {
        select: (c: string) => ((cols = c), q),
        update: (p: Record<string, unknown>) => ((patch = p), q),
        eq: () => q,
        order: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok),
      }
      return q
    },
  }),
}))

const { listWatches, updateWatch } = await import('./watchStore')

beforeEach(() => {
  m.hasColumn = true
  m.selects = []
  m.updates = []
})

describe('watchStore and migration 085', () => {
  it('reads what the last full read found', async () => {
    expect((await listWatches('philly')).watches[0].lastCheck).toEqual({ result: 'agrees' })
  })

  it('lists the watches without the column, rather than saying the table is missing', async () => {
    m.hasColumn = false
    const { watches, available } = await listWatches('philly')
    expect(available).toBe(true)
    expect(watches[0]).toMatchObject({ id: 'w1', lastCheck: null })
  })

  it('saves a run without the column, less what it found', async () => {
    m.hasColumn = false
    await updateWatch('philly', 'w1', { lastRunAt: 'now', lastCheck: { result: 'agrees' } as never })
    expect(m.updates).toEqual([{ last_run_at: 'now' }])
  })

  it('saves what it found when the column is there', async () => {
    await updateWatch('philly', 'w1', { lastRunAt: 'now', lastCheck: { result: 'agrees' } as never })
    expect(m.updates).toEqual([{ last_run_at: 'now', last_check: { result: 'agrees' } }])
  })
})
