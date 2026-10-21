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
  saveMenuReading: vi.fn(),
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
vi.mock('@/lib/menuReader', async (orig) => ({ ...(await orig<typeof import('./menuReader')>()), readMenuPage: m.readMenuPage, readMenu: m.readMenu }))
vi.mock('@/lib/menuReadingStore', () => ({ saveMenuReading: m.saveMenuReading, getMenuReading: m.getMenuReading }))
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

const { runMenuWatch, syncMenuWatches, newMenuReadBudget } = await import('./menuWatchRun')

const food = makeCategory({
  id: 'restaurant',
  detailFields: [{ key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'main dish' }],
})
const URL_ = 'https://judah.example/menu'
const row = { id: 'r1', category: 'restaurant', name: 'Judah', status: 'approved', details: { dishes: ['Falafel'], menuUrl: URL_ } }
const page = { url: URL_, text: 'Falafel plate. Shawarma laffa. '.repeat(10), pdf: null }
const watch = { communityId: 'philly', url: URL_, resourceId: 'r1', pageHash: null as string | null }
const twoDishes = { sourceUrl: URL_, dishes: [{ name: 'Falafel', quote: 'Falafel plate', checked: true }, { name: 'Shawarma', quote: 'Shawarma laffa', checked: true }], note: null, model: 'gpt' }

beforeEach(() => {
  vi.clearAllMocks()
  m.listCategoriesUncached.mockResolvedValue([food])
  m.getResourceRowById.mockResolvedValue(row)
  m.readMenuPage.mockResolvedValue(page)
  m.readMenu.mockResolvedValue(twoDishes)
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.addWatch.mockImplementation(async () => ({ id: 'new' }))
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
  })

  it('without the AI, or with the run’s reads spent, the old fingerprint stays so the change is still news', async () => {
    expect(await runMenuWatch({ ...watch, pageHash: 'old' }, undefined, { apiKey: undefined })).toEqual({ ok: true, filed: 0 })
    const budget = { aiReads: 1 }
    expect((await runMenuWatch({ ...watch, pageHash: 'old' }, budget, { apiKey: 'k' })).ok).toBe(true)
    expect(budget.aiReads).toBe(0)
    expect(await runMenuWatch({ ...watch, pageHash: 'old' }, budget, { apiKey: 'k' })).toEqual({ ok: true, filed: 0 })
    expect(m.readMenu).toHaveBeenCalledTimes(1)
    expect(newMenuReadBudget().aiReads).toBeGreaterThan(0)
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
    expect(await runMenuWatch(watch, budget, { apiKey: 'k', renderer: second })).toEqual({ ok: true, filed: 0 })
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
