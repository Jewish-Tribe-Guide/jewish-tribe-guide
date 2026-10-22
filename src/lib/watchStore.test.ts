import { beforeEach, describe, expect, it, vi } from 'vitest'

// Migration 085 adds `last_check`, what a watch's last full read found. The
// live database runs the code before the migration, and the daily run must
// keep working there: without the column, the watches are listed and every
// run saved, less what it found.
const m = vi.hoisted(() => ({ listRead: null as unknown, hasColumn: true, selects: [] as string[], updates: [] as Record<string, unknown>[] }))
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
        if (cols.includes('->listRead')) return { data: [{ id: 'w1', listRead: m.listRead }, { id: 'w2', listRead: null }], error: null }
        return { data: [m.hasColumn ? { ...row, last_check: { result: 'agrees', ...(m.listRead ? { listRead: m.listRead } : {}) } } : row], error: null }
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

const { getListReads, listWatches, updateWatch } = await import('./watchStore')

beforeEach(() => {
  m.listRead = null
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

// A kosher list's run keeps what it read (watches.ts ListRead) so the
// Kosher page needn't read the list again; nothing else carries it around.
describe('a list’s kept read', () => {
  const read = { updated: null, entries: [{ name: 'Sweet Lizzy' }] }

  it('is left off the watches as listed', async () => {
    m.listRead = read
    expect((await listWatches('philly')).watches[0].lastCheck).toEqual({ result: 'agrees' })
  })

  it('is read on its own, by watch', async () => {
    m.listRead = read
    expect(await getListReads('philly')).toEqual(new Map([['w1', read]]))
  })

  it('reads as none without the column', async () => {
    m.hasColumn = false
    expect(await getListReads('philly')).toEqual(new Map())
  })
})
