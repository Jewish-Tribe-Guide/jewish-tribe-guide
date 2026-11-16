import { beforeEach, describe, expect, it, vi } from 'vitest'

// The one row every server reads (migration 100). A missing table or a
// failed read must leave the check on its old fingerprint, and a failed
// bump must never fail the admin's save.

let row: { changed_at: string } | null = { changed_at: '2026-11-16T18:00:00.000Z' }
let readError: { message: string } | null = null
const upsert = vi.fn(async (_r: unknown) => ({ error: null as { message: string } | null }))

vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: readError }) }) }),
      upsert,
    }),
  }),
}))

const { bumpContentStamp, readContentStamp } = await import('./contentStamp')

beforeEach(() => {
  row = { changed_at: '2026-11-16T18:00:00.000Z' }
  readError = null
  upsert.mockClear()
})

describe('content stamp', () => {
  it('reads as a short version that moves when the row does', async () => {
    const first = await readContentStamp()
    row = { changed_at: '2026-11-16T18:00:01.000Z' }
    const second = await readContentStamp()
    expect(first).toMatch(/^s:[0-9a-z]+$/)
    expect(second).not.toBe(first)
  })

  it('is null with no table or no row, so the check falls back', async () => {
    readError = { message: 'relation "public.content_stamp" does not exist' }
    expect(await readContentStamp()).toBeNull()
    readError = null
    row = null
    expect(await readContentStamp()).toBeNull()
  })

  it('bumps the one row to now, and a failed bump throws nothing', async () => {
    await bumpContentStamp()
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'all' }))
    upsert.mockResolvedValueOnce({ error: { message: 'no table' } })
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(bumpContentStamp()).resolves.toBeUndefined()
    quiet.mockRestore()
  })
})
