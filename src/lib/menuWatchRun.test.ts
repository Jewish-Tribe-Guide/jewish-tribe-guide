import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { menuHash, MENU_WATCH_CREATOR } from './menuWatch'
import type { Trouble } from './menuReader'

const m = vi.hoisted(() => ({
  listCategoriesUncached: vi.fn(),
  getResourceRowById: vi.fn(),
  getMenuReading: vi.fn(),
  readMenuPage: vi.fn(),
  readMenu: vi.fn(),
  findMenus: vi.fn(),
  readMenus: vi.fn(),
  listMenuReadings: vi.fn(),
  saveMenuReading: vi.fn(),
  dateMenuDishes: vi.fn(),
  addWatch: vi.fn(),
  listWatches: vi.fn(),
  removeWatch: vi.fn(),
  communities: [{ slug: 'philly' }] as { slug: string }[],
  resources: [] as unknown[],
}))
vi.mock('@/lib/categoryStore', () => ({ listCategoriesUncached: m.listCategoriesUncached }))
vi.mock('@/lib/resourceStore', () => ({
  getResourceRowById: m.getResourceRowById,
  normalizeRow: (r: { details?: Record<string, unknown> }) => ({ ...r, ...(r.details ?? {}) }),
}))
vi.mock('@/lib/menuReader', async (orig) => ({ ...(await orig<typeof import('./menuReader')>()), readMenuPage: m.readMenuPage, readMenu: m.readMenu, findMenus: m.findMenus, readMenus: m.readMenus }))
vi.mock('@/lib/menuReadingStore', () => ({ saveMenuReading: m.saveMenuReading, getMenuReading: m.getMenuReading, listMenuReadings: m.listMenuReadings, dateMenuDishes: m.dateMenuDishes }))
vi.mock('@/lib/watchStore', () => ({ addWatch: m.addWatch, listWatches: m.listWatches, removeWatch: m.removeWatch }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const result = { data: table === 'community' ? m.communities : m.resources, error: null }
      const q = { select: () => q, eq: () => q, in: () => q, then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok) }
      return q
    },
  }),
}))

const { runMenuWatch, syncMenuWatches, newMenuReadBudget, MENU_READS_PER_RUN } = await import('./menuWatchRun')

const food = makeCategory({
  id: 'restaurant',
  detailFields: [{ key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'main dish' }],
})
const URL_ = 'https://judah.example/menu'
const row = { id: 'r1', category: 'restaurant', name: 'Judah', status: 'approved', details: { dishes: ['Falafel'], menuUrl: URL_ } }
const page = { url: URL_, text: 'Falafel plate. Shawarma laffa. '.repeat(10), pdf: null }
const watch = { communityId: 'philly', url: URL_, resourceId: 'r1', pageHash: null as string | null }
// A place watched on a page the reader found, on its own website.
const site = makeCategory({
  id: 'restaurant',
  detailFields: [
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'main dish' },
  ],
})
const FOUND = 'https://shalom.example/menu'
const MOVED = 'https://shalom.example/our-food'
const foundRow = { id: 'r2', category: 'restaurant', name: 'Shalom', status: 'approved', details: { dishes: ['Falafel'], website: 'https://shalom.example' } }
const foundReading = { resourceId: 'r2', status: 'proposed', sourceUrl: FOUND, dishes: [{ name: 'Falafel', quote: 'Falafel plate', checked: true }], note: null }
const foundWatch = { communityId: 'philly', url: FOUND, resourceId: 'r2', pageHash: 'old' }
const twoDishes = { sourceUrl: URL_, dishes: [{ name: 'Falafel', quote: 'Falafel plate', checked: true }, { name: 'Shawarma', quote: 'Shawarma laffa', checked: true }], note: null, model: 'gpt' }

beforeEach(() => {
  vi.clearAllMocks()
  m.listCategoriesUncached.mockResolvedValue([food])
  m.getResourceRowById.mockResolvedValue(row)
  m.readMenuPage.mockResolvedValue(page)
  m.readMenu.mockResolvedValue(twoDishes)
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.addWatch.mockImplementation(async () => ({ id: 'new' }))
  m.listMenuReadings.mockResolvedValue({ readings: [], available: true })
  m.getMenuReading.mockResolvedValue(null)
  m.findMenus.mockResolvedValue([])
  m.resources = [row]
})

