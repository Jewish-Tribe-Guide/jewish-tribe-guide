import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'

// The user, Oct 22: the Main dishes page reads nothing when it's opened;
// the places never read are read a few a morning instead.
const m = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  readings: [] as { resourceId: string }[],
  saveMenuReading: vi.fn(),
  findMenus: vi.fn(),
  readMenus: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === 'community' ? [{ slug: 'philly' }] : m.rows, error: null }).then(ok),
      }
      return q
    },
  }),
}))
const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  detailFields: [
    { key: 'website', label: 'Website', type: 'url', coreSection: true },
    { key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'dish' },
  ],
})
vi.mock('@/lib/categoryStore', () => ({ listCategoriesUncached: async () => [food] }))
vi.mock('@/lib/menuReadingStore', () => ({ listMenuReadings: async () => ({ readings: m.readings, available: true }), saveMenuReading: m.saveMenuReading }))
vi.mock('@/lib/menuReader', async (orig) => ({ ...(await orig<typeof import('@/lib/menuReader')>()), findMenus: m.findMenus, readMenus: m.readMenus }))
vi.mock('@/lib/renderPage', () => ({ pageRenderer: () => ({ render: null, close: async () => {} }) }))

const { readUnreadMenus } = await import('./menuPlaceRead')

const row = (id: string, name: string, details: Record<string, unknown>) => ({ id, community_id: 'philly', category: 'restaurant', name, status: 'approved', details })
const source = { url: 'https://x.example/menu', text: 'Falafel 9', pdf: null }

beforeEach(() => {
  vi.clearAllMocks()
  m.readings = [{ resourceId: 'read' }]
  m.rows = [
    row('c', 'Charlie', { website: 'https://charlie.example' }),
    row('read', 'Already Read', { website: 'https://read.example' }),
    row('none', 'Nothing To Read', {}),
    row('sent', 'Sent Through The Site', { website: 'https://sent.example', dishes: ['Falafel'], itemMenu: { dishes: { falafel: '2026-10-01T00:00:00Z' } } }),
    row('a', 'Abe’s', { website: 'https://abe.example' }),
    row('b', 'Bagel Place', { website: 'https://bagel.example' }),
  ]
  m.findMenus.mockResolvedValue([source])
  m.readMenus.mockResolvedValue({ dishes: [{ name: 'Falafel' }], missing: [], sourceUrl: source.url, note: null, model: 'x' })
  m.saveMenuReading.mockImplementation(async (_c: string, id: string, r: object) => ({ resourceId: id, ...r }))
})

describe('readUnreadMenus', () => {
  it('reads only the places never read, with something to read, a few a run', async () => {
    expect(await readUnreadMenus('key', { perRun: 2 })).toEqual([{ community: 'philly', read: 2, left: 1 }])
    expect(m.saveMenuReading.mock.calls.map(([, id]) => id)).toEqual(['a', 'b'])
    expect(m.saveMenuReading).toHaveBeenCalledWith('philly', 'a', expect.objectContaining({ status: 'proposed', dishes: [{ name: 'Falafel' }] }))
    expect(m.findMenus).toHaveBeenCalledWith('https://abe.example', expect.anything())
  })

  it('keeps a menu it couldn’t find, saying why, so it isn’t read every morning', async () => {
    m.findMenus.mockResolvedValue([])
    await readUnreadMenus('key', { perRun: 1 })
    expect(m.saveMenuReading).toHaveBeenCalledWith('philly', 'a', expect.objectContaining({ status: 'failed', dishes: [] }))
  })

  it('starts none once its time is up, and leaves one that throws for the next run', async () => {
    let t = 0
    const now = () => t
    m.saveMenuReading.mockImplementationOnce(async () => {
      throw new Error('down')
    })
    m.findMenus.mockImplementation(async () => {
      t += 10
      return [source]
    })
    expect(await readUnreadMenus('key', { perRun: 5, forMs: 15, now })).toEqual([{ community: 'philly', read: 1, left: 2 }])
    expect(m.findMenus).toHaveBeenCalledTimes(2)
  })
})
