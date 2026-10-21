// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import MainDishes from './MainDishes'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/dishes',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const read = {
  status: 'proposed',
  sourceUrl: 'https://judah.example/menu',
  dishes: [
    { name: 'Shawarma', quote: 'chicken or beef SHAWARMA plate', checked: true },
    { name: 'Fountain Drinks', quote: 'Fountain drinks', checked: true },
    { name: 'Falafel', quote: 'Sandwich', checked: true, named: false },
    { name: 'Pizza', quote: 'Margherita', checked: false },
  ],
  note: null,
  model: 'gpt-6-luna',
  readAt: '2026-10-02T15:00:00Z',
  decidedAt: null,
  decidedBy: null,
}
const judah = { id: 'p1', name: 'Judah', categoryLabel: 'Food', facts: ['Meat', 'Keystone-K'], website: 'https://judah.example', dishes: [], reading: read }
const unread = { id: 'p2', name: 'Bar Bombón', categoryLabel: 'Food', facts: [], website: 'https://bb.example', dishes: [], reading: null }
const noSite = { id: 'p3', name: 'Food Truck', categoryLabel: 'Food', facts: [], website: null, dishes: [], reading: null }

async function renderTab(places: unknown[], { available = true, readerOn = true, post = {} as Record<string, unknown> } = {}) {
  vi.mocked(fetchJson).mockImplementation(async (_url, init) => (init?.method === 'POST' ? { ok: true, ...post } : { ok: true, places, available, readerOn }))
  renderWithProviders(<MainDishes token="tok" />, { community: { slug: 'philly' } })
  await screen.findByTestId('dish-counts')
}