describe('runMenuWatch', () => {
  it('the first read only sets the fingerprint: no AI', async () => {
    const out = await runMenuWatch(watch, undefined, { apiKey: 'k' })
    expect(out).toEqual({ ok: true, filed: 0, pageHash: menuHash(page) })
    expect(m.readMenu).not.toHaveBeenCalled()
  })

  it('an unchanged menu is left alone: no AI', async () => {
    expect(await runMenuWatch({ ...watch, pageHash: menuHash(page) }, undefined, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, pageHash: menuHash(page) })
    expect(m.readMenu).not.toHaveBeenCalled()
  })

  // The user, Oct 23: "Everything should date what they check." A menu
  // that hasn't changed still names what it named.
  it('an unchanged menu dates again each dish dated from it, not one its last read found missing', async () => {
    m.getResourceRowById.mockResolvedValue({ ...row, details: { ...row.details, dishes: ['Falafel', 'Kugel'], itemMenu: { dishes: { Falafel: '2026-10-01T00:00:00Z', Kugel: '2026-10-01T00:00:00Z' } } } })
    m.getMenuReading.mockResolvedValue({ status: 'proposed', dishes: [{ name: 'Falafel' }], missing: ['kugel'] })
    await runMenuWatch({ ...watch, pageHash: menuHash(page) }, undefined, { apiKey: 'k' })
    expect(m.dateMenuDishes).toHaveBeenCalledWith('philly', 'r1', 'dishes', ['Falafel'])
  })

  // Oct 27, Charlie was a sinner.: its dishes said "seen today" while the
  // Menus line said its menu was never read. Dated by a read on Oct 17,
  // before readings were kept, they were dated again every morning its
  // home page hadn't changed, though nothing ever found them on it.
  it('an unchanged menu dates nothing when no kept reading found dishes on it', async () => {
    m.getResourceRowById.mockResolvedValue({ ...row, details: { ...row.details, dishes: ['Falafel'], itemMenu: { dishes: { Falafel: '2026-10-17T00:00:00Z' } } } })
    for (const kept of [null, { status: 'failed', dishes: [], missing: [] }, { status: 'skipped', dishes: [], missing: [] }]) {
      m.getMenuReading.mockResolvedValue(kept)
      expect(await runMenuWatch({ ...watch, pageHash: menuHash(page) }, undefined, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, pageHash: menuHash(page) })
    }
    expect(m.dateMenuDishes).not.toHaveBeenCalled()
  })

  it('the first read dates nothing', async () => {
    await runMenuWatch(watch, undefined, { apiKey: 'k' })
    expect(m.dateMenuDishes).not.toHaveBeenCalled()
  })

  it('a changed menu is read by the AI, and dishes the listing doesn’t have wait on the Main dishes tab', async () => {
    const out = await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: 'k' })
    expect(out).toEqual({
      ok: true,
      filed: 1,
      pageHash: menuHash(page),
      check: { what: 'dishes', from: 'page', result: 'differs', read: ['Falafel, Shawarma'], differences: ['Not on the listing: Shawarma'], queue: 'filed' },
    })
    expect(m.readMenu).toHaveBeenCalledWith(page, 'Judah', expect.objectContaining({ apiKey: 'k' }))
    expect(m.saveMenuReading).toHaveBeenCalledWith('philly', 'r1', expect.objectContaining({ status: 'proposed', dishes: twoDishes.dishes, note: 'Its menu changed. One dish isn’t on the listing yet: Shawarma.' }))
  })

  it('a changed menu with nothing new proposes nothing, and moves on', async () => {
    m.readMenu.mockResolvedValue({ ...twoDishes, dishes: [twoDishes.dishes[0]] })
    expect(await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: 'k' })).toEqual({
      ok: true,
      filed: 0,
      pageHash: menuHash(page),
      check: { what: 'dishes', from: 'page', result: 'agrees', read: ['Falafel'], differences: [], queue: null },
    })
    expect(m.saveMenuReading).not.toHaveBeenCalled()
    // …and dates the dishes it read (the user, Oct 23).
    expect(m.dateMenuDishes).toHaveBeenCalledWith('philly', 'r1', 'dishes', ['Falafel'])
  })

  // Rita's, Oct 22: its menu link is its location's page; its flavors are
  // on the site's Treats page. Each page is an AI read from the budget.
  it('a changed menu is read with the other menu pages on its website, each an AI read', async () => {
    m.listCategoriesUncached.mockResolvedValue([site])
    m.getResourceRowById.mockResolvedValue({ ...row, details: { ...row.details, website: 'https://judah.example' } })
    const treats = { url: 'https://judah.example/treats', text: 'Blendini.', pdf: null }
    m.findMenus.mockResolvedValue([page, treats])
    m.readMenus.mockResolvedValue(twoDishes)
    const budget = { aiReads: 5 }
    await runMenuWatch({ ...watch, pageHash: 'old' }, budget, { apiKey: 'k' })
    expect(m.findMenus).toHaveBeenCalledWith('https://judah.example', expect.anything())
    expect(m.readMenus).toHaveBeenCalledWith([page, treats], 'Judah', expect.objectContaining({ apiKey: 'k' }))
    expect(budget.aiReads).toBe(3)
    // With one read left, only its own page.
    const last = { aiReads: 1 }
    await runMenuWatch({ ...watch, pageHash: 'old' }, last, { apiKey: 'k' })
    expect(m.readMenu).toHaveBeenCalledWith(page, 'Judah', expect.anything())
    expect(last.aiReads).toBe(0)
  })

  it('without the AI, or with the run’s reads spent, the old fingerprint stays so the change is still news', async () => {
    expect(await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: undefined })).toEqual({ ok: true, filed: 0 })
    const budget = { aiReads: 1 }
    expect((await runMenuWatch({ ...watch, pageHash: 'old' }, budget, { apiKey: 'k' })).ok).toBe(true)
    expect(budget.aiReads).toBe(0)
    expect(await runMenuWatch({ ...watch, pageHash: 'old' }, budget, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, skipped: true })
    expect(m.readMenu).toHaveBeenCalledTimes(1)
    expect(newMenuReadBudget().aiReads).toBeGreaterThan(0)
  })

  // Oct 26: the menus are checked last, so the shul and mikvah pages had
  // spent the run's reads before any changed menu got one (Goldie's waited
  // from Oct 22). A menu has its own reads, taken first.
  it('a changed menu reads from the menus’ own reads first, then the run’s', async () => {
    const budget = { ...newMenuReadBudget(), aiReads: 0 }
    expect(budget.menuReads).toBe(MENU_READS_PER_RUN)
    expect(await runMenuWatch({ ...watch, pageHash: 'old' }, budget, { apiKey: 'k' })).toMatchObject({ ok: true, filed: 1 })
    expect(m.readMenu).toHaveBeenCalledTimes(1)
    expect(budget).toMatchObject({ menuReads: MENU_READS_PER_RUN - 1, aiReads: 0 })
    const last = { aiReads: 1, menuReads: 0 }
    expect((await runMenuWatch({ ...watch, pageHash: 'old' }, last, { apiKey: 'k' })).ok).toBe(true)
    expect(last).toEqual({ aiReads: 0, menuReads: 0 })
    expect(await runMenuWatch({ ...watch, pageHash: 'old' }, last, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, skipped: true })
    expect(m.readMenu).toHaveBeenCalledTimes(2)
  })

  it('the other menu pages on its website take from the menus’ reads, then the run’s', async () => {
    m.listCategoriesUncached.mockResolvedValue([site])
    m.getResourceRowById.mockResolvedValue({ ...row, details: { ...row.details, website: 'https://judah.example' } })
    const treats = { url: 'https://judah.example/treats', text: 'Blendini.', pdf: null }
    const drinks = { url: 'https://judah.example/drinks', text: 'Lemonade.', pdf: null }
    m.findMenus.mockResolvedValue([page, treats, drinks])
    m.readMenus.mockResolvedValue(twoDishes)
    const budget = { aiReads: 1, menuReads: 2 }
    await runMenuWatch({ ...watch, pageHash: 'old' }, budget, { apiKey: 'k' })
    expect(m.readMenus).toHaveBeenCalledWith([page, treats, drinks], 'Judah', expect.anything())
    expect(budget).toEqual({ aiReads: 0, menuReads: 0 })
  })

  it('a menu that can’t be read, a listing gone, or the AI failing is a watch not working, with the reason', async () => {
    m.readMenuPage.mockResolvedValueOnce(null)
    expect(await runMenuWatch(watch, undefined, { apiKey: 'k' })).toMatchObject({ ok: false, error: expect.stringContaining('Couldn’t read the menu') })
    m.getResourceRowById.mockResolvedValueOnce({ ...row, status: 'archived' })
    expect(await runMenuWatch(watch, undefined, { apiKey: 'k' })).toMatchObject({ ok: false, error: expect.stringContaining('isn’t in the guide') })
    m.readMenu.mockRejectedValueOnce(new Error('429'))
    const failed = await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: 'k' })
    expect(failed).toMatchObject({ ok: false, error: expect.stringContaining('429') })
  })
})

