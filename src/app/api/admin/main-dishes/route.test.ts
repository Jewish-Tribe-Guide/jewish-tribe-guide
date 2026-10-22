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
  setMenuDishes: vi.fn(),
  findMenu: vi.fn(),
  readMenuPage: vi.fn(),
  readMenu: vi.fn(),
  revalidatePublicContent: vi.fn(),
  listWatches: vi.fn(),
  updateWatch: vi.fn(),
  jobFindings: vi.fn(),
  runAndRecord: vi.fn(),
}))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches, updateWatch: m.updateWatch }))
vi.mock('@/lib/watchFindingStore', () => ({ jobFindings: m.jobFindings }))
vi.mock('@/lib/watchRunner', () => ({ runAndRecord: m.runAndRecord }))
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
  setMenuDishes: m.setMenuDishes,
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
  findMenus: async (url: string, opts?: unknown) => {
    const one = await m.findMenu(url, opts)
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
// A page drawn in a browser (renderPage.ts): never a real one here.
const render = vi.hoisted(() => vi.fn())
const closeRenderer = vi.hoisted(() => vi.fn())
vi.mock('@/lib/renderPage', () => ({ pageRenderer: () => ({ render, close: closeRenderer }) }))
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
  m.setMenuDishes.mockResolvedValue(true)
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.jobFindings.mockResolvedValue({ findings: [], decided: new Map() })
  m.runAndRecord.mockImplementation(async (w: { id: string }) => ({ watch: { ...w, lastRunAt: 'now' } }))
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

  // Main dishes board 3 (Oct 22): a place Google doesn't keep is read
  // from its website for its hours and phone too.
  describe('its hours and phone, from its website, when Google doesn’t keep them', () => {
    const CV = '7d1f3c2a-9b8e-4c6d-a5f4-3e2d1c0b9a87'
    const withHours = makeCategory({ ...food, hasPhone: true, detailFields: [...food.detailFields, { key: 'hours', label: 'Hours', type: 'hours' }] })
    const hours = { sun: { open: '09:00', close: '21:00' } }
    const chalavita = makeListing({ id: CV, category: 'restaurant', name: 'Chalavita', website: 'https://chalavita.com', phone: '(215) 555-0100', hours } as never)
    const googled = { ...judah, phone: '(215) 555-0199', placeId: 'g', googleFields: ['hours', 'phone'], hours }
    const home = { id: 'home', resourceId: CV, url: 'https://chalavita.com/', createdBy: 'listing pages (found)', active: true }
    const finding = { id: 'f1', targetId: CV, section: 'contact', values: { phone: '(215) 555-0123' } }

    beforeEach(() => {
      m.listCategories.mockResolvedValue([withHours, grocery])
      m.listApprovedResources.mockResolvedValue([chalavita, googled])
      m.listWatches.mockResolvedValue({ watches: [home, { id: 'menu', resourceId: CV, url: 'https://chalavita.com/menu', createdBy: 'menu links', active: true }], available: true })
      m.jobFindings.mockResolvedValue({ findings: [finding], decided: new Map() })
    })

    it('each place comes with its website’s pages, what they found, and its hours and phone as listed, only what Google doesn’t keep', async () => {
      const [cv, jd] = (await (await GET(req('GET'))).json()).places
      expect(m.jobFindings).toHaveBeenCalledWith('philly', 'dishes', [withHours])
      expect(cv).toMatchObject({ id: CV, pages: [home], findings: [finding], hours, contact: { name: 'Phone', fields: [{ key: 'phone', label: 'Phone', kind: 'phone', value: '(215) 555-0100' }] } })
      expect(jd).toMatchObject({ id: ID, pages: [], findings: [], contact: null })
      expect(jd).not.toHaveProperty('hours')
    })

    it('Read them now reads its website’s pages too, as a check', async () => {
      m.getResourceById.mockResolvedValue(chalavita)
      m.findMenu.mockResolvedValue(null)
      const body = await (await POST(req('POST', { action: 'read', resourceId: CV }))).json()
      expect(m.runAndRecord).toHaveBeenCalledTimes(1)
      expect(m.runAndRecord).toHaveBeenCalledWith(home, undefined, undefined, { full: true })
      expect(body.pages).toEqual([{ ...home, lastRunAt: 'now' }])
    })

    it('stop: one of its website’s pages, kept and never read; not its menu’s, nor another place’s', async () => {
      m.getResourceById.mockResolvedValue(chalavita)
      expect((await POST(req('POST', { action: 'stop', resourceId: CV, id: 'home' }))).status).toBe(200)
      expect(m.updateWatch).toHaveBeenCalledWith('philly', 'home', { createdBy: 'listing pages (stopped)', active: false })
      expect((await POST(req('POST', { action: 'stop', resourceId: CV, id: 'menu' }))).status).toBe(400)
      expect(m.updateWatch).toHaveBeenCalledTimes(1)
    })
  })

  it('reads a place’s own website, and keeps the proposal for an admin', async () => {
    m.findMenu.mockResolvedValue({ url: 'https://judah.example/menu', text: 'menu', pdf: null })
    m.readMenu.mockResolvedValue({ sourceUrl: 'https://judah.example/menu', dishes: [{ name: 'Shawarma', quote: 'Shawarma plate', checked: true }], note: null, model: 'gpt' })
    const res = await POST(req('POST', { action: 'read', resourceId: ID }))
    expect(res.status).toBe(200)
    expect(m.findMenu).toHaveBeenCalledWith('https://judah.example', { render, trouble: expect.any(Function) })
    expect(m.saveMenuReading).toHaveBeenCalledWith('philly', ID, expect.objectContaining({ status: 'proposed', dishes: [{ name: 'Shawarma', quote: 'Shawarma plate', checked: true }] }))
    // Proposed is not shown: nothing touches the listing.
    expect(m.setMenuDishes).not.toHaveBeenCalled()
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  // Oct 17: a menu link someone gave the place (menuLink.ts) is read first;
  // its website is the fallback when the link can't be read.
  it('reads its menu link first, and its website when the link can’t be read', async () => {
    m.getResourceById.mockResolvedValue({ ...judah, menuUrl: 'https://judah.example/menu.pdf' })
    m.readMenuPage.mockResolvedValue({ url: 'https://judah.example/menu.pdf', text: null, pdf: 'JVBER' })
    m.readMenu.mockResolvedValue({ sourceUrl: 'https://judah.example/menu.pdf', dishes: [{ name: 'Shawarma', quote: 'Shawarma', checked: false }], note: null, model: 'gpt' })
    await POST(req('POST', { action: 'read', resourceId: ID }))
    expect(m.readMenuPage).toHaveBeenCalledWith('https://judah.example/menu.pdf', { render, trouble: expect.any(Function) })
    expect(m.findMenu).not.toHaveBeenCalled()
    expect(m.readMenu).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://judah.example/menu.pdf' }), 'Judah', expect.anything())

    m.readMenuPage.mockResolvedValue(null)
    m.findMenu.mockResolvedValue({ url: 'https://judah.example/food', text: 'menu', pdf: null })
    await POST(req('POST', { action: 'read', resourceId: ID }))
    expect(m.findMenu).toHaveBeenCalledWith('https://judah.example', { render, trouble: expect.any(Function) })
  })

  // Oct 20: a page drawn by a script is drawn in a browser (renderPage.ts),
  // which is always closed, even when reading fails.
  it('the reader can draw a page in a browser, which is closed after, whatever happens', async () => {
    m.findMenu.mockRejectedValue(new Error('boom'))
    expect((await POST(req('POST', { action: 'read', resourceId: ID }))).status).toBe(502)
    expect(closeRenderer).toHaveBeenCalledTimes(1)
  })

  // Oct 21: four places read on a laptop and not on the site, and the note
  // couldn't say why. It now says what the reader was told.
  it('a website that can’t be read says why, and a menu link and website each say theirs', async () => {
    m.findMenu.mockImplementation(async (_url: string, opts: { trouble?: (t: unknown) => void }) => {
      opts.trouble?.({ why: 'refused', status: 403 })
      opts.trouble?.({ why: 'drawn_empty' })
      return null
    })
    await POST(req('POST', { action: 'read', resourceId: ID }))
    expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({ status: 'failed', note: 'Couldn’t read a menu on its website: it turned the reader away (403).' }))

    m.getResourceById.mockResolvedValue({ ...judah, menuUrl: 'https://judah.example/menu' })
    m.readMenuPage.mockImplementation(async (_url: string, opts: { trouble?: (t: unknown) => void }) => {
      opts.trouble?.({ why: 'draw_timeout' })
      return null
    })
    await POST(req('POST', { action: 'read', resourceId: ID }))
    expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({
      note: 'Couldn’t read its menu link: it’s drawn by a script, and took too long to draw. Couldn’t read a menu on its website either: it turned the reader away (403).',
    }))

    await POST(req('POST', { action: 'link', resourceId: ID, url: 'https://judah.example/menu' }))
    expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({
      note: 'Saved as its menu link, but it couldn’t be read: it’s drawn by a script, and took too long to draw. Add photos of the menu.',
    }))
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

  // Oct 21: Use this, from the stored reading and the listing alone.
  it('Use this takes off what its menu no longer names, adds what’s new, dates what it names, from the reading, never the request', async () => {
    m.getResourceById.mockResolvedValue({ ...judah, dishes: ['Falafel', 'Tofu', 'Laffa'], itemMenu: { dishes: { Falafel: '2026-10-01T12:00:00Z', Tofu: '2026-10-01T12:00:00Z' } } })
    m.getMenuReading.mockResolvedValue({ ...reading, dishes: [{ name: 'Falafel', quote: 'Falafel', checked: true }, { name: 'Shawarma', quote: 'Shawarma plate', checked: true }], missing: ['Tofu', 'Laffa'] })
    const res = await POST(req('POST', { action: 'use', resourceId: ID, dishes: ['Evil'], sourceUrl: 'https://evil.example' }))
    expect(res.status).toBe(200)
    // Tofu was found on its menu before: off. Laffa was added by hand: kept.
    expect(m.setMenuDishes).toHaveBeenCalledWith('philly', ID, 'dishes', { always: ['Falafel', 'Laffa', 'Shawarma'], sometimes: [] }, expect.objectContaining({ names: ['Falafel', 'Shawarma'], menuUrl: 'https://judah.example/menu' }))
    expect(m.decideMenuReading).toHaveBeenCalledWith('philly', ID, 'approved', 'me@x.co')
    expect(m.revalidatePublicContent).toHaveBeenCalled()
    expect(await res.json()).toEqual({ ok: true, dishes: ['Falafel', 'Laffa', 'Shawarma'], sometimes: [], menuDated: ['Falafel', 'Shawarma'] })
  })

  it('Save to the listing keeps the list as edited, and dates only what the menu named', async () => {
    m.getMenuReading.mockResolvedValue({ ...reading, dishes: [{ name: 'Shawarma', quote: 'Shawarma plate', checked: true }] })
    const res = await POST(req('POST', { action: 'save', resourceId: ID, always: ['shawarma', 'Laffa Wraps', 'laffa wraps', 'x', 42], sometimes: ['Soup', 'Shawarma'] }))
    expect(res.status).toBe(200)
    expect(m.setMenuDishes).toHaveBeenCalledWith('philly', ID, 'dishes', { always: ['Shawarma', 'Laffa Wraps'], sometimes: ['Soups'] }, expect.objectContaining({ names: ['Shawarma'] }))
    expect(m.decideMenuReading).toHaveBeenCalledWith('philly', ID, 'approved', 'me@x.co')
  })

  it('nothing used before a reading, nor from a reading already decided, nor at a place without a dish list', async () => {
    m.getMenuReading.mockResolvedValueOnce(null)
    expect((await POST(req('POST', { action: 'use', resourceId: ID }))).status).toBe(409)
    m.getMenuReading.mockResolvedValueOnce({ ...reading, status: 'approved' })
    expect((await POST(req('POST', { action: 'use', resourceId: ID }))).status).toBe(409)
    m.getResourceById.mockResolvedValueOnce(makeListing({ id: ID, category: 'grocery', name: 'Acme' }))
    expect((await POST(req('POST', { action: 'use', resourceId: ID }))).status).toBe(404)
    expect((await POST(req('POST', { action: 'use', resourceId: 'not-a-uuid' }))).status).toBe(400)
    expect((await POST(req('POST', { action: 'approve', resourceId: ID, dishes: ['Falafel'] }))).status).toBe(400)
    expect(m.setMenuDishes).not.toHaveBeenCalled()
  })

  it('Keep the listing marks the reading, and touches nothing else', async () => {
    await POST(req('POST', { action: 'skip', resourceId: ID }))
    expect(m.decideMenuReading).toHaveBeenCalledWith('philly', ID, 'skipped', 'me@x.co')
    expect(m.setMenuDishes).not.toHaveBeenCalled()
  })

  it('stops reading its menu link by taking it off the listing', async () => {
    const res = await POST(req('POST', { action: 'unlink', resourceId: ID }))
    expect(res.status).toBe(200)
    expect(m.saveMenuLink).toHaveBeenCalledWith('philly', ID, null)
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('gives one place’s listing and category, for Edit', async () => {
    const res = await GET(new Request(`http://x/api/admin/main-dishes?community=philly&item=${ID}`))
    expect(await res.json()).toEqual({ ok: true, item: judah, category: food })
    m.getResourceById.mockResolvedValueOnce(makeListing({ id: ID, category: 'grocery', name: 'Acme' }))
    expect((await GET(new Request(`http://x/api/admin/main-dishes?community=philly&item=${ID}`))).status).toBe(404)
    expect((await GET(new Request('http://x/api/admin/main-dishes?community=philly&item=nope'))).status).toBe(400)
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
      expect(m.readMenuPage).toHaveBeenCalledWith('https://judah.example/menu', { render, trouble: expect.any(Function) })
      expect(closeRenderer).toHaveBeenCalled()
      expect(m.findMenu).not.toHaveBeenCalled()
      expect(body).toMatchObject({ ok: true, menuUrl: 'https://judah.example/menu', reading: { status: 'proposed' } })
    })

    it('a link that can’t be read is still saved, and says what to do instead; an ordering app’s says why', async () => {
      m.readMenuPage.mockResolvedValue(null)
      await POST(req('POST', { action: 'link', resourceId: ID, url: 'https://www.toasttab.com/judah' }))
      expect(m.saveMenuLink).toHaveBeenCalledWith('philly', ID, 'https://www.toasttab.com/judah')
      expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({ status: 'failed', sourceUrl: 'https://www.toasttab.com/judah', note: expect.stringMatching(/doesn’t open ordering apps: add photos/) }))
      await POST(req('POST', { action: 'link', resourceId: ID, url: 'https://judah.example/menu' }))
      expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({ status: 'failed', note: expect.stringMatching(/couldn’t be read.* Add photos/) }))
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
      expect(m.setMenuDishes).not.toHaveBeenCalled()

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

  // The user, Oct 21: a dish added by hand is looked for on every read
  // after, and a reading says which listed dishes its menu doesn't name.
  describe('the listing’s own dishes', () => {
    const listingOf = { ...judah, dishes: ['Falafel'], dishes_sometimes: ['Kugel'] }
    const read = { sourceUrl: 'https://judah.example/menu', dishes: [{ name: 'Falafel', quote: 'Falafel', checked: true, onListing: true }], note: null, model: 'gpt', missing: ['Kugel'] }
    beforeEach(() => {
      m.getResourceById.mockResolvedValue(listingOf)
      m.readMenu.mockResolvedValue(read)
    })

    it('every read is given them, the sometimes ones too, and keeps the ones its menu doesn’t name', async () => {
      m.findMenu.mockResolvedValue({ url: 'https://judah.example/menu', text: 'menu', pdf: null })
      await POST(req('POST', { action: 'read', resourceId: ID }))
      expect(m.readMenu).toHaveBeenLastCalledWith(expect.anything(), 'Judah', expect.objectContaining({ listed: ['Falafel', 'Kugel'] }))
      expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({ dishes: read.dishes, missing: ['Kugel'] }))

      m.readMenuPage.mockResolvedValue({ url: 'https://judah.example/menu', text: 'menu', pdf: null })
      await POST(req('POST', { action: 'link', resourceId: ID, url: 'https://judah.example/menu' }))
      expect(m.readMenu).toHaveBeenLastCalledWith(expect.anything(), 'Judah', expect.objectContaining({ listed: ['Falafel', 'Kugel'] }))
      expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({ missing: ['Kugel'] }))

      const form = new FormData()
      form.append('action', 'photos')
      form.append('resourceId', ID)
      form.append('file', new File(['PDF'], 'menu.pdf', { type: 'application/pdf' }))
      await POST(new Request('http://x/api/admin/main-dishes?community=philly', { method: 'POST', body: form }))
      expect(m.readMenu).toHaveBeenLastCalledWith(expect.anything(), 'Judah', expect.objectContaining({ listed: ['Falafel', 'Kugel'] }))
      expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', ID, expect.objectContaining({ missing: ['Kugel'] }))
    })

    it('lists which of them are "not always", and which a reader found on its menu before', async () => {
      m.listApprovedResources.mockResolvedValue([{ ...listingOf, itemMenu: { dishes: { Falafel: '2026-10-01T12:00:00Z' } } }])
      const place = (await (await GET(req('GET'))).json()).places[0]
      expect(place).toMatchObject({ dishes: ['Falafel', 'Kugel'], sometimes: ['Kugel'], menuDated: ['Falafel'], href: expect.stringContaining('/philly/restaurant/') })
    })
  })
})
