import { beforeEach, describe, expect, it, vi } from 'vitest'

// The rows every server reads (migration 100). A missing table or a failed
// read must leave the check on its old fingerprint, and a failed bump must
// never fail the admin's save.

let rows: Record<string, string> = {}
let readError: { message: string } | null = null
const upsert = vi.fn(async (_r: unknown) => ({ error: null as { message: string } | null }))

vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => ({
          data: readError ? null : ids.filter((id) => id in rows).map((id) => ({ changed_at: rows[id] })),
          error: readError,
        }),
      }),
      upsert,
    }),
  }),
}))

const { bumpContentStamp, readContentStamp } = await import('./contentStamp')

beforeEach(() => {
  rows = { all: '2026-11-16T18:00:00.000Z' }
  readError = null
  upsert.mockClear()
})

describe('content stamp', () => {
  it('reads as a short version that moves when the row does', async () => {
    const first = await readContentStamp('philly')
    rows.all = '2026-11-16T18:00:01.000Z'
    const second = await readContentStamp('philly')
    expect(first).toMatch(/^s:[0-9a-z]+$/)
    expect(second).not.toBe(first)
  })

  it('is null with no table or no row, so the check falls back', async () => {
    readError = { message: 'relation "public.content_stamp" does not exist' }
    expect(await readContentStamp('philly')).toBeNull()
    readError = null
    rows = {}
    expect(await readContentStamp('philly')).toBeNull()
  })

  // Nov 20: a save moves its own community's row, so a tab open on another
  // community isn't told to re-render for a change it can't see.
  it('moves for its own community’s save and not for another’s', async () => {
    const philly = await readContentStamp('philly')
    const ues = await readContentStamp('ues')
    rows['c:philly'] = '2026-11-20T09:00:00.000Z'
    expect(await readContentStamp('philly')).not.toBe(philly)
    expect(await readContentStamp('ues')).toBe(ues)
  })

  it('takes whichever of its own and every community’s moved last', async () => {
    rows['c:philly'] = '2026-11-20T09:00:00.000Z'
    const before = await readContentStamp('philly')
    rows.all = '2026-11-20T10:00:00.000Z'
    expect(await readContentStamp('philly')).not.toBe(before)
    expect(await readContentStamp('ues')).toBe(await readContentStamp('philly'))
  })

  it('bumps the named communities’ rows, or every community’s when none are named', async () => {
    await bumpContentStamp(['philly'])
    expect(upsert).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'c:philly' })])
    await bumpContentStamp()
    expect(upsert).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'all' })])
  })

  it('throws nothing when the bump fails', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'no table' } })
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(bumpContentStamp(['philly'])).resolves.toBeUndefined()
    quiet.mockRestore()
  })
})