// The user, Oct 20: "Check now" is the full check, the AI reading the menu
// changed or not, and saying which dishes it read.
describe('runMenuWatch: "Check now"', () => {
  const full = { apiKey: 'k', full: true }

  it('reads an unchanged menu with the AI and says which dishes the listing lacks', async () => {
    const out = await runMenuWatch({ ...watch, pageHash: menuHash(page) }, undefined, full)
    expect(out).toMatchObject({ ok: true, filed: 1, pageHash: menuHash(page), check: { result: 'differs', read: ['Falafel, Shawarma'], queue: 'filed' } })
    expect(m.saveMenuReading).toHaveBeenCalledTimes(1)
  })

  // Oct 20: a menu posted as pictures says it was read from them.
  it('says when it read the menu’s pictures, not the page’s words', async () => {
    m.readMenu.mockResolvedValue({ ...twoDishes, fromPictures: true })
    const out = await runMenuWatch({ ...watch, pageHash: menuHash(page) }, undefined, full)
    expect(out).toMatchObject({ ok: true, check: { from: 'pictures', read: ['Falafel, Shawarma'] } })
  })

  it('doesn’t make the same reading again: one waiting or skipped on the Main dishes tab stands', async () => {
    for (const status of ['proposed', 'skipped']) {
      m.getMenuReading.mockResolvedValue({ status, dishes: [{ name: 'shawarma' }] })
      expect(await runMenuWatch({ ...watch, pageHash: menuHash(page) }, undefined, full)).toMatchObject({ filed: 0, check: { result: 'differs', queue: 'before' } })
    }
    expect(m.saveMenuReading).not.toHaveBeenCalled()
  })

  it('says when the menu wouldn’t open', async () => {
    m.readMenuPage.mockResolvedValue(null)
    expect(await runMenuWatch(watch, undefined, full)).toMatchObject({ ok: false, check: { what: 'dishes', result: 'unreadable' } })
  })
})

