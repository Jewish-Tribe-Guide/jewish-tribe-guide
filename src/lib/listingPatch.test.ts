import { beforeEach, describe, expect, it, vi } from 'vitest'

// patchListing sends only what changed (Nov 21, the details move): a job's
// whole `details` written back used to wipe whatever was saved between its
// read and its write.

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  writes: [] as { update: Record<string, unknown>; filters: string[] }[],
  writeResult: { data: [{ id: 'r1' }], error: null } as { data: unknown; error: { message: string } | null },
}))
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    rpc: m.rpc,
    from: () => {
      const write = { update: {} as Record<string, unknown>, filters: [] as string[] }
      const q = {
        update: (v: Record<string, unknown>) => ((write.update = v), m.writes.push(write), q),
        eq: (col: string, val: string) => (write.filters.push(`${col}=${val}`), q),
        is: (col: string) => (write.filters.push(`${col} is null`), q),
        select: () => Promise.resolve(m.writeResult),
      }
      return q
    },
  }),
}))
vi.mock('./serverError', () => ({ reportServerError: vi.fn() }))

const { diffDetails, patchListing } = await import('./listingPatch')
const { forgetSaidSchema } = await import('./supabase/schemaMissing')

beforeEach(() => {
  m.rpc.mockReset()
  m.rpc.mockResolvedValue({ data: true, error: null })
  m.writes = []
  m.writeResult = { data: [{ id: 'r1' }], error: null }
  forgetSaidSchema()
})

describe('diffDetails', () => {
  it('sets what is new or different, unsets what is gone, and leaves the rest out', () => {
    expect(
      diffDetails(
        { hours: '9-5', googleSyncedAt: 'a', geo: { lat: 1, lng: 2 }, gone: 'x', alsoGone: null },
        { hours: '9-5', googleSyncedAt: 'b', geo: { lat: 1, lng: 2 }, added: ['y'], skipped: undefined },
      ),
    ).toEqual({ set: { googleSyncedAt: 'b', added: ['y'] }, unset: ['gone', 'alsoGone'] })
  })
  it('a nested change sends the whole key', () => {
    expect(diffDetails({ sectionConfirmed: { a: '1', b: '2' } }, { sectionConfirmed: { a: '1', b: '3' } })).toEqual({
      set: { sectionConfirmed: { a: '1', b: '3' } },
      unset: [],
    })
  })
})

describe('patchListing', () => {
  it('sends only the keys that changed, never the listing’s other details', async () => {
    const before = { hours: '9-5', phoneNote: 'ask for Moshe', googleSyncedAt: 'a', lastSyncError: 'x' }
    const after = { hours: '9-5', phoneNote: 'ask for Moshe', googleSyncedAt: 'b' }
    expect(await patchListing('philly', 'r1', before, after, { columns: { name: 'New' } })).toBe(true)
    expect(m.rpc).toHaveBeenCalledWith('patch_resource_details', {
      p_community: 'philly',
      p_id: 'r1',
      p_set: { googleSyncedAt: 'b' },
      p_unset: ['lastSyncError'],
      p_columns: { name: 'New' },
      p_if: null,
    })
    expect(m.writes).toEqual([])
  })
  it('passes the guard, and says when the listing moved since', async () => {
    m.rpc.mockResolvedValue({ data: false, error: null })
    expect(await patchListing('philly', 'r1', {}, { a: 1 }, { ifStill: { 'sectionConfirmed.kosher': null } })).toBe(false)
    expect(m.rpc.mock.calls[0][1].p_if).toEqual({ 'sectionConfirmed.kosher': null })
  })
  it('writes nothing when nothing changed', async () => {
    expect(await patchListing('philly', 'r1', { a: 1 }, { a: 1 })).toBe(true)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('throws a failed write', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    await expect(patchListing('philly', 'r1', {}, { a: 1 })).rejects.toThrow('timeout')
    expect(m.writes).toEqual([])
  })

  describe('where migration 111 hasn’t run', () => {
    beforeEach(() => {
      m.rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.patch_resource_details(p_columns, p_community, p_id, p_if, p_set, p_unset) in the schema cache' } })
    })
    it('writes the whole details as before, with the columns, and says the migration is missing', async () => {
      const { reportServerError } = await import('./serverError')
      expect(await patchListing('philly', 'r1', { a: 1 }, { b: 2 }, { columns: { phone: null } })).toBe(true)
      expect(m.writes).toEqual([{ update: { phone: null, details: { b: 2 } }, filters: ['community_id=philly', 'id=r1'] }])
      expect(reportServerError).toHaveBeenCalledWith(expect.stringContaining('patch_resource_details'))
    })
    it('keeps the guard, as filters', async () => {
      await patchListing('philly', 'r1', {}, { b: 2 }, { ifStill: { 'sectionConfirmed.kosher': 'd1', 'sectionConfirmed.weekday': null, confirmedAt: 'd2' } })
      expect(m.writes[0].filters).toEqual([
        'community_id=philly',
        'id=r1',
        'details->sectionConfirmed->>kosher=d1',
        'details->sectionConfirmed->>weekday is null',
        'details->>confirmedAt=d2',
      ])
    })
    it('false when no listing matched', async () => {
      m.writeResult = { data: [], error: null }
      expect(await patchListing('philly', 'r1', {}, { b: 2 })).toBe(false)
    })
  })
})
