// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { ClassifiedMiss } from '@/lib/missedSearches'
import MissedSearches from './MissedSearches'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/searches',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const base = { count: 1, lastDay: '2026-09-26', dismissedAt: null, askedCategory: null }
const dentist: ClassifiedMiss = { ...base, term: 'dentist', count: 5, verdict: { kind: 'missing' } }
const gefilte: ClassifiedMiss = {
  ...base,
  term: 'frozen gefilte fish',
  verdict: { kind: 'close', summary: 'Without “gefilte”: Shlomo’s has frozen fish.', places: [{ id: 'aaaa-1111', name: "Shlomo's", category: 'grocery' }] },
}
const vegan: ClassifiedMiss = { ...base, term: 'vegan food', askedCategory: 'restaurant', verdict: { kind: 'missing' } }
const pretzels: ClassifiedMiss = { ...base, term: 'pretzels', verdict: { kind: 'found', summary: '3 places have pretzels.', places: [] } }
const addable = [
  { id: 'grocery', label: 'Grocery Store' },
  { id: 'restaurant', label: 'Food Establishment' },
]

async function renderList(searches: ClassifiedMiss[], dismissalsAvailable = true) {
  vi.mocked(fetchJson).mockImplementation(async (_url, init) =>
    init.method === 'POST' ? { ok: true } : { ok: true, searches, total: searches.length, addable, dismissalsAvailable },
  )
  renderWithProviders(<MissedSearches token="tok" />, { community: { slug: 'philly' } })
  await screen.findByText(/most asked first/)
}

const section = (name: RegExp) => screen.getByRole('heading', { name }).closest('section')!

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('MissedSearches', () => {
  it('sorts searches into what’s missing, what’s close, and what’s found now', async () => {
    await renderList([dentist, gefilte, pretzels])
    expect(within(section(/Not in the guide \(1\)/)).getByText('“dentist”')).toBeTruthy()
    expect(within(section(/Something close is listed \(1\)/)).getByText('“frozen gefilte fish”')).toBeTruthy()
    // Found now is folded away: nothing to do there.
    expect(screen.queryByText('“pretzels”')).toBeNull()
    expect(screen.getByRole('button', { name: /Found now/ }).textContent).toContain('1')
  })

  it('shows how often and when, and links the close places to their listings', async () => {
    await renderList([dentist, gefilte])
    expect(screen.getByText('5 times · last Sep 26')).toBeTruthy()
    const link = screen.getByRole('link', { name: "Shlomo's" })
    expect(link.getAttribute('href')).toMatch(/^\/philly\/grocery\/shlomo-s-/)
  })

  it('starts Add on the kind of place the search named', async () => {
    await renderList([vegan])
    expect(screen.getByRole('link', { name: 'Add' }).getAttribute('href')).toBe('/philly/restaurant?form=create')
  })

  it('lets the admin pick where to add a search that named no kind of place', async () => {
    await renderList([dentist])
    expect(screen.queryByRole('link', { name: 'Add' })).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText('Category to add “dentist” to'), 'grocery')
    expect(screen.getByRole('link', { name: 'Add' }).getAttribute('href')).toBe('/philly/grocery?form=create')
  })

  it('dismisses a search out of the to-do list, and restores it', async () => {
    await renderList([dentist, gefilte])
    await userEvent.click(within(section(/Not in the guide/)).getByRole('button', { name: 'Dismiss' }))
    expect(vi.mocked(fetchJson).mock.calls.at(-1)?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ term: 'dentist', dismissed: true }) })
    expect(section(/Not in the guide \(0\)/)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: /Dismissed/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(vi.mocked(fetchJson).mock.calls.at(-1)?.[1]).toMatchObject({ body: JSON.stringify({ term: 'dentist', dismissed: false }) })
    expect(within(section(/Not in the guide \(1\)/)).getByText('“dentist”')).toBeTruthy()
  })

  it('offers no Dismiss, and says why, before the dismissals table exists', async () => {
    await renderList([dentist], false)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
    expect(screen.getByText(/migration 058/)).toBeTruthy()
  })
})