// The user, Oct 21: the listing's dishes, hand-added ones too, are looked
// for on every read, and one its menu no longer names is flagged.
describe('runMenuWatch: the listing’s own dishes', () => {
  const gone = { sourceUrl: URL_, dishes: [{ name: 'Shawarma', quote: 'Shawarma laffa', checked: true }], note: null, model: 'gpt', missing: ['Falafel'] }

  it('the AI is given them; one the changed menu doesn’t name waits on the Main dishes tab, with nothing new', async () => {
    m.readMenu.mockResolvedValue({ ...gone, dishes: [{ name: 'Falafel', quote: 'Falafel plate', checked: true, onListing: true }], missing: [] })
    expect(await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: 'k' })).toMatchObject({ filed: 0 })
    expect(m.readMenu).toHaveBeenLastCalledWith(page, 'Judah', expect.objectContaining({ listed: ['Falafel'] }))

    m.readMenu.mockResolvedValue({ sourceUrl: URL_, dishes: [{ name: 'Kugel', quote: 'Kugel', checked: true }], note: null, model: 'gpt', missing: ['Falafel'] })
    m.getResourceRowById.mockResolvedValue({ ...row, details: { ...row.details, dishes: ['Falafel', 'Kugel'] } })
    const out = await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: 'k' })
    expect(out).toMatchObject({ ok: true, filed: 1, check: { differences: ['Not on the menu: Falafel'], queue: 'filed' } })
    expect(m.saveMenuReading).toHaveBeenLastCalledWith(
      'philly',
      'r1',
      expect.objectContaining({ status: 'proposed', missing: ['Falafel'], note: 'Its menu changed. One listed dish isn’t on it any more: Falafel.' }),
    )
  })

  it('says both, new dishes and missing ones', async () => {
    m.readMenu.mockResolvedValue(gone)
    const out = await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: 'k' })
    expect(out).toMatchObject({ filed: 1, check: { differences: ['Not on the listing: Shawarma', 'Not on the menu: Falafel'] } })
    expect(m.saveMenuReading).toHaveBeenLastCalledWith('philly', 'r1', expect.objectContaining({ note: 'Its menu changed. One dish isn’t on the listing yet: Shawarma. One listed dish isn’t on it any more: Falafel.' }))
  })

  it('"Check now" files again when a listed dish has gone since the reading waiting', async () => {
    m.readMenu.mockResolvedValue(gone)
    m.getMenuReading.mockResolvedValue({ status: 'proposed', dishes: [{ name: 'Shawarma' }], missing: [] })
    expect(await runMenuWatch({ ...watch, pageHash: menuHash(page) }, undefined, { apiKey: 'k', full: true })).toMatchObject({ filed: 1 })
    m.getMenuReading.mockResolvedValue({ status: 'proposed', dishes: [{ name: 'Shawarma' }], missing: ['falafel'] })
    expect(await runMenuWatch({ ...watch, pageHash: menuHash(page) }, undefined, { apiKey: 'k', full: true })).toMatchObject({ filed: 0, check: { queue: 'before' } })
  })
})

