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
    await renderTab([judah, unread, noSite])
    expect(screen.getByTestId('dish-counts').textContent).toBe('0 of 3 approved · 1 to check · 1 not read yet · 1 couldn’t be read')
    const card = within(screen.getByRole('heading', { name: /To check \(1\)/ }).closest('section')!).getByTestId('dish-place')
    expect(card.textContent).toContain('Judah · Meat · Keystone-K')
    expect(within(card).getByRole('link', { name: 'judah.example/menu ↗' })).toHaveAttribute('href', 'https://judah.example/menu')
    expect(card.textContent).toContain('Shawarma from “chicken or beef SHAWARMA plate”')
    expect(card.textContent).toContain('(from a PDF: open the menu to check)')
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
})
