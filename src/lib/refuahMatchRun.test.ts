import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  listWatches: vi.fn(),
  addWatch: vi.fn(),
  removeWatch: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: m.rows, error: null }).then(ok),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches, addWatch: m.addWatch, removeWatch: m.removeWatch }))

const { syncRefuahWatches } = await import('./refuahMatchRun')
const { readRefuahNear } = await import('./refuahRun')
const { REFUAH_MATCH_CREATOR, refuahPageUrl } = await import('./refuahMatch')

const PA = { _id: 'jx75q42dv17pxq7zckc9sx31v589mzem', name: 'Pennsylvania Hospital', formattedAddress: '800 Spruce St', latitude: 39.9451, longitude: -75.1556 }
const row = (id: string, community: string, geo: { lat: number; lng: number } | null) => ({
  id,
  community_id: community,
  category: 'hospital',
  name: 'Pennsylvania Hospital',
  status: 'approved',
  details: geo ? { geo } : {},
})
const refuah = (value: unknown, status = 'success') => vi.fn(async () => new Response(JSON.stringify({ status, value }))) as unknown as typeof fetch

beforeEach(() => {
  vi.clearAllMocks()
  m.rows = [row('pa', 'philly', { lat: 39.9451, lng: -75.1556 })]
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.addWatch.mockImplementation(async () => ({ id: 'new' }))
})

describe('syncRefuahWatches', () => {
  it('gives a hospital the Refuah page nearest it, marked as the run’s own, asking from where it is', async () => {
    const fetcher = refuah([PA])
    expect(await syncRefuahWatches(fetcher)).toEqual([{ community: 'philly', added: 1, removed: 0 }])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(vi.mocked(fetcher).mock.calls[0][1]!.body))).toEqual({ path: 'hospitals:list', args: { latitude: 39.9451, longitude: -75.1556 }, format: 'json' })
    expect(m.addWatch).toHaveBeenCalledWith('philly', {
      kind: 'website',
      url: refuahPageUrl(PA._id),
      resourceId: 'pa',
      label: 'Pennsylvania Hospital on Refuah',
      createdBy: REFUAH_MATCH_CREATOR,
    })
  })

  it('adds nothing for a hospital that already has a Refuah page an admin gave it', async () => {
    m.listWatches.mockResolvedValue({ watches: [{ id: 'w1', url: refuahPageUrl(PA._id), resourceId: 'pa', createdBy: 'claude (with the user’s yes)' }], available: true })
    expect(await syncRefuahWatches(refuah([PA]))).toEqual([{ community: 'philly', added: 0, removed: 0 }])
    expect(m.addWatch).not.toHaveBeenCalled()
    expect(m.removeWatch).not.toHaveBeenCalled()
  })

  it('asks Refuah nothing when no community has a hospital', async () => {
    m.rows = []
    const fetcher = refuah([PA])
    expect(await syncRefuahWatches(fetcher)).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('a hospital not on the map is asked nothing, and given nothing', async () => {
    m.rows = [row('pa', 'philly', null)]
    const fetcher = refuah([PA])
    expect(await syncRefuahWatches(fetcher)).toEqual([{ community: 'philly', added: 0, removed: 0 }])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('Refuah not answering takes no watch away', async () => {
    m.listWatches.mockResolvedValue({ watches: [{ id: 'mine', url: refuahPageUrl(PA._id), resourceId: 'pa', createdBy: REFUAH_MATCH_CREATOR }], available: true })
    await expect(syncRefuahWatches(refuah(null, 'error'))).rejects.toThrow(/couldn’t list its hospitals/)
    expect(m.removeWatch).not.toHaveBeenCalled()
  })
})

describe('readRefuahNear', () => {
  const HUP = { _id: 'jx77h9d00qztqgbbe8e0rfj1r589mgf5', name: 'HUP', latitude: 39.9496, longitude: -75.1925 }
  const answers = (...lists: unknown[][]) => {
    const f = vi.fn()
    for (const v of lists) f.mockImplementationOnce(async () => new Response(JSON.stringify({ status: 'success', value: v })))
    return f as unknown as typeof fetch
  }

  it('asks once per place, the same place once, and merges the answers', async () => {
    const fetcher = answers([PA, HUP], [HUP])
    const list = await readRefuahNear([{ lat: 39.9451, lng: -75.1556 }, { lat: 39.9451, lng: -75.1556 }, { lat: 39.9496, lng: -75.1925 }], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(list).toEqual([PA, HUP])
  })

  it('keeps only records with a name and a map position', async () => {
    expect(await readRefuahNear([{ lat: 1, lng: 1 }], answers([PA, { _id: 'x', name: 'No position' }, { name: 'No id', latitude: 1, longitude: 1 }]))).toEqual([PA])
  })

  it('one place failing fails them all, so a hospital isn’t called “not on Refuah” on half a list', async () => {
    const fetcher = vi.fn()
    fetcher.mockImplementationOnce(async () => new Response(JSON.stringify({ status: 'success', value: [PA] })))
    fetcher.mockImplementationOnce(async () => new Response('nope', { status: 502 }))
    expect(await readRefuahNear([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], fetcher as unknown as typeof fetch)).toEqual({ error: 'Refuah answered 502' })
  })

  it('no places, no request', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch
    expect(await readRefuahNear([], fetcher)).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })
})
