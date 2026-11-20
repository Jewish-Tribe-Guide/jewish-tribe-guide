import { beforeEach, describe, expect, it, vi } from 'vitest'

// The shared run, driven by a made-up list, so what it does for every list
// (skip what was filed before, ask Google about new places, leave out the
// closed ones, file the rest, date what agrees) is pinned apart from either
// real list's parsing. keystoneRun.test.ts and mekorRun.test.ts cover each.

const { earlier, mockGoogle, mockCanAsk, mockConfirm } = vi.hoisted(() => ({
  earlier: { rows: [] as { operation: string; target_id: string | null; payload: Record<string, unknown>; note?: string | null }[] },
  mockGoogle: vi.fn(),
  mockCanAsk: vi.fn(() => true),
  mockConfirm: vi.fn(async (_c: string, ids: readonly string[]) => ids.length),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, range: () => q, order: () => q, then: (ok: (v: unknown) => unknown) => ok({ data: earlier.rows, error: null }) }
      return q
    },
  }),
}))
vi.mock('@/lib/googlePlaces', () => ({ canAskGoogle: mockCanAsk, findPlaceStatus: mockGoogle, namesOverlap: () => true }))
vi.mock('@/lib/sourceConfirm', () => ({ confirmFromSource: mockConfirm }))
vi.mock('@/lib/email', () => ({}))

import { runKosherListWatch, type KosherList } from './kosherListRun'

type F = { kind: 'new' | 'changed'; name: string }

function list(findings: F[], filed: (f: F) => Promise<void> = async () => {}): KosherList<string, F> {
  return {
    watchName: 'Test list watch',
    sourceName: 'Test list',
    categories: ['restaurant'],
    read: async () => ({ updated: '2026-11-01', entries: ['a', 'b', 'c'] }),
    compare: async () => ({ findings, agree: ['agreeing-1', 'agreeing-2'] }),
    findingKey: (f) => `${f.kind}:${f.name}`,
    submissionKey: (row) => String(row.payload.key),
    note: (f, updated) => `${f.name} (list of ${updated})`,
    describe: (f) => ({ name: f.name, what: f.kind }),
    newPlace: (f) => (f.kind === 'new' ? { name: f.name, address: '1 Main St' } : null),
    file: (f) => filed(f),
  }
}

beforeEach(() => {
  earlier.rows = []
  mockGoogle.mockReset()
  mockCanAsk.mockReturnValue(true)
  mockConfirm.mockClear()
})

describe('runKosherListWatch', () => {
  it('files what is new since last time, with Google’s line, and leaves out what Google says closed', async () => {
    earlier.rows = [{ operation: 'update', target_id: 'x', payload: { key: 'changed:Filed before' } }]
    mockGoogle.mockImplementation(async (name: string) =>
      name === 'Closed Pizza' ? { businessStatus: 'CLOSED_PERMANENTLY', name } : { businessStatus: 'OPERATIONAL', name, placeId: 'gp-1' },
    )
    const filed: { name: string; note: string; placeId?: string }[] = []
    const findings: F[] = [
      { kind: 'new', name: 'Open Cafe' },
      { kind: 'new', name: 'Closed Pizza' },
      { kind: 'changed', name: 'Filed before' },
      { kind: 'changed', name: 'Renamed Deli' },
    ]
    const l = list(findings)
    l.file = async (f, note, placeId) => void filed.push({ name: f.name, note, placeId })

    const run = await runKosherListWatch('philly', l)

    expect(filed).toEqual([
      { name: 'Open Cafe', note: 'Open Cafe (list of 2026-11-01)\nGoogle: open (as "Open Cafe").', placeId: 'gp-1' },
      { name: 'Renamed Deli', note: 'Renamed Deli (list of 2026-11-01)', placeId: undefined },
    ])
    expect(mockGoogle).toHaveBeenCalledTimes(2)
    expect(mockConfirm).toHaveBeenCalledWith('philly', ['agreeing-1', 'agreeing-2'], 'Test list', ['kosher'])
    expect(run).toMatchObject({ ok: true, entries: 3, findings: 4, filed: 2, matching: 2, closedOnGoogle: ['Closed Pizza'], confirmed: 2 })
    expect(run.ok && run.differences).toHaveLength(4)
  })

  it('a dry run files nothing and dates nothing, and says what it would file', async () => {
    mockGoogle.mockResolvedValue({ businessStatus: 'OPERATIONAL', name: 'Open Cafe' })
    const file = vi.fn()
    const run = await runKosherListWatch('philly', list([{ kind: 'new', name: 'Open Cafe' }], file), { dry: true })
    expect(file).not.toHaveBeenCalled()
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(run).toMatchObject({ ok: true, filed: 0, wouldFile: [{ kind: 'new', name: 'Open Cafe', what: 'new' }] })
  })

  it('stops with the list’s own error before reading the guide', async () => {
    const l = list([])
    l.read = async () => ({ error: 'The list answered 500' })
    l.compare = vi.fn()
    expect(await runKosherListWatch('philly', l)).toEqual({ ok: false, error: 'The list answered 500' })
    expect(l.compare).not.toHaveBeenCalled()
  })
})
