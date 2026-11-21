import { beforeEach, describe, expect, it, vi } from 'vitest'

// The watches' agreement dates what they read (the user, Oct 19: Keystone-K's
// list was read every day, and its places still said Oct 18; Oct 23: only
// what they read, box by box).

const m = vi.hoisted(() => ({
  rows: [] as { id: string; details: Record<string, unknown> | null }[],
  writes: [] as { id: string; details: Record<string, unknown>; filter: string[] }[],
  patches: [] as { p_id: string; p_set: Record<string, unknown>; p_unset: string[]; p_if: Record<string, string | null> }[],
  // What patch_resource_details answers: false when a box moved since the read.
  patched: true as boolean,
  rpcError: null as { message: string } | null,
  revalidateTag: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag: m.revalidateTag }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    rpc: (_name: string, args: (typeof m.patches)[number]) => {
      m.patches.push(args)
      return Promise.resolve(m.rpcError ? { data: null, error: m.rpcError } : { data: m.patched, error: null })
    },
    from: () => {
      let write: { id?: string; details?: Record<string, unknown>; filter: string[] } | null = null
      const q = {
        select: () => q,
        in: () => q,
        update: (v: { details: Record<string, unknown> }) => ((write = { details: v.details, filter: [] }), q),
        eq: (col: string, val: string) => {
          if (write && col === 'id') write.id = val
          else if (write) write.filter.push(`${col}=${val}`)
          return q
        },
        is: (col: string, val: null) => {
          if (write) write.filter.push(`${col} is ${val}`)
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
const { validatedDuring } = await import('./validatedDuring')

const NOW = '2026-10-19T07:47:31.000Z'

beforeEach(() => {
  m.rows = []
  m.writes = []
  m.patches = []
  m.patched = true
  m.rpcError = null
  m.revalidateTag.mockClear()
})

const AT = (from: string, at: string) => ({ from, at })

describe('datedBySource', () => {
  it('dates each box it read by the source, and nothing else', () => {
    const details = { name: 'x', confirmedAt: '2026-10-18T00:00:00Z', confirmedBy: { by: 'edit', at: '2026-10-18T00:00:00Z' }, sectionConfirmed: { about: '2026-10-01T00:00:00Z' } }
    expect(datedBySource(details, 'Keystone-K', ['kosher'], NOW)).toEqual({
      ...details,
      sectionConfirmed: { about: '2026-10-01T00:00:00Z', kosher: NOW },
      sectionFrom: { kosher: AT('Keystone-K', NOW) },
    })
    expect(datedBySource({}, 'Refuah', ['liaisons', 'kosher_food'], NOW)).toEqual({
      sectionConfirmed: { liaisons: NOW, kosher_food: NOW },
      sectionFrom: { liaisons: AT('Refuah', NOW), kosher_food: AT('Refuah', NOW) },
    })
  })
  it('leaves a box it dated in the last half day, and one dated later than now', () => {
    const mine = { sectionConfirmed: { kosher: '2026-10-19T03:00:00Z' }, sectionFrom: { kosher: AT('Keystone-K', '2026-10-19T03:00:00Z') } }
    expect(datedBySource(mine, 'Keystone-K', ['kosher'], NOW)).toBeNull()
    expect(datedBySource({ sectionConfirmed: { weekday: '2026-10-19T09:00:00Z' } }, 'A shul', ['weekday'], NOW)).toBeNull()
    // Someone else's from this morning moves: the source read it since.
    expect(datedBySource({ sectionConfirmed: { kosher: '2026-10-19T03:00:00Z' }, sectionFrom: { kosher: AT('Mekor Habracha', '2026-10-19T03:00:00Z') } }, 'Keystone-K', ['kosher'], NOW)).not.toBeNull()
    // A visitor's Yes since its own date: theirs is dated over.
    expect(datedBySource({ sectionConfirmed: { kosher: '2026-10-19T05:00:00Z' }, sectionFrom: { kosher: AT('Keystone-K', '2026-10-19T03:00:00Z') } }, 'Keystone-K', ['kosher'], NOW)).not.toBeNull()
  })
  it('never touches the listing’s own date', () => {
    const out = datedBySource({ confirmedAt: '2026-10-18T00:00:00Z' }, 'Keystone-K', ['kosher'], NOW)!
    expect(out.confirmedAt).toBe('2026-10-18T00:00:00Z')
    expect(out.confirmedFrom).toBeUndefined()
  })
})

describe('confirmFromSource', () => {
  it('writes each only while its boxes’ dates are still the ones read, then refreshes the listings once', async () => {
    m.rows = [
      { id: 'a', details: { sectionConfirmed: { weekday: '2026-10-18T00:00:50.603Z' } } },
      { id: 'b', details: null },
      { id: 'c', details: { sectionConfirmed: { weekday: '2026-10-19T03:00:00Z', shabbos: '2026-10-19T03:00:00Z' }, sectionFrom: { weekday: AT('A shul', '2026-10-19T03:00:00Z'), shabbos: AT('A shul', '2026-10-19T03:00:00Z') } } },
    ]
    expect(await confirmFromSource('philly', ['a', 'b', 'c', 'a'], 'A shul', ['weekday', 'shabbos'], NOW)).toBe(2)
    // Only the dates it moves are sent (Nov 21): a listing edit saved
    // between the read and the write stays.
    expect(m.patches.map((w) => [w.p_id, w.p_if, Object.keys(w.p_set).sort(), w.p_set.sectionConfirmed])).toEqual([
      ['a', { 'sectionConfirmed.weekday': '2026-10-18T00:00:50.603Z', 'sectionConfirmed.shabbos': null }, ['sectionConfirmed', 'sectionFrom'], { weekday: NOW, shabbos: NOW }],
      ['b', { 'sectionConfirmed.weekday': null, 'sectionConfirmed.shabbos': null }, ['sectionConfirmed', 'sectionFrom'], { weekday: NOW, shabbos: NOW }],
    ])
    expect(m.revalidateTag).toHaveBeenCalledTimes(1)
    expect(m.revalidateTag).toHaveBeenCalledWith('resources:philly', 'max')
  })
  it('the boxes can depend on the listing: a hospital’s, by what Refuah gave', async () => {
    m.rows = [{ id: 'h', details: { liaisons: [{ name: 'x' }] } }]
    expect(await confirmFromSource('philly', ['h'], 'Refuah', (d) => (d.liaisons ? ['liaisons'] : []), NOW)).toBe(1)
    expect(m.patches[0].p_set.sectionFrom).toEqual({ liaisons: AT('Refuah', NOW) })
  })
  it('still counts its dates when there is no site cache to refresh (the daily test-project job runs outside Next)', async () => {
    m.rows = [{ id: 'a', details: null }]
    m.revalidateTag.mockImplementationOnce(() => {
      throw new Error('Invariant: static generation store missing in revalidateTag resources:philly')
    })
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await confirmFromSource('philly', ['a'], 'Keystone-K', ['kosher'], NOW)).toBe(1)
    quiet.mockRestore()
  })
  // Activity's "Validated" row (Nov 17) says what was confirmed: each live
  // listing found agreeing, with what was read, whether or not its date
  // moved (a second run the same night still validated it).
  it('notes each listing it found agreeing, and what of it, for the night’s run', async () => {
    m.rows = [
      { id: 'a', details: null },
      { id: 'c', details: { sectionConfirmed: { kosher: NOW }, sectionFrom: { kosher: AT('Keystone-K', NOW) } } },
      { id: 'h', details: { noHechsher: true } },
    ]
    const { validated } = await validatedDuring(() => confirmFromSource('philly', ['a', 'c', 'h'], 'Keystone-K', (d) => (d.noHechsher ? [] : ['kosher']), NOW))
    expect(validated).toEqual([
      { id: 'a', boxes: ['kosher'] },
      { id: 'c', boxes: ['kosher'] },
    ])
  })
  it('does nothing for no listings', async () => {
    expect(await confirmFromSource('philly', [], 'Keystone-K', ['kosher'], NOW)).toBe(0)
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })
})

describe('confirmFromSource: when a box moved, or before migration 111', () => {
  it('doesn’t count a listing whose box moved since the read', async () => {
    m.rows = [{ id: 'a', details: null }]
    m.patched = false
    expect(await confirmFromSource('philly', ['a'], 'Keystone-K', ['kosher'], NOW)).toBe(0)
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })
  it('writes the whole details, guarded the same way, where patch_resource_details isn’t there yet', async () => {
    m.rows = [{ id: 'a', details: { sectionConfirmed: { weekday: '2026-10-18T00:00:50.603Z' } } }]
    m.rpcError = { message: 'Could not find the function public.patch_resource_details(p_columns, p_community, p_id, p_if, p_set, p_unset) in the schema cache' }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await confirmFromSource('philly', ['a'], 'A shul', ['weekday', 'shabbos'], NOW)).toBe(1)
    quiet.mockRestore()
    expect(m.writes.map((w) => [w.id, w.filter, w.details.sectionConfirmed])).toEqual([
      ['a', ['community_id=philly', 'details->sectionConfirmed->>weekday=2026-10-18T00:00:50.603Z', 'details->sectionConfirmed->>shabbos is null'], { weekday: NOW, shabbos: NOW }],
    ])
  })
})
