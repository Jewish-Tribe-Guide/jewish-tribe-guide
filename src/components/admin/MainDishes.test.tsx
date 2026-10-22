// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { fetchJson } from '@/lib/fetchJson'
import { day } from './JobPage'
import MainDishes, { READ_ON_LOAD, dishSay } from './MainDishes'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/dishes',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

// Charlie was a sinner. on dev, Oct 21 (the drawing's place): its menu no
// longer names three dishes a reader found on it before.
const read = {
  status: 'proposed',
  sourceUrl: 'https://charlie.example/menu',
  dishes: [
    { name: 'Sliders', quote: 'BEEF SLIDERS', checked: true, named: true },
    { name: 'Tacos', quote: 'Fish tacos', checked: true, named: true },
    { name: 'Kofta', quote: 'Lamb kofta', checked: false },
  ],
  missing: ['Tofu', 'Beets', 'Laffa'],
  note: null,
  model: 'gpt-6-luna',
  readAt: '2026-10-21T15:00:00Z',
  decidedAt: null,
  decidedBy: null,
}
const charlie = {
  id: 'p1',
  name: 'Charlie was a sinner.',
  href: '/philly/food/charlie',
  categoryLabel: 'Food',
  facts: [],
  website: 'https://charlie.example',
  menuUrl: 'https://charlie.example/menu',
  // Laffa was added by hand: no menu date.
  dishes: ['Sliders', 'Tacos', 'Tofu', 'Beets', 'Laffa'],
  menuDated: ['Sliders', 'Tacos', 'Tofu', 'Beets'],
  reading: read,
}
const unread = { id: 'p2', name: 'Bar Bombón', href: '/philly/food/bb', categoryLabel: 'Food', facts: [], website: 'https://bb.example', menuUrl: null, dishes: [], reading: null }
const failed = { ...unread, id: 'p3', name: 'Slices', website: 'https://slices.example', reading: { ...read, status: 'failed', sourceUrl: 'https://slices.example', readAt: '2026-10-20T15:00:00Z', dishes: [], missing: [], note: 'No menu on its website', model: null } }

async function renderPage(places: unknown[], { available = true, readerOn = false, post = {} as Record<string, unknown> } = {}) {
  vi.mocked(fetchJson).mockImplementation(async (_url, init) => (init?.method === 'POST' ? { ok: true, ...post } : { ok: true, places, available, readerOn }))
  renderWithProviders(<MainDishes token="tok" />, { community: { slug: 'philly' } })
  await screen.findByTestId('job-counts')
}

const posted = () =>
  vi
    .mocked(fetchJson)
    .mock.calls.filter(([, init]) => init?.method === 'POST' && typeof init.body === 'string')
    .map(([, init]) => JSON.parse(String(init!.body)))

const open = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }))
  return screen.getByRole('region', { name })
}
const today = () => day(new Date().toISOString())

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('dishSay', () => {
  it('says whether anything needs you, and what isn’t read yet', () => {
    expect(dishSay(['differs', 'same']).head).toBe('1 place has an update from its menu.')
    expect(dishSay(['differs', 'differs', 'not_read']).head).toBe('2 places have an update from their menus. 1 not read yet.')
    expect(dishSay(['same', 'off']).head).toBe('No place’s menu has an update.')
  })
})

