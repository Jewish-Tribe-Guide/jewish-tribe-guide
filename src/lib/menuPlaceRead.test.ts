import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'

// The user, Oct 22: the Main dishes page reads nothing when it's opened;
// the places never read are read a few a morning instead.
const m = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  readings: [] as { resourceId: string }[],
  saveMenuReading: vi.fn(),
  dateMenuDishes: vi.fn(),
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
vi.mock('@/lib/menuReadingStore', () => ({ listMenuReadings: async () => ({ readings: m.readings, available: true }), saveMenuReading: m.saveMenuReading, dateMenuDishes: m.dateMenuDishes }))
vi.mock('@/lib/menuReader', async (orig) => ({ ...(await orig<typeof import('@/lib/menuReader')>()), findMenus: m.findMenus, readMenus: m.readMenus }))
vi.mock('@/lib/renderPage', () => ({ pageRenderer: () => ({ render: null, close: async () => {} }) }))

const { listUnreadMenus, readUnreadMenus } = await import('./menuPlaceRead')

const row = (id: string, name: string, details: Record<string, unknown>) => ({ id, community_id: 'philly', category: 'restaurant', name, status: 'approved', details })
const source = { url: 'https://x.example/menu', text: 'Falafel 9', pdf: null }

beforeEach(() => {
  vi.clearAllMocks()
  m.readings = [{ resourceId: 'read' }]
  m.rows = [
    row('c', 'Charlie', { website: 'https://charlie.example' }),
    row('read', 'Already Read', { website: 'https://read.example' }),
    row('none', 'Nothing To Read', {}),
    row('dated', 'Dated, Never Read', { website: 'https://dated.example', dishes: ['Falafel'], itemMenu: { dishes: { Falafel: '2026-10-17T00:00:00Z' } } }),
    row('a', 'Abe’s', { website: 'https://abe.example' }),
    row('b', 'Bagel Place', { website: 'https://bagel.example' }),
  ]
  m.findMenus.mockResolvedValue([source])
  m.readMenus.mockResolvedValue({ dishes: [{ name: 'Falafel' }], missing: [], sourceUrl: source.url, note: null, model: 'x' })
  m.saveMenuReading.mockImplementation(async (_c: string, id: string, r: object) => ({ resourceId: id, ...r }))
})

// Oct 25: the Watches tab's Menus line names them.
describe('listUnreadMenus', () => {
  it('the places never read, with something to read, by name', async () => {
    expect(await listUnreadMenus('philly')).toEqual([
      { id: 'a', name: 'Abe’s' },
      { id: 'b', name: 'Bagel Place' },
      { id: 'c', name: 'Charlie' },
      { id: 'dated', name: 'Dated, Never Read' },
    ])
    expect(m.findMenus).not.toHaveBeenCalled()
  })
})

describe('readUnreadMenus', () => {
  it('reads only the places never read, with something to read, a few a run', async () => {
    expect(await readUnreadMenus('key', { perRun: 2 })).toEqual([{ community: 'philly', read: 2, left: 2 }])
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
    expect(await readUnreadMenus('key', { perRun: 5, forMs: 15, now })).toEqual([{ community: 'philly', read: 1, left: 3 }])
    expect(m.findMenus).toHaveBeenCalledTimes(2)
  })

  // Oct 26: HipCityVeg's dishes were dated by a read on Oct 17, before a
  // reading was kept. With no reading it had no watch, and dated dishes
  // kept it from a first read, so they said Oct 17 for good.
  it('reads a place never read whose dishes are dated, and dates them when it agrees', async () => {
    await readUnreadMenus('key', { perRun: 5 })
    expect(m.saveMenuReading.mock.calls.map(([, id]) => id)).toEqual(['a', 'b', 'c', 'dated'])
    expect(m.dateMenuDishes).toHaveBeenCalledWith('philly', 'dated', 'dishes', ['Falafel'])
    // The others list no dishes, so the Falafel it read is new to them: for the admin.
    expect(m.dateMenuDishes).toHaveBeenCalledTimes(1)
  })

  it('dates nothing when the read names a dish the listing lacks, misses one, or failed', async () => {
    m.rows = [m.rows.find((r) => r.id === 'dated')!]
    for (const read of [
      { dishes: [{ name: 'Falafel' }, { name: 'Shawarma' }], missing: [] },
      { dishes: [{ name: 'Hummus' }], missing: ['Falafel'] },
    ]) {
      m.readMenus.mockResolvedValueOnce({ ...read, sourceUrl: source.url, note: null, model: 'x' })
      await readUnreadMenus('key', { perRun: 1 })
    }
    m.findMenus.mockResolvedValue([])
    await readUnreadMenus('key', { perRun: 1 })
    expect(m.saveMenuReading).toHaveBeenCalledTimes(3)
    expect(m.dateMenuDishes).not.toHaveBeenCalled()
  })
})