// The user, Oct 26: "for the menu items that I manually added that you could
// see on the menu it looks like they're not getting picked up by the reader."
// On production none of them had been looked for: Espresso Cafe's Bagels and
// Dottie's flavors were added after the Oct 22 reads, and a menu that hasn't
// changed is never read by the AI. Asked, it found all 33.
describe('runMenuWatch: dishes added since its last read', () => {
  const dated = { ...row, details: { ...row.details, dishes: ['Falafel', 'Bagels'], itemMenu: { dishes: { Falafel: '2026-10-22T00:00:00Z' } } } }
  const kept = { status: 'approved', sourceUrl: URL_, dishes: [{ name: 'Falafel', quote: 'Falafel plate', checked: true }], missing: [] }
  const unchanged = { ...watch, pageHash: menuHash(page) }

  beforeEach(() => {
    m.getResourceRowById.mockResolvedValue(dated)
    m.getMenuReading.mockResolvedValue(kept)
  })

  it('an unchanged menu is read again for them, and one it names is dated from it', async () => {
    m.readMenu.mockResolvedValue({ ...twoDishes, dishes: [twoDishes.dishes[0], { name: 'Bagels', quote: 'Cream Cheese Bagel', checked: true, onListing: true }], missing: [] })
    expect(await runMenuWatch(unchanged, newMenuReadBudget(), { apiKey: 'k' })).toMatchObject({ ok: true, filed: 0, pageHash: menuHash(page), check: { result: 'agrees' } })
    expect(m.readMenu).toHaveBeenCalledWith(page, 'Judah', expect.objectContaining({ listed: ['Falafel', 'Bagels'] }))
    expect(m.dateMenuDishes).toHaveBeenCalledWith('philly', 'r1', 'dishes', ['Falafel', 'Bagels'])
  })

  it('one it doesn’t name waits on the kind page, without saying the menu changed', async () => {
    m.readMenu.mockResolvedValue({ ...twoDishes, dishes: [twoDishes.dishes[0]], missing: ['Bagels'] })
    expect(await runMenuWatch(unchanged, newMenuReadBudget(), { apiKey: 'k' })).toMatchObject({ filed: 1 })
    expect(m.saveMenuReading).toHaveBeenCalledWith('philly', 'r1', expect.objectContaining({ status: 'proposed', missing: ['Bagels'], note: 'One listed dish isn’t on it any more: Bagels.' }))
  })

  it('from the run’s AI reads: past them, it waits for a run with room', async () => {
    const out = await runMenuWatch(unchanged, { ...newMenuReadBudget(), aiReads: 0, menuReads: 0 }, { apiKey: 'k' })
    expect(out).toEqual({ ok: true, filed: 0, skipped: true })
    expect(m.readMenu).not.toHaveBeenCalled()
  })

  it('not once its reading has looked for them, nor after a reading only from pictures', async () => {
    m.getMenuReading.mockResolvedValue({ ...kept, missing: ['Bagels'] })
    await runMenuWatch(unchanged, newMenuReadBudget(), { apiKey: 'k' })
    m.getMenuReading.mockResolvedValue({ ...kept, dishes: [{ ...kept.dishes[0], picture: true }] })
    await runMenuWatch(unchanged, newMenuReadBudget(), { apiKey: 'k' })
    expect(m.readMenu).not.toHaveBeenCalled()
  })
})

