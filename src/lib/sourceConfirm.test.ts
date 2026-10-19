import { beforeEach, describe, expect, it, vi } from 'vitest'

// The watches' agreement dates a listing (the user, Oct 19: Keystone-K's
// list was read every day, and its places still said Oct 18).

const m = vi.hoisted(() => ({
  rows: [] as { id: string; details: Record<string, unknown> | null }[],
  writes: [] as { id: string; details: Record<string, unknown>; filter: string }[],
  revalidateTag: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag: m.revalidateTag }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      let write: { id?: string; details?: Record<string, unknown>; filter?: string } | null = null
      const q = {
        select: () => q,
        in: () => q,
        update: (v: { details: Record<string, unknown> }) => ((write = { details: v.details }), q),
        eq: (col: string, val: string) => {
          if (write && col === 'id') write.id = val
          else if (write) write.filter = `${col}=${val}`
          return q
        },
        is: (col: string, val: null) => {
          if (write) write.filter = `${col} is ${val}`
          return q
        },
        then: (ok: (v: unknown) => unknown) => {
          if (!write) return Promise.resolve({ data: m.rows, error: null }).then(ok)
          m.writes.push(write as never)
          return Promise.resolve({ data: [{ id: write.id }], error: null }).then(ok)
        },
      }
      return q
    },
  }),
}))

const { confirmFromSource, datedBySource } = await import('./sourceConfirm')

const NOW = '2026-10-19T07:47:31.000Z'

beforeEach(() => {
  m.rows = []
  m.writes = []
  m.revalidateTag.mockClear()
})

describe('datedBySource', () => {
  it('dates it by the source, in place of whoever dated it before', () => {
    expect(datedBySource({ name: 'x', confirmedAt: '2026-10-18T00:00:00Z', confirmedBy: { by: 'edit', at: '2026-10-18T00:00:00Z' } }, 'Keystone-K', NOW)).toEqual({
      name: 'x',
      confirmedAt: NOW,
      confirmedFrom: { from: 'Keystone-K', at: NOW },
    })
    expect(datedBySource({}, 'Refuah', NOW)).toMatchObject({ confirmedAt: NOW, confirmedFrom: { from: 'Refuah', at: NOW } })
  })
  it('leaves a date it gave in the last half day, and one later than now', () => {
    expect(datedBySource({ confirmedAt: '2026-10-19T03:00:00Z', confirmedFrom: { from: 'Keystone-K' } }, 'Keystone-K', NOW)).toBeNull()
    expect(datedBySource({ confirmedAt: '2026-10-19T09:00:00Z' }, 'Keystone-K', NOW)).toBeNull()
    // Someone else's from this morning moves: the source read it since.
    expect(datedBySource({ confirmedAt: '2026-10-19T03:00:00Z', confirmedFrom: { from: 'Mekor Habracha' } }, 'Keystone-K', NOW)).not.toBeNull()
  })
})

describe('confirmFromSource', () => {
  it('writes each only while its date is still the one read, then refreshes the listings once', async () => {
    m.rows = [
      { id: 'a', details: { confirmedAt: '2026-10-18T00:00:50.603Z' } },
      { id: 'b', details: null },
      { id: 'c', details: { confirmedAt: '2026-10-19T03:00:00Z', confirmedFrom: { from: 'Keystone-K' } } },
    ]
    expect(await confirmFromSource('philly', ['a', 'b', 'c', 'a'], 'Keystone-K', NOW)).toBe(2)
    expect(m.writes.map((w) => [w.id, w.filter, w.details.confirmedAt])).toEqual([
      ['a', 'details->>confirmedAt=2026-10-18T00:00:50.603Z', NOW],
      ['b', 'details->>confirmedAt is null', NOW],
    ])
    expect(m.revalidateTag).toHaveBeenCalledTimes(1)
    expect(m.revalidateTag).toHaveBeenCalledWith('resources:philly', 'max')
  })
  it('does nothing for no listings', async () => {
    expect(await confirmFromSource('philly', [], 'Keystone-K', NOW)).toBe(0)
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })
})
