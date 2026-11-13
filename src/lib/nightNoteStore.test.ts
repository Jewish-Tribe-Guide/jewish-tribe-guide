import { beforeEach, describe, expect, it, vi } from 'vitest'

// Google's status changes, kept for the nightly email (migration 096).

const db = vi.hoisted(() => ({ inserted: [] as unknown[], rows: [] as unknown[], error: null as { message: string } | null }))

vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const c: Record<string, unknown> = {
        insert: (rows: unknown[]) => (db.inserted.push(...rows), Promise.resolve({ error: db.error })),
        delete: () => c,
        lt: () => Promise.resolve({ error: null }),
        select: () => c,
        eq: () => c,
        gte: () => c,
        order: () => Promise.resolve({ data: db.rows, error: db.error }),
      }
      return c
    },
  }),
}))

const { keepStatusChanges, statusChangesSince } = await import('./nightNoteStore')

const MISSING = { message: 'Could not find the table \'public.night_note\' in the schema cache' }
const change = { name: 'Hakol', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_TEMPORARILY', communitySlug: 'philly' }

beforeEach(() => {
  db.inserted = []
  db.rows = []
  db.error = null
})

describe('keepStatusChanges', () => {
  it('keeps each change for its community', async () => {
    expect(await keepStatusChanges([change])).toBe(true)
    expect(db.inserted).toEqual([expect.objectContaining({ community_id: 'philly', kind: 'google-status', body: { name: 'Hakol', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_TEMPORARILY' } })])
  })

  it('says so without the table, so the caller emails them now', async () => {
    db.error = MISSING
    expect(await keepStatusChanges([change])).toBe(false)
  })

  it('any other failure throws', async () => {
    db.error = { message: 'permission denied' }
    await expect(keepStatusChanges([change])).rejects.toThrow('permission denied')
  })
})

describe('statusChangesSince', () => {
  it('reads them back as changes of that community', async () => {
    db.rows = [{ body: { name: 'Hakol', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_TEMPORARILY' }, created_at: '2026-11-13T06:01:00Z' }]
    expect(await statusChangesSince('philly', '2026-11-12T09:45:00Z')).toEqual([change])
  })

  it('none without the table', async () => {
    db.error = MISSING
    expect(await statusChangesSince('philly', '2026-11-12T09:45:00Z')).toEqual([])
  })
})