describe('syncMenuWatches', () => {
  it('gives each food place with a menu link its watch, marked as the run’s own', async () => {
    expect(await syncMenuWatches()).toEqual([{ community: 'philly', added: 1, removed: 0 }])
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: URL_, resourceId: 'r1', label: 'Menu · Judah', createdBy: MENU_WATCH_CREATOR })
  })

  it('takes away its own watch on a link the place doesn’t have any more, and never an admin’s', async () => {
    m.resources = [{ ...row, details: { dishes: ['Falafel'] } }]
    m.listWatches.mockResolvedValue({
      watches: [
        { id: 'w1', url: URL_, resourceId: 'r1', createdBy: MENU_WATCH_CREATOR },
        { id: 'w2', url: 'https://shul.example/times', resourceId: null, createdBy: 'me@x.co' },
      ],
      available: true,
    })
    expect(await syncMenuWatches()).toEqual([{ community: 'philly', added: 0, removed: 1 }])
    expect(m.removeWatch).toHaveBeenCalledWith('philly', 'w1')
    expect(m.removeWatch).toHaveBeenCalledTimes(1)
  })

  // Oct 21: a place with no menu link yet is watched on the page its
  // reading found the menu on, and the watch follows the reading.
  it('watches the page the reader found, for a place with no menu link', async () => {
    m.listCategoriesUncached.mockResolvedValue([site])
    m.resources = [foundRow]
    m.listMenuReadings.mockResolvedValue({ readings: [foundReading], available: true })
    expect(await syncMenuWatches()).toEqual([{ community: 'philly', added: 1, removed: 0 }])
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: FOUND, resourceId: 'r2', label: 'Menu · Shalom', createdBy: MENU_WATCH_CREATOR })
  })

  it('moves its watch when the reading is from another page now', async () => {
    m.listCategoriesUncached.mockResolvedValue([site])
    m.resources = [foundRow]
    m.listMenuReadings.mockResolvedValue({ readings: [{ ...foundReading, sourceUrl: MOVED }], available: true })
    m.listWatches.mockResolvedValue({ watches: [{ id: 'w1', url: FOUND, resourceId: 'r2', createdBy: MENU_WATCH_CREATOR }], available: true })
    expect(await syncMenuWatches()).toEqual([{ community: 'philly', added: 1, removed: 1 }])
    expect(m.addWatch).toHaveBeenCalledWith('philly', expect.objectContaining({ url: MOVED, resourceId: 'r2' }))
    expect(m.removeWatch).toHaveBeenCalledWith('philly', 'w1')
  })

  it('does nothing before the watch table exists', async () => {
    m.listWatches.mockResolvedValue({ watches: [], available: false })
    expect(await syncMenuWatches()).toEqual([])
    expect(m.addWatch).not.toHaveBeenCalled()
  })
})

// Oct 20: a menu drawn by a script is drawn in a browser (renderPage.ts):
// always for "Check now", within the budget for the daily run, where one
// left undrawn isn't a failure (the run has a minute for every watch).
describe('a menu drawn by a script', () => {
  const drawnPage = { url: URL_, body: `<p>${'Falafel plate. Shawarma laffa. '.repeat(10)}</p>` }
  // readMenuPage, as the real one: a page with nothing on it is drawn when it can be.
  const nearlyEmpty = async (_url: string, opts: { render?: ((u: string) => Promise<unknown>) | null }) => ((await opts.render?.(URL_)) ? page : null)
  const renderer = () => ({ render: vi.fn(async () => drawnPage), close: vi.fn(async () => {}) })

  it('the daily run draws within its budget, then leaves the rest for a run with room, without failing them', async () => {
    m.readMenuPage.mockImplementation(nearlyEmpty)
    const budget = newMenuReadBudget()
    expect(budget.renders).toBe(1)
    const first = renderer()
    expect(await runMenuWatch(watch, budget, { apiKey: 'k', renderer: first })).toEqual({ ok: true, filed: 0, pageHash: menuHash(page) })
    expect(first.render).toHaveBeenCalledTimes(1)
    expect(first.close).toHaveBeenCalled()
    expect(budget.renders).toBe(0)

    const second = renderer()
    expect(await runMenuWatch(watch, budget, { apiKey: 'k', renderer: second })).toEqual({ ok: true, filed: 0, skipped: true })
    expect(second.render).not.toHaveBeenCalled()
  })

  it('“Check now” always draws; one that still can’t be read is a failure, as before', async () => {
    m.readMenuPage.mockImplementation(nearlyEmpty)
    const drawn = renderer()
    const out = await runMenuWatch(watch, { aiReads: 0, renders: 0 }, { apiKey: 'k', renderer: drawn, full: true })
    expect(drawn.render).toHaveBeenCalledTimes(1)
    expect(out.ok).toBe(true)

    const nothing = { render: vi.fn(async () => null), close: vi.fn(async () => {}) }
    expect((await runMenuWatch(watch, newMenuReadBudget(), { apiKey: 'k', renderer: nothing })).ok).toBe(false)
  })

  // Oct 21: the watch says why, as the Main dishes tab does.
  it('a menu that can’t be read says why: the reader’s own reason, or the browser’s', async () => {
    m.readMenuPage.mockImplementation(async (_url: string, opts: { trouble?: (t: unknown) => void }) => {
      opts.trouble?.({ why: 'refused', status: 403 })
      return null
    })
    expect(await runMenuWatch(watch, newMenuReadBudget(), { apiKey: 'k', renderer: null })).toEqual({ ok: false, error: 'Couldn’t read the menu: it turned the reader away (403)' })

    m.readMenuPage.mockImplementation(async (url: string, opts: { render?: ((u: string, t: (t: unknown) => void) => Promise<unknown>) | null; trouble?: (t: unknown) => void }) => {
      await opts.render?.(url, opts.trouble!)
      return null
    })
    const slow = { render: vi.fn(async (_u: string, trouble?: (t: Trouble) => void) => (trouble?.({ why: 'draw_timeout' }), null)), close: vi.fn(async () => {}) }
    expect(await runMenuWatch(watch, newMenuReadBudget(), { apiKey: 'k', renderer: slow })).toEqual({ ok: false, error: 'Couldn’t read the menu: it’s drawn by a script, and took too long to draw' })
  })
})

