// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import TaughtWords from './TaughtWords'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/searches',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const taught = { word: 'ikc', label: 'Food · Kosher Cert: IKC', fromQuestion: 'IKC dairy?', taughtBy: 'me@x.co', taughtAt: '2026-09-30T12:00:00Z' }

function renderWords(words: unknown[], wordsAvailable = true) {
  vi.mocked(fetchJson).mockImplementation(async (_url, init) => (init?.method === 'POST' ? { ok: true } : { ok: true, words, wordsAvailable }))
  renderWithProviders(<TaughtWords token="tok" />, { community: { slug: 'philly' } })
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

describe('TaughtWords', () => {
  it('lists each taught word, who taught it and from what, and Unteach takes it away', async () => {
    renderWords([taught])
    await userEvent.click(await screen.findByRole('button', { name: /Taught words/ }))
    expect(screen.getByTestId('taught-word').textContent).toContain('“ikc” means Food · Kosher Cert: IKC')
    expect(screen.getByTestId('taught-word').textContent).toContain('by me@x.co, from “IKC dairy?”')
    await userEvent.click(screen.getByRole('button', { name: 'Unteach' }))
    expect(posted()).toEqual([{ action: 'unteach', word: 'ikc' }])
    expect(screen.queryByTestId('taught-word')).toBeNull()
  })

  // Never a migration number: an admin can do nothing with it.
  it('says when teaching isn’t set up', async () => {
    renderWords([], false)
    expect(await screen.findByText(/Teaching the search words isn.t set up on this site yet/)).toBeTruthy()
    expect(screen.queryByText(/migration/)).toBeNull()
  })
})
