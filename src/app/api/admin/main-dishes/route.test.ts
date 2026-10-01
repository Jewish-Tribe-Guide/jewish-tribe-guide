import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  listCategories: vi.fn(),
  listApprovedResources: vi.fn(),
  getResourceById: vi.fn(),
  listMenuReadings: vi.fn(),
  getMenuReading: vi.fn(),
  saveMenuReading: vi.fn(),
  decideMenuReading: vi.fn(),
  findMenu: vi.fn(),
  readMenu: vi.fn(),
  rpc: vi.fn(),
  revalidatePublicContent: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources, getResourceById: m.getResourceById }))
vi.mock('@/lib/menuReadingStore', () => ({
  listMenuReadings: m.listMenuReadings,
  getMenuReading: m.getMenuReading,
  saveMenuReading: m.saveMenuReading,
  decideMenuReading: m.decideMenuReading,
}))
vi.mock('@/lib/menuReader', async (orig) => ({ ...(await orig<typeof import('@/lib/menuReader')>()), findMenu: m.findMenu, readMenu: m.readMenu }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ rpc: m.rpc }) }))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))

const { GET, POST } = await import('./route')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const req = (method: string, body?: unknown) =>
  new Request('http://x/api/admin/main-dishes?community=philly', { method, body: body === undefined ? undefined : JSON.stringify(body) })

const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  detailFields: [
    { key: 'website', label: 'Website', type: 'url', coreSection: true },
    { key: 't', label: 'Food Type', type: 'select', renderAs: 'badge', filterable: true },
    { key: 'foodType', label: 'Store Type', type: 'select', renderAs: 'badge', filterable: true },
    { key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'dish' },
  ],
})
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' }] })
const judah = makeListing({ id: ID, category: 'restaurant', name: 'Judah', website: 'https://judah.example', t: 'Meat', foodType: 'Restaurant', dishes: ['Falafel'] })
const reading = { resourceId: ID, status: 'proposed', sourceUrl: 'https://judah.example/menu', dishes: [], note: null, model: 'x', readAt: '2026-10-02T15:00:00Z', decidedAt: null, decidedBy: null }

beforeEach(() => {
  vi.clearAllMocks()
  m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listCategories.mockResolvedValue([food, grocery])
  m.listApprovedResources.mockResolvedValue([judah, makeListing({ id: 'g1', category: 'grocery', name: 'Acme', m: ['Challah'] })])
  m.getResourceById.mockResolvedValue(judah)
  m.listMenuReadings.mockResolvedValue({ readings: [reading], available: true })
  m.getMenuReading.mockResolvedValue(reading)
  m.saveMenuReading.mockImplementation(async (_c, id, r) => ({ ...reading, ...r, resourceId: id }))
  m.rpc.mockResolvedValue({ data: [{ out_community: 'philly', out_labels: ['Falafel', 'Shawarma'] }], error: null })
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
})
afterEach(() => vi.unstubAllEnvs())

describe('/api/admin/main-dishes', () => {
  it('admins only', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req('GET'))).status).toBe(401)
    expect((await POST(req('POST', { action: 'read', resourceId: ID }))).status).toBe(401)
    expect(m.findMenu).not.toHaveBeenCalled()
  })

  it('lists the places whose category keeps dishes, not a grocery’s items', async () => {
    const body = await (await GET(req('GET'))).json()
    expect(body.places).toEqual([
      expect.objectContaining({ id: ID, name: 'Judah', website: 'https://judah.example', dishes: ['Falafel'], facts: ['Meat'], reading }),
    ])
    expect(body.readerOn).toBe(true)
  })

  it('reads a place’s own website, and keeps the proposal for an admin', async () => {
    m.findMenu.mockResolvedValue({ url: 'https://judah.example/menu', text: 'menu', pdf: null })
    m.readMenu.mockResolvedValue({ sourceUrl: 'https://judah.example/menu', dishes: [{ name: 'Shawarma', quote: 'Shawarma plate', checked: true }], note: null, model: 'gpt' })
    const res = await POST(req('POST', { action: 'read', resourceId: ID }))
    expect(res.status).toBe(200)
    expect(m.findMenu).toHaveBeenCalledWith('https://judah.example')
    expect(m.saveMenuReading).toHaveBeenCalledWith('philly', ID, expect.objectContaining({ status: 'proposed', dishes: [{ name: 'Shawarma', quote: 'Shawarma plate', checked: true }] }))
    // Proposed is not shown: nothing touches the listing.
    expect(m.rpc).not.toHaveBeenCalled()
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('a website with no readable menu is kept as couldn’t be read; no key, no reading', async () => {
    m.findMenu.mockResolvedValue(null)
    await POST(req('POST', { action: 'read', resourceId: ID }))
    expect(m.saveMenuReading).toHaveBeenCalledWith('philly', ID, expect.objectContaining({ status: 'failed' }))
    expect(m.readMenu).not.toHaveBeenCalled()
    vi.stubEnv('OPENAI_API_KEY', '')
    expect((await POST(req('POST', { action: 'read', resourceId: ID }))).status).toBe(503)
  })

  it('approving puts the kept dishes on the listing, with the reading’s own menu address, never the request’s', async () => {
    const res = await POST(req('POST', { action: 'approve', resourceId: ID, dishes: ['shawarma', 'Burger', 'burger', 'x', 42], sourceUrl: 'https://evil.example' }))
    expect(res.status).toBe(200)
    expect(m.rpc).toHaveBeenCalledWith('approve_menu_dishes', expect.objectContaining({ p_id: ID, p_field: 'dishes', p_items: ['Shawarma', 'Burgers'], p_menu_url: 'https://judah.example/menu' }))
    expect(m.decideMenuReading).toHaveBeenCalledWith('philly', ID, 'approved', 'me@x.co')
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('nothing approved before a reading, nor with no dishes, nor at a place without a dish list', async () => {
    m.getMenuReading.mockResolvedValueOnce(null)
    expect((await POST(req('POST', { action: 'approve', resourceId: ID, dishes: ['Falafel'] }))).status).toBe(409)
    expect((await POST(req('POST', { action: 'approve', resourceId: ID, dishes: [] }))).status).toBe(400)
    m.getResourceById.mockResolvedValueOnce(makeListing({ id: ID, category: 'grocery', name: 'Acme' }))
    expect((await POST(req('POST', { action: 'approve', resourceId: ID, dishes: ['Falafel'] }))).status).toBe(404)
    expect((await POST(req('POST', { action: 'approve', resourceId: 'not-a-uuid', dishes: ['Falafel'] }))).status).toBe(400)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('skipping marks the reading, and touches nothing else', async () => {
    await POST(req('POST', { action: 'skip', resourceId: ID }))
    expect(m.decideMenuReading).toHaveBeenCalledWith('philly', ID, 'skipped', 'me@x.co')
    expect(m.rpc).not.toHaveBeenCalled()
  })
})