// Oct 21: a watched menu page that stops opening sends the run back to the
// place's website to find where the menu is now. What it finds waits on the
// Main dishes tab: approving it moves the menu link, so a person moves it.
describe('runMenuWatch: a menu page that stops opening', () => {
  const movedPage = { url: MOVED, text: 'Falafel plate. Shawarma laffa. '.repeat(10), pdf: null }
  const run = (budget?: ReturnType<typeof newMenuReadBudget>) => runMenuWatch(foundWatch, budget, { apiKey: 'k', renderer: null })
  const runWithoutAi = () => runMenuWatch(foundWatch, undefined, { apiKey: undefined, renderer: null })
  beforeEach(() => {
    m.listCategoriesUncached.mockResolvedValue([site])
    m.getResourceRowById.mockResolvedValue(foundRow)
    m.readMenuPage.mockResolvedValue(null)
    m.getMenuReading.mockResolvedValue({ ...foundReading })
  })

  it('searches its website again, keeps what it finds on the new page for the admin, and says so', async () => {
    m.findMenus.mockResolvedValue([{ url: FOUND, text: 'x', pdf: null }, movedPage])
    m.readMenus.mockResolvedValue({ ...twoDishes, sourceUrl: MOVED })
    expect(await run(newMenuReadBudget())).toEqual({
      ok: false,
      error: `Couldn’t read the menu (blocked, moved, or built in the browser). Its menu was found at ${MOVED}, waiting on the Main dishes tab.`,
    })
    expect(m.findMenus).toHaveBeenCalledWith('https://shalom.example', expect.anything())
    // Not the page that just failed.
    expect(m.readMenus).toHaveBeenCalledWith([movedPage], 'Shalom', expect.objectContaining({ apiKey: 'k', listed: ['Falafel'] }))
    expect(m.saveMenuReading).toHaveBeenCalledWith('philly', 'r2', {
      status: 'proposed',
      sourceUrl: MOVED,
      dishes: twoDishes.dishes,
      missing: [],
      note: `Its menu page stopped opening, and the menu is now at ${MOVED}. Approving makes that its menu link. One dish isn’t on the listing yet: Shawarma.`,
      model: 'gpt',
    })
  })

  it('a menu link’s page too: approving the new page is what moves the link', async () => {
    m.getResourceRowById.mockResolvedValue({ ...foundRow, details: { ...foundRow.details, menuUrl: FOUND } })
    m.getMenuReading.mockResolvedValue({ ...foundReading, status: 'approved' })
    m.findMenus.mockResolvedValue([movedPage])
    m.readMenus.mockResolvedValue({ ...twoDishes, sourceUrl: MOVED })
    expect(await run()).toMatchObject({ ok: false, error: expect.stringContaining(`found at ${MOVED}`) })
    expect(m.saveMenuReading).toHaveBeenCalledWith('philly', 'r2', expect.objectContaining({ status: 'proposed', sourceUrl: MOVED }))
  })

  it('no other page of its own site with dishes on it: still failing, and says it searched', async () => {
    const searched = 'Couldn’t read the menu (blocked, moved, or built in the browser). Its website was searched again, and no other page on it has the menu.'
    expect(await run()).toEqual({ ok: false, error: searched })
    m.findMenus.mockResolvedValue([movedPage])
    m.readMenus.mockResolvedValue({ ...twoDishes, sourceUrl: 'https://casino.example/menu' })
    expect(await run()).toEqual({ ok: false, error: searched })
    m.readMenus.mockResolvedValue({ ...twoDishes, sourceUrl: MOVED, dishes: [] })
    expect(await run()).toEqual({ ok: false, error: searched })
    expect(m.saveMenuReading).not.toHaveBeenCalled()
  })

  it('isn’t searched again once its reading is from another page, waiting or decided', async () => {
    for (const status of ['proposed', 'skipped', 'approved']) {
      m.getMenuReading.mockResolvedValue({ ...foundReading, status, sourceUrl: MOVED })
      expect(await run()).toEqual({ ok: false, error: `Couldn’t read the menu (blocked, moved, or built in the browser). Its menu was last read from ${MOVED}: see the Main dishes tab.` })
    }
    expect(m.findMenus).not.toHaveBeenCalled()
  })

  it('the daily run searches within its budget, an AI read included; past it, or without the AI, fails as before', async () => {
    m.findMenus.mockResolvedValue([movedPage])
    m.readMenus.mockResolvedValue({ ...twoDishes, sourceUrl: MOVED })
    const budget = newMenuReadBudget()
    expect(budget.searches).toBe(1)
    await run(budget)
    expect(budget).toMatchObject({ searches: 0, menuReads: MENU_READS_PER_RUN - 1 })
    expect(await run(budget)).toEqual({ ok: false, error: 'Couldn’t read the menu (blocked, moved, or built in the browser)' })
    expect(await runWithoutAi()).toEqual({ ok: false, error: 'Couldn’t read the menu (blocked, moved, or built in the browser)' })
    expect(m.findMenus).toHaveBeenCalledTimes(1)
  })
})