const posted = () =>
  vi
    .mocked(fetchJson)
    .mock.calls.filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init!.body)))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('MainDishes', () => {
  it('shows what the AI read, the menu’s own words for each, and where it read them', async () => {
    // Oct 20: a dish read off a menu posted as pictures on its page.
    const brisket = { name: 'Brisket', quote: 'Slow Roasted Brisket', checked: false, picture: true }
    await renderTab([{ ...judah, reading: { ...read, dishes: [...read.dishes, brisket] } }, unread, noSite])
    expect(screen.getByTestId('dish-counts').textContent).toBe('0 of 3 approved · 1 to check · 1 not read yet · 1 couldn’t be read')
    const card = within(screen.getByRole('heading', { name: /To check \(1\)/ }).closest('section')!).getByTestId('dish-place')
    expect(card.textContent).toContain('Judah · Meat · Keystone-K')
    expect(within(card).getByRole('link', { name: 'judah.example/menu ↗' })).toHaveAttribute('href', 'https://judah.example/menu')
    expect(card.textContent).toContain('Shawarma from “chicken or beef SHAWARMA plate”')
    expect(card.textContent).toContain('Pizza from “Margherita” (from a PDF: open the menu to check)')
    expect(card.textContent).toContain('Brisket from “Slow Roasted Brisket” (from a picture of the menu: open the menu to check)')
    expect(card.textContent).toContain('Falafel from “Sandwich” (these words don’t name it: check)')
    expect(within(card).queryByTestId('dish-elsewhere')).toBeNull()
    expect(screen.queryByTestId('dish-moved-sites')).toBeNull()
  })

  it('warns when the website sent the reader to another site', async () => {
    await renderTab([{ ...judah, website: 'https://shtetl.example', reading: { ...read, status: 'failed', dishes: [], sourceUrl: 'https://bags1.example/' } }])
    // At the top: a failed reading is folded away under "Couldn't be read".
    expect(screen.getByTestId('dish-moved-sites').textContent).toContain('Judah: shtetl.example → bags1.example')
  })

  it('untick what’s wrong, add what’s missing, approve: exactly those dishes are sent', async () => {
    await renderTab([judah])
    await userEvent.click(screen.getByRole('button', { name: /Fountain Drinks/ }))
    await userEvent.type(screen.getByLabelText('Add a dish at Judah'), 'Laffa Wraps{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Approve 4 dishes' }))
    expect(posted()).toEqual([{ action: 'approve', resourceId: 'p1', dishes: ['Shawarma', 'Falafel', 'Pizza', 'Laffa Wraps'] }])
    expect(screen.getByRole('heading', { name: /To check \(0\)/ })).toBeTruthy()
  })

  // The user, Oct 21: the listing's own dishes, hand-added ones too, are
  // looked for on each read. Found ones come ticked, so approving dates
  // them again; missing ones are flagged, never taken off.
  it('marks the listing’s dishes the menu still names, the ones it doesn’t, and the ones not checked', async () => {
    const reading = {
      ...read,
      dishes: [
        { name: 'Shawarma', quote: 'chicken or beef SHAWARMA plate', checked: true, onListing: true },
        { name: 'Laffa', quote: 'Laffa', checked: true },
      ],
      missing: ['Hummus'],
    }
    await renderTab([{ ...judah, dishes: ['Shawarma', 'Hummus', 'Kugel'], reading }])
    const card = screen.getByTestId('dish-place')
    expect(card.textContent).toContain('Shawarma from “chicken or beef SHAWARMA plate” (on the listing)')
    expect(card.textContent).not.toContain('Laffa from “Laffa” (on the listing)')
    expect(within(card).getByTestId('dish-missing').textContent).toBe('Not on this menu any more? Hummus. It stays on the listing until you take it off.')
    expect(within(card).getByTestId('dish-unchecked').textContent).toBe('Not checked against this menu: Kugel.')
    await userEvent.click(within(card).getByRole('button', { name: 'Approve 2 dishes' }))
    expect(posted()).toEqual([{ action: 'approve', resourceId: 'p1', dishes: ['Shawarma', 'Laffa'] }])
  })

  it('a reading from before it looked marks every listed dish not checked; a failed one marks none', async () => {
    await renderTab([{ ...judah, dishes: ['Kugel', 'Shawarma'] }, { ...judah, id: 'p9', name: 'Stuck', dishes: ['Kugel'], reading: { ...read, status: 'failed', dishes: [], missing: ['Kugel'] } }])
    expect(screen.getByTestId('dish-unchecked').textContent).toBe('Not checked against this menu: Kugel.')
    expect(screen.queryAllByTestId('dish-unchecked')).toHaveLength(1)
    expect(screen.queryByTestId('dish-missing')).toBeNull()
  })

  it('reads the next few not read yet, one at a time', async () => {
    await renderTab([unread, { ...unread, id: 'p4', name: 'Slices' }], { post: { reading: read } })
    await userEvent.click(screen.getByRole('button', { name: 'Read the next 2' }))
    expect(posted()).toEqual([
      { action: 'read', resourceId: 'p2' },
      { action: 'read', resourceId: 'p4' },
    ])
    expect(await screen.findByRole('heading', { name: /To check \(2\)/ })).toBeTruthy()
  })

  it('says what’s missing rather than offering what can’t work', async () => {
    await renderTab([unread], { available: false, readerOn: false })
    expect(screen.getByText('Reading menus needs database migration 065.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Read/ })).toBeNull()
  })

  // Oct 20: a place whose menu couldn't be read gets three ways on.
  describe('a menu that couldn’t be read', () => {
    const failed = { ...unread, reading: { ...read, status: 'failed', dishes: [], note: 'Couldn’t read a menu on its website.', model: null } }
    const openStuck = () => userEvent.click(screen.getByRole('button', { name: 'Show Couldn’t be read' }))

    it('give its menu link: sent, and the place reads it from then on', async () => {
      await renderTab([failed], { post: { menuUrl: 'https://bb.example/menu', reading: { ...read, sourceUrl: 'https://bb.example/menu', readAt: '2026-10-20T15:00:00Z' } } })
      await openStuck()
      await userEvent.click(screen.getByRole('button', { name: 'Give its menu link' }))
      await userEvent.type(screen.getByLabelText('Bar Bombón’s menu link'), 'bb.example/menu')
      await userEvent.click(screen.getByRole('button', { name: 'Save and read' }))
      expect(posted()).toEqual([{ action: 'link', resourceId: 'p2', url: 'bb.example/menu' }])
      // Its dishes are now to check.
      expect(await screen.findByRole('heading', { name: /To check \(1\)/ })).toBeTruthy()
    })

    it('add photos of the menu: sent as a form, and its reading says so', async () => {
      const photoReading = { ...read, sourceUrl: null, readAt: '2026-10-20T15:00:00Z', dishes: [{ name: 'Burgers', quote: 'Beyond Burger', checked: false, picture: true }] }
      await renderTab([failed], { post: { reading: photoReading } })
      await openStuck()
      const photo = new File(['JPEG'], 'menu.jpg', { type: 'image/jpeg' })
      await userEvent.upload(screen.getByLabelText('Photos of Bar Bombón’s menu'), photo)
      const [, init] = vi.mocked(fetchJson).mock.calls.find(([, i]) => i?.method === 'POST')!
      const body = init!.body as FormData
      expect([body.get('action'), body.get('resourceId'), (body.get('file') as File).name]).toEqual(['photos', 'p2', 'menu.jpg'])
      const card = within((await screen.findByRole('heading', { name: /To check \(1\)/ })).closest('section')!).getByTestId('dish-place')
      expect(card.textContent).toContain('Read from photos of the menu, added Oct 20')
      expect(card.textContent).toContain('Burgers from “Beyond Burger” (from a picture of the menu: open the menu to check)')
    })

    it('no menu: out of “couldn’t be read”, counted on its own, and undone', async () => {
      const marked = { ...read, status: 'no_menu', dishes: [], note: 'No menu', model: null, sourceUrl: null, decidedAt: '2026-10-20T15:00:00Z', decidedBy: 'me@x.co' }
      await renderTab([failed], { post: { reading: marked } })
      await openStuck()
      await userEvent.click(screen.getByRole('button', { name: 'No menu' }))
      expect(posted()).toEqual([{ action: 'no_menu', resourceId: 'p2' }])
      expect(screen.getByTestId('dish-counts').textContent).toBe('0 of 1 approved · 0 to check · 0 not read yet · 0 couldn’t be read · 1 no menu')
      await userEvent.click(screen.getByRole('button', { name: 'Show No menu' }))
      const card = screen.getByTestId('dish-place')
      expect(card.textContent).toContain('No menu, said Oct 20 by me@x.co')
      // Not read again while it says so.
      expect(within(card).queryByRole('button', { name: /Read/ })).toBeNull()
      vi.mocked(fetchJson).mockImplementation(async () => ({ ok: true, reading: null }))
      await userEvent.click(within(card).getByRole('button', { name: 'Undo' }))
      expect(posted().at(-1)).toEqual({ action: 'undo_no_menu', resourceId: 'p2' })
      expect(screen.getByTestId('dish-counts').textContent).toBe('0 of 1 approved · 0 to check · 1 not read yet · 0 couldn’t be read')
    })

    it('a place whose dishes came from a menu sent through the site says so, not “couldn’t read”', async () => {
      const sent = { ...failed, dishes: ['Burgers'], menuAt: '2026-10-21T12:00:00Z' }
      await renderTab([sent])
      expect(screen.getByTestId('dish-counts').textContent).toBe('0 of 1 approved · 0 to check · 0 not read yet · 0 couldn’t be read')
      await userEvent.click(screen.getByRole('button', { name: 'Show Approved and skipped' }))
      const card = screen.getByTestId('dish-place')
      expect(within(card).getByTestId('dish-sent-through-site').textContent).toBe('Its dishes came from a menu sent through the site, approved Oct 21.')
      expect(card.textContent).not.toContain('Couldn’t read a menu')
      expect(within(card).queryByRole('button', { name: 'No menu' })).toBeNull()
    })

    it('a menu date older than the failed reading is the tab’s own: still couldn’t be read', async () => {
      await renderTab([{ ...failed, dishes: ['Burgers'], menuAt: '2026-09-01T12:00:00Z' }])
      expect(screen.getByTestId('dish-counts').textContent).toContain('1 couldn’t be read')
    })
  })
})
