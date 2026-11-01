// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import RepeatedSearches from './RepeatedSearches'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/searches',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const search = (term: string, count: number) => ({ term, count, lastDay: '2026-10-28', dismissedAt: null, askedCategory: null, verdict: { kind: 'missing' } })

function show(searches: unknown[]) {
  vi.mocked(fetchJson).mockImplementation(async (url) =>
    String(url).includes('missed-searches')
      ? { searches, addable: [{ id: 'grocery', label: 'Grocery' }], dismissalsAvailable: true }
      : { readings: [], wordsAvailable: true },
  )
  const onChange = vi.fn()
  renderWithProviders(<RepeatedSearches token="t" onChange={onChange} />)
  return onChange
}

describe('RepeatedSearches', () => {
  it('shows what’s been asked more than once, and not one person’s one search', async () => {
    show([search('pizza', 3), search('kosher llama', 1)])
    const box = await screen.findByRole('region', { name: 'Asked more than once' })
    expect(within(box).getAllByTestId('todo-search')).toHaveLength(1)
    expect(box).toHaveTextContent('“pizza”')
    expect(box).not.toHaveTextContent('llama')
  })

  it('takes a dismissed search off, and says something changed', async () => {
    const user = userEvent.setup()
    const onChange = show([search('pizza', 3)])
    const row = await screen.findByTestId('todo-search')
    await user.click(within(row).getByRole('button', { expanded: false }))
    await user.click(within(row).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByTestId('todo-search')).toBeNull())
    expect(onChange).toHaveBeenCalled()
    expect(screen.getByText('None right now.')).toBeInTheDocument()
  })
})