// The user, Oct 28: HipCityVeg, Dottie's Donuts and Playa Bowls weren't
// "seen today". A read that found a dish people added, but had something
// else to ask, dated nothing; once found, the dish was never looked for
// again, and an unchanged menu dated only dishes it had dated before, so it
// never got a date. A branch sharing a menu shares its watch, which dated
// only its own listing.
describe('runMenuWatch: every dish a read found gets its date', () => {
  const unchanged = { ...watch, pageHash: menuHash(page) }

  it('an unchanged menu dates a dish people added that its kept reading found', async () => {
    m.getResourceRowById.mockResolvedValue({ ...row, details: { ...row.details, dishes: ['Falafel', 'Kugel'], itemMenu: { dishes: { Falafel: '2026-10-22T00:00:00Z' } } } })
    m.getMenuReading.mockResolvedValue({ status: 'skipped', sourceUrl: URL_, dishes: [{ name: 'Falafel', quote: 'Falafel plate', checked: true }, { name: 'Kugel', quote: 'Potato kugel', checked: true }], missing: [] })
    expect(await runMenuWatch(unchanged, newMenuReadBudget(), { apiKey: 'k' })).toEqual({ ok: true, filed: 0, pageHash: menuHash(page) })
    expect(m.readMenu).not.toHaveBeenCalled()
    expect(m.dateMenuDishes).toHaveBeenCalledWith('philly', 'r1', 'dishes', expect.arrayContaining(['Falafel', 'Kugel']))
  })

  it('a read with something to ask still dates the listed dishes it found', async () => {
    expect(await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: 'k' })).toMatchObject({ filed: 1 })
    expect(m.saveMenuReading).toHaveBeenCalled()
    expect(m.dateMenuDishes).toHaveBeenCalledWith('philly', 'r1', 'dishes', expect.arrayContaining(['Falafel']))
  })

  it('a dish the read found missing is never dated', async () => {
    m.getResourceRowById.mockResolvedValue({ ...row, details: { ...row.details, dishes: ['Falafel', 'Kugel'] } })
    m.readMenu.mockResolvedValue({ ...twoDishes, dishes: [twoDishes.dishes[0]], missing: ['Kugel'] })
    await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: 'k' })
    for (const call of m.dateMenuDishes.mock.calls) expect(call[3]).not.toContain('Kugel')
  })

  const branch = { id: 'r9', category: 'restaurant', name: 'Judah', status: 'approved', details: { dishes: ['falafel', 'Kugel'], menuUrl: URL_ } }
  const elsewhere = { id: 'r8', category: 'restaurant', name: 'Other', status: 'approved', details: { dishes: ['Falafel'], menuUrl: 'https://other.example/menu' } }

  it('a branch on the same menu link gets the dates too, by its own names', async () => {
    m.resources = [row, branch, elsewhere]
    m.readMenu.mockResolvedValue({ ...twoDishes, dishes: [twoDishes.dishes[0]] })
    await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: 'k' })
    expect(m.dateMenuDishes).toHaveBeenCalledWith('philly', 'r9', 'dishes', ['falafel'])
    expect(m.dateMenuDishes.mock.calls.map((c) => c[1])).not.toContain('r8')
  })

  it('so does a branch whose menu hasn’t changed', async () => {
    m.resources = [row, branch, elsewhere]
    m.getResourceRowById.mockResolvedValue({ ...row, details: { ...row.details, itemMenu: { dishes: { Falafel: '2026-10-22T00:00:00Z' } } } })
    m.getMenuReading.mockResolvedValue({ status: 'approved', sourceUrl: URL_, dishes: [{ name: 'Falafel', quote: 'Falafel plate', checked: true }], missing: [] })
    await runMenuWatch(unchanged, newMenuReadBudget(), { apiKey: 'k' })
    expect(m.dateMenuDishes).toHaveBeenCalledWith('philly', 'r9', 'dishes', ['falafel'])
  })
})