describe('MainDishes', () => {
  it('puts each place in its tab, with one pill on its row', async () => {
    await renderPage([charlie, unread, failed])
    expect(screen.getByTestId('job-counts').textContent).toBe('1 place has an update from its menu. 1 not read yet.')
    expect(screen.getByRole('tab', { name: 'To check 2' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Can’t be read 1' })).toBeTruthy()
    const pills = screen.getAllByTestId('job-row').map((r) => [within(r).getByRole('button').textContent, within(r).getByTestId('job-status').textContent])
    expect(pills).toEqual([
      ['Bar BombónNot read yet›', 'Not read yet'],
      ['Charlie was a sinner.1 update›', '1 update'],
    ])
  })

  it('opened: the listing’s dishes marked by the menu, a hand-added one kept, and where it read them', async () => {
    await renderPage([charlie])
    const place = await open('Charlie was a sinner.')
    const box = within(place).getByRole('region', { name: 'Main dishes' })
    expect(within(box).getByTestId('box-pill').textContent).toBe('3 updates')
    const rows = within(box)
      .getAllByTestId('box-row')
      .map((r) => [r.getAttribute('data-mark'), r.textContent])
    expect(rows).toEqual([
      ['gone', 'Not on the menuTofu'],
      ['gone', 'Not on the menuBeets'],
      ['same', 'Sliders“BEEF SLIDERS”'],
      ['same', 'Tacos“Fish tacos”'],
      ['new', 'Kofta“Lamb kofta”'],
      // Added by hand, so missing it says nothing: kept, not crossed out.
      ['same', 'LaffaNot found on the menu'],
    ])
    expect(within(box).getByTestId('box-source').textContent).toBe('From charlie.example/menu · read Oct 21 · from a PDF, open it to check')
    const reads = within(place).getByTestId('job-reads')
    expect(within(reads).getByTestId('box-pill').textContent).toBe('1 page')
    // Closed below an update.
    expect(within(reads).queryByTestId('job-source')).toBeNull()
    await userEvent.click(within(reads).getByRole('button', { name: /Reads/ }))
    expect(within(reads).getByTestId('job-source').textContent).toContain('Menu link · Main dishes')
    expect(within(place).getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', '/philly/food/charlie')
  })

  it('Use this: sent, and the box and row say it was used', async () => {
    await renderPage([charlie], { post: { dishes: ['Sliders', 'Tacos', 'Laffa', 'Kofta'], sometimes: [], menuDated: ['Sliders', 'Tacos', 'Kofta'] } })
    const place = await open('Charlie was a sinner.')
    await userEvent.click(within(place).getByRole('button', { name: 'Use this' }))
    expect(posted()).toEqual([{ action: 'use', resourceId: 'p1' }])
    expect(within(place).getByRole('region', { name: 'Main dishes' }).querySelector('[data-testid="box-pill"]')!.textContent).toBe(`Used ${today()}`)
    expect(screen.getByTestId('job-status').textContent).toBe(`Used ${today()}`)
    expect(within(place).queryByRole('button', { name: 'Use this' })).toBeNull()
  })

  it('Keep the listing: sent as skip, and said where it was', async () => {
    await renderPage([charlie])
    const place = await open('Charlie was a sinner.')
    await userEvent.click(within(place).getByRole('button', { name: 'Keep the listing' }))
    expect(posted()).toEqual([{ action: 'skip', resourceId: 'p1' }])
    expect(screen.getByTestId('job-status').textContent).toBe(`Kept ${today()}`)
  })

  it('Edit: the listing’s own dishes editor, started from the menu’s list, saved straight to the listing', async () => {
    const dishes = { key: 'dishes', label: 'Main dishes', type: 'tags' as const, renderAs: 'badge' as const, showCountInHeader: true, countLabel: 'main dish' }
    const category = makeCategory({ id: 'food', detailFields: [dishes] })
    const item = makeListing({ id: 'p1', name: 'Charlie was a sinner.', dishes: charlie.dishes })
    vi.mocked(fetchJson).mockImplementation(async (url, init) =>
      init?.method === 'POST' ? { ok: true } : String(url).includes('item=p1') ? { ok: true, item, category } : { ok: true, places: [charlie], available: true, readerOn: false },
    )
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, dishes: ['Sliders'], sometimes: [], menuDated: ['Sliders'] }), { status: 200 }))
    renderWithProviders(<MainDishes token="tok" />, { community: { slug: 'philly' } })
    await screen.findByTestId('job-counts')
    const place = await open('Charlie was a sinner.')
    await userEvent.click(within(place).getByRole('button', { name: 'Edit' }))
    const save = await screen.findByRole('button', { name: 'Save to the listing' })
    // Its menu link is in Reads, not here.
    expect(screen.queryByLabelText('Menu link')).toBeNull()
    await userEvent.click(save)
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('main-dishes'))!
    expect(String(url)).toContain('/api/admin/main-dishes')
    expect(JSON.parse(String(init!.body))).toEqual({ action: 'save', resourceId: 'p1', always: ['Sliders', 'Tacos', 'Laffa', 'Kofta'], sometimes: [] })
    expect(await screen.findByText(`Used ${today()}`, { selector: '[data-testid="job-status"]' })).toBeTruthy()
    fetchMock.mockRestore()
  })

  it('can’t be read: Reads open, why on its page, and photos or No menu', async () => {
    await renderPage([failed], { readerOn: true, post: { reading: { ...failed.reading, status: 'no_menu', sourceUrl: null } } })
    expect(screen.getByRole('tab', { name: 'Can’t be read 1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('job-status').textContent).toBe('No menu found')
    const place = await open('Slices')
    expect(within(place).queryByRole('region', { name: 'Main dishes' })).toBeNull()
    const page = within(place).getByTestId('job-source')
    expect(page.textContent).toContain('No menu on its website')
    expect(page.textContent).toContain('no menu')
    expect(within(place).getByLabelText('Photos of Slices’s menu')).toBeTruthy()
    await userEvent.click(within(place).getByRole('button', { name: 'No menu' }))
    expect(posted()).toEqual([{ action: 'no_menu', resourceId: 'p3' }])
  })

  // Oct 22: the Watches tab no longer lists menu watches, so a menu page
  // that stopped opening is said here.
  it('a menu page that didn’t open this morning: Can’t be read, and its line in Reads says so', async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
    const menuWatch = { url: 'https://charlie.example/menu', active: true, lastRunAt: hoursAgo(2), lastOkAt: hoursAgo(30), lastError: 'The page answered 404', failingSince: hoursAgo(2) }
    const approved = { ...charlie, dishes: ['Sliders', 'Tacos', 'Kofta'], menuDated: ['Sliders', 'Tacos', 'Kofta'], reading: { ...read, status: 'approved', missing: [], readAt: hoursAgo(30) }, menuWatch }
    await renderPage([approved])
    expect(screen.getByRole('tab', { name: 'Can’t be read 1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('job-status').textContent).toBe('Menu didn’t load')
    const place = await open('Charlie was a sinner.')
    const line = within(within(place).getByTestId('job-reads')).getByTestId('job-source')
    expect(line.textContent).toContain('charlie.example/menu')
    expect(line.textContent).toContain('didn’t load')
  })

  it('photos of the menu are sent as a form', async () => {
    await renderPage([failed], { readerOn: true, post: { reading: { ...read, sourceUrl: null } } })
    const place = await open('Slices')
    await userEvent.upload(within(place).getByLabelText('Photos of Slices’s menu'), new File(['JPEG'], 'menu.jpg', { type: 'image/jpeg' }))
    const [, init] = vi.mocked(fetchJson).mock.calls.find(([, i]) => i?.body instanceof FormData)!
    const body = init!.body as FormData
    expect([body.get('action'), body.get('resourceId'), (body.get('file') as File).name]).toEqual(['photos', 'p3', 'menu.jpg'])
  })

  it('the Reading switch is No menu: off, then on again', async () => {
    await renderPage([charlie], { post: { reading: { ...read, status: 'no_menu' } } })
    const place = await open('Charlie was a sinner.')
    const reads = within(place).getByTestId('job-reads')
    await userEvent.click(within(reads).getByRole('button', { name: /Reads/ }))
    await userEvent.click(within(reads).getByRole('switch', { name: 'Reading' }))
    expect(posted()).toEqual([{ action: 'no_menu', resourceId: 'p1' }])
    expect(screen.getByTestId('job-status').textContent).toBe('Reading off')
    vi.mocked(fetchJson).mockImplementation(async () => ({ ok: true, reading: null }))
    const switched = within(screen.getByRole('region', { name: 'Charlie was a sinner.' })).getByRole('switch', { name: 'Reading' })
    expect(switched).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(switched)
    expect(posted().at(-1)).toEqual({ action: 'undo_no_menu', resourceId: 'p1' })
  })

  it('the × on its menu link takes the link off; Add a page gives one', async () => {
    await renderPage([charlie], { post: { menuUrl: null } })
    const place = await open('Charlie was a sinner.')
    const reads = within(place).getByTestId('job-reads')
    await userEvent.click(within(reads).getByRole('button', { name: /Reads/ }))
    await userEvent.click(within(reads).getByRole('button', { name: 'Stop reading charlie.example/menu' }))
    expect(posted()).toEqual([{ action: 'unlink', resourceId: 'p1' }])
    await userEvent.click(within(screen.getByTestId('job-reads')).getByRole('button', { name: 'Add a page' }))
    await userEvent.type(screen.getByLabelText('Its menu page or PDF'), 'charlie.example/food')
    await userEvent.click(screen.getByRole('button', { name: 'Save and read' }))
    expect(posted().at(-1)).toEqual({ action: 'link', resourceId: 'p1', url: 'charlie.example/food' })
  })

  it(`reads the places not read yet as the page opens, at most ${READ_ON_LOAD}`, async () => {
    const places = Array.from({ length: READ_ON_LOAD + 2 }, (_, i) => ({ ...unread, id: `u${i}`, name: `Place ${i}` }))
    await renderPage(places, { readerOn: true, post: { reading: read } })
    await vi.waitFor(() => expect(posted()).toHaveLength(READ_ON_LOAD))
    expect(posted().every((b) => b.action === 'read')).toBe(true)
  })

  it('reads nothing on its own when the reader isn’t set up, and says so', async () => {
    await renderPage([unread], { available: false, readerOn: false })
    expect(screen.getByText('Reading menus needs database migration 065.')).toBeTruthy()
    const place = await open('Bar Bombón')
    expect(within(place).queryByRole('button', { name: 'Read them now' })).toBeNull()
    expect(posted()).toEqual([])
  })

  it('warns up top when a website sent the reader to another site', async () => {
    await renderPage([{ ...charlie, website: 'https://shtetl.example', menuUrl: null, reading: { ...read, status: 'failed', dishes: [], sourceUrl: 'https://bags1.example/' } }])
    expect(screen.getByTestId('dish-moved-sites').textContent).toContain('Charlie was a sinner.: shtetl.example → bags1.example')
  })

  // Main dishes board 3: Chalavita on dev, Oct 21. Google has no hours for
  // it, so its website's are read and proposed; its phone is the same.
  describe('its hours and phone, from its website', () => {
    const HOME = 'https://chalavita.com/'
    const AT = new Date(Date.now() - 3_600_000).toISOString()
    const dinner = { open: '17:00', close: '22:00' }
    const HOURS = { sun: dinner, mon: dinner, tue: dinner, wed: dinner, thu: dinner, fri: null, sat: null }
    const hoursFinding = { id: 's-hours', operation: 'update', targetId: 'p4', name: 'Chalavita', from: 'its website', says: 'Its page says', named: null, at: AT, notes: [], lines: [{ key: 'hours', label: 'Hours', before: '', after: 'Sun–Thu 5 PM – 10 PM', choosable: true }], page: HOME, section: 'hours', values: { hours: HOURS } }
    const homePage = { id: 'w-home', communityId: 'philly', kind: 'website', url: HOME, resourceId: 'p4', label: 'Chalavita · its website', active: true, createdAt: AT, createdBy: 'listing pages (found)', lastRunAt: AT, lastOkAt: AT, lastError: null, failingSince: null, lastFiled: 1, pageHash: null, pageChangedAt: null, lastCheck: { at: AT, what: 'hours', from: 'page', result: 'differs', read: [], differences: [], queue: 'filed', contact: { same: ['phone'], changes: [] } } }
    const chalavita = {
      id: 'p4',
      name: 'Chalavita',
      href: '/philly/food/chalavita',
      categoryLabel: 'Food',
      facts: [],
      website: 'https://chalavita.com',
      menuUrl: 'https://chalavita.com/menu',
      dishes: ['Pizza', 'Pasta'],
      menuDated: ['Pizza', 'Pasta'],
      reading: { ...read, sourceUrl: 'https://chalavita.com/menu', dishes: [{ name: 'Pizza', quote: 'Pizza', checked: true, named: true }, { name: 'Pasta', quote: 'Pasta', checked: true, named: true }], missing: [] },
      pages: [homePage],
      findings: [hoursFinding],
      hours: null,
      contact: { name: 'Phone', fields: [{ key: 'phone', label: 'Phone', kind: 'phone', value: '(215) 555-0142' }] },
    }
    const boxes = (place: HTMLElement) => within(place).getAllByRole('region').map((b) => `${b.getAttribute('aria-label')} | ${within(b).queryAllByTestId('box-pill')[0]?.textContent ?? ''} | ${within(b).getAllByRole('button')[0].getAttribute('aria-expanded')}`)

    it('as drawn: Hours open and New, then Main dishes and Phone the same, closed; Reads names the home page for both', async () => {
      await renderPage([chalavita])
      expect(screen.getByTestId('job-status').textContent).toBe('1 update')
      const place = await open('Chalavita')
      expect(boxes(place)).toEqual(['Hours | New | true', 'Main dishes | Same | false', 'Phone | Same | false', 'Reads | 2 pages | false'])
      const hours = within(place).getByRole('region', { name: 'Hours' })
      expect(within(hours).getAllByTestId('box-row').map((r) => r.getAttribute('data-mark'))).toEqual(['new'])
      // Only highlighted, as drawn: nothing struck under a new day.
      expect(hours.querySelector('s')).toBeNull()
      expect(within(hours).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Use this', 'Edit', 'Keep the listing'])
      expect(within(hours).getByTestId('box-source').textContent).toMatch(/^From chalavita\.com · read/)
      await userEvent.click(within(place).getByRole('button', { name: /^Phone/ }))
      expect(within(within(place).getByRole('region', { name: 'Phone' })).getByTestId('box-source').textContent).toMatch(/^Same as chalavita\.com · read/)
      const reads = within(place).getByTestId('job-reads')
      await userEvent.click(within(reads).getByRole('button', { name: /Reads/ }))
      expect(within(reads).getAllByTestId('job-source').map((x) => x.textContent).join(' / ')).toContain('Hours · Phone')
    })

    it('Use this: the finding approved, the box and row say so', async () => {
      await renderPage([chalavita])
      const place = await open('Chalavita')
      await userEvent.click(within(within(place).getByRole('region', { name: 'Hours' })).getByRole('button', { name: 'Use this' }))
      const patch = vi.mocked(fetchJson).mock.calls.find(([, init]) => init?.method === 'PATCH')!
      expect(String(patch[0])).toBe('/api/admin/submissions/s-hours?community=philly')
      expect(JSON.parse(String(patch[1]!.body))).toEqual({ status: 'approved' })
      expect(within(within(place).getByRole('region', { name: 'Hours' })).getByTestId('box-pill').textContent).toBe(`Used ${today()}`)
      expect(screen.getByTestId('job-status').textContent).toBe(`Used ${today()}`)
    })

    it('the × on its home page stops reading it', async () => {
      await renderPage([chalavita], { post: { pages: [{ ...homePage, active: false }] } })
      const place = await open('Chalavita')
      const reads = within(place).getByTestId('job-reads')
      await userEvent.click(within(reads).getByRole('button', { name: /Reads/ }))
      await userEvent.click(within(reads).getByRole('button', { name: 'Stop reading chalavita.com' }))
      expect(posted()).toEqual([{ action: 'stop', resourceId: 'p4', id: 'w-home' }])
    })
  })

  it('a place whose dishes came from a menu sent through the site is checked, and says so', async () => {
    await renderPage([{ ...failed, dishes: ['Burgers'], menuAt: '2026-10-21T12:00:00Z' }])
    expect(screen.getByRole('tab', { name: 'Checked 1' })).toHaveAttribute('aria-selected', 'true')
    const place = await open('Slices')
    await userEvent.click(within(within(place).getByRole('region', { name: 'Main dishes' })).getByRole('button', { name: /Main dishes/ }))
    expect(within(place).getByTestId('box-source').textContent).toBe('From a menu sent through the site · used Oct 21')
  })
})
