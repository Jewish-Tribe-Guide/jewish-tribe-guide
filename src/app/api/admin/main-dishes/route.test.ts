import type { MenuSource } from '@/lib/menuReader'
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
  markNoMenu: vi.fn(),
  clearMenuReading: vi.fn(),
  saveMenuLink: vi.fn(),
  findMenu: vi.fn(),
  readMenuPage: vi.fn(),
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
  markNoMenu: m.markNoMenu,
  clearMenuReading: m.clearMenuReading,
  saveMenuLink: m.saveMenuLink,
  NO_MENU_NOTE: 'No menu',
  isNoMenu: (r: { status: string; note: string | null; dishes: unknown[] }) => r.status === 'skipped' && r.note === 'No menu' && r.dishes.length === 0,
}))
vi.mock('@/lib/menuReader', async (orig) => ({
  ...(await orig<typeof import('@/lib/menuReader')>()),
  findMenu: m.findMenu,
  readMenuPage: m.readMenuPage,
  readMenu: m.readMenu,
  // The routes read every page a menu may be on (findMenus, readMenus);
  // these tests give one, through the single-page mocks above.
  findMenus: async (url: string) => {
    const one = await m.findMenu(url)
    return one ? [one] : []
  },
  readMenus: async (sources: MenuSource[], name: string, opts: unknown) => {
    let first = null
    for (const s of sources) {
      const read = await m.readMenu(s, name, opts)
      if (read.dishes.length) return read
      first ??= read
    }
    return first
  },
}))
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
  m.saveMenuLink.mockResolvedValue(true)
  m.markNoMenu.mockImplementation(async (_c, id, by) => ({ ...reading, resourceId: id, status: 'skipped', dishes: [], note: 'No menu', sourceUrl: null, model: null, decidedBy: by }))
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

  // Oct 17: a menu link someone gave the place (menuLink.ts) is read first;
  // its website is the fallback when the link can't be read.
  it('reads its menu link first, and its website when the link can’t be read', async () => {
    m.getResourceById.mockResolvedValue({ ...judah, menuUrl: 'https://judah.example/menu.pdf' })
    m.readMenuPage.mockResolvedValue({ url: 'https://judah.example/menu.pdf', text: null, pdf: 'JVBER' })
    m.readMenu.mockResolvedValue({ sourceUrl: 'https://judah.example/menu.pdf', dishes: [{ name: 'Shawarma', quote: 'Shawarma', checked: false }], note: null, model: 'gpt' })
    await POST(req('POST', { action: 'read', resourceId: ID }))
    expect(m.readMenuPage).toHaveBeenCalledWith('https://judah.example/menu.pdf')
    expect(m.findMenu).not.toHaveBeenCalled()
    expect(m.readMenu).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://judah.example/menu.pdf' }), 'Judah', expect.anything())

    m.readMenuPage.mockResolvedValue(null)
    m.findMenu.mockResolvedValue({ url: 'https://judah.example/food', text: 'menu', pdf: null })
    await POST(req('POST', { action: 'read', resourceId: ID }))
    expect(m.findMenu).toHaveBeenCalledWith('https://judah.example')
  })

  it('lists each place’s menu link, for the tab to say what it reads', async () => {
    m.listApprovedResources.mockResolvedValue([{ ...judah, menuUrl: 'https://judah.example/menu' }])
    const body = await (await GET(req('GET'))).json()
    expect(body.places[0].menuUrl).toBe('https://judah.example/menu')
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

  // Oct 20: three ways on for a place whose menu couldn't be read.
  describe('a menu that couldn’t be read', () => {
    const photosReq = (files: File[], fields: Record<string, string> = { action: 'photos', resourceId: ID }) => {
      const form = new FormData()
      for (const [k, v] of Object.entries(fields)) form.append(k, v)
      for (const f of files) form.append('file', f)
      return new Request('http://x/api/admin/main-dishes?community=philly', { method: 'POST', body: form })
    }
    const jpeg = (name = 'menu.jpg', bytes = 'JPEG') => new File([bytes], name, { type: 'image/jpeg' })

    it('a menu link is saved on the listing, the site told, and read', async () => {
      m.readMenuPage.mockResolvedValue({ url: 'https://judah.example/menu', text: 'menu', pdf: null })
      m.readMenu.mockResolvedValue({ sourceUrl: 'https://judah.example/menu', dishes: [{ name: 'Shawarma', quote: 'Shawarma', checked: true }], note: null, model: 'gpt' })
      const body = await (await POST(req('POST', { action: 'link', resourceId: ID, url: 'judah.example/menu' }))).json()
      expect(m.saveMenuLink).toHaveBeenCalledWith('philly', ID, 'https://judah.example/menu')
      expect(m.revalidatePublicContent).toHaveBeenCalled()
      expect(m.readMenuPage).toHaveBeenCalledWith('https://judah.example/menu')
      expect(m.findMenu).not.toHaveBeenCalled()
      expect(body).toMatchObject({ ok: true, menuUrl: 'https://judah.example/menu', reading: { status: 'proposed' } })
    })

    it('a link that can’t be read is still saved, and says what to do instead; an ordering app’s says why', async () => {
      m.readMenuPage.mockResolvedValue(null)
      await POST(req('POST', { action: 'link', resourceId: ID, url: 'https://www.toasttab.com/judah' }))
      expect(m.saveMenuLink).toHaveBeenCalledWith('philly', ID, 'https://www.toasttab.com/judah')
      expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({ status: 'failed', sourceUrl: 'https://www.toasttab.com/judah', note: expect.stringMatching(/doesn’t open ordering apps: add photos/) }))
      await POST(req('POST', { action: 'link', resourceId: ID, url: 'https://judah.example/menu' }))
      expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({ status: 'failed', note: expect.stringMatching(/couldn’t be read .* Add photos/) }))
      expect(m.readMenu).not.toHaveBeenCalled()
    })

    it('not a web address, or a listing no longer live: nothing saved', async () => {
      expect((await POST(req('POST', { action: 'link', resourceId: ID, url: 'their menu' }))).status).toBe(400)
      expect((await POST(req('POST', { action: 'link', resourceId: ID, url: 'javascript:alert(1)' }))).status).toBe(400)
      expect(m.saveMenuLink).not.toHaveBeenCalled()
      m.saveMenuLink.mockResolvedValue(false)
      expect((await POST(req('POST', { action: 'link', resourceId: ID, url: 'https://judah.example/menu' }))).status).toBe(404)
      expect(m.revalidatePublicContent).not.toHaveBeenCalled()
    })

    it('photos of the menu are read as photos, each dish marked as from a picture, and nothing about the listing changes', async () => {
      m.readMenu.mockResolvedValue({ sourceUrl: null, dishes: [{ name: 'Burgers', quote: 'Beyond Burger', checked: false }], note: null, model: 'gpt' })
      const body = await (await POST(photosReq([jpeg('a.jpg', 'ONE'), jpeg('b.jpg', 'TWO')]))).json()
      expect(m.readMenu).toHaveBeenCalledWith(
        { url: null, text: null, pdf: null, images: [{ mime: 'image/jpeg', b64: Buffer.from('ONE').toString('base64') }, { mime: 'image/jpeg', b64: Buffer.from('TWO').toString('base64') }] },
        'Judah',
        expect.anything(),
      )
      expect(m.saveMenuReading).toHaveBeenCalledWith('philly', ID, {
        status: 'proposed',
        sourceUrl: null,
        dishes: [{ name: 'Burgers', quote: 'Beyond Burger', checked: false, picture: true }],
        note: null,
        model: 'gpt',
      })
      expect(body.ok).toBe(true)
      expect(m.saveMenuLink).not.toHaveBeenCalled()
      expect(m.rpc).not.toHaveBeenCalled()

      m.readMenu.mockResolvedValue({ sourceUrl: null, dishes: [], note: null, model: 'gpt' })
      await POST(photosReq([jpeg()]))
      expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({ status: 'failed', note: 'No dishes in those photos.' }))
    })

    it('photos: one to three, pictures or a PDF, each under 5MB, and only as a form', async () => {
      expect((await POST(photosReq([]))).status).toBe(400)
      expect((await POST(photosReq([jpeg(), jpeg(), jpeg(), jpeg()]))).status).toBe(400)
      expect((await POST(photosReq([new File(['x'], 'menu.svg', { type: 'image/svg+xml' })]))).status).toBe(400)
      expect((await POST(photosReq([jpeg('big.jpg', 'x'.repeat(5 * 1024 * 1024 + 1))]))).status).toBe(400)
      expect((await POST(req('POST', { action: 'photos', resourceId: ID }))).status).toBe(400)
      expect(m.readMenu).not.toHaveBeenCalled()
      m.getAdminUserForCommunity.mockResolvedValue(null)
      expect((await POST(photosReq([jpeg()]))).status).toBe(401)
    })

    it('no menu: kept, sent back as its own status, listed as such; undone only when it says no menu', async () => {
      const body = await (await POST(req('POST', { action: 'no_menu', resourceId: ID }))).json()
      expect(m.markNoMenu).toHaveBeenCalledWith('philly', ID, 'me@x.co')
      expect(body.reading).toMatchObject({ status: 'no_menu', decidedBy: 'me@x.co' })

      m.listMenuReadings.mockResolvedValue({ readings: [{ ...reading, status: 'skipped', dishes: [], note: 'No menu' }], available: true })
      expect((await (await GET(req('GET'))).json()).places[0].reading.status).toBe('no_menu')

      m.getMenuReading.mockResolvedValue({ ...reading, status: 'skipped', dishes: [], note: 'No menu' })
      await POST(req('POST', { action: 'undo_no_menu', resourceId: ID }))
      expect(m.clearMenuReading).toHaveBeenCalledWith('philly', ID)
      m.clearMenuReading.mockClear()
      m.getMenuReading.mockResolvedValue(reading)
      await POST(req('POST', { action: 'undo_no_menu', resourceId: ID }))
      expect(m.clearMenuReading).not.toHaveBeenCalled()
    })

    it('each place says when its newest dish came off a menu', async () => {
      m.listApprovedResources.mockResolvedValue([{ ...judah, dishes: ['Falafel', 'Burgers'], itemMenu: { dishes: { falafel: '2026-10-01T12:00:00Z', burgers: '2026-10-20T12:00:00Z' } } }])
      expect((await (await GET(req('GET'))).json()).places[0].menuAt).toBe('2026-10-20T12:00:00Z')
      m.listApprovedResources.mockResolvedValue([judah])
      expect((await (await GET(req('GET'))).json()).places[0].menuAt).toBeNull()
    })
  })
})
