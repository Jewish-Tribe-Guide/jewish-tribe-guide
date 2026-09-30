// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import ReadQuestions from './ReadQuestions'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/questions',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const base = { hits: 1, model: 'gpt-6-luna', lastUsedAt: '2026-09-30T12:00:00Z', approvedAt: null, approvedBy: null }
const ikc = { ...base, key: 'ikc dairy', question: 'IKC dairy?', labels: ['Food', 'Kosher Cert: IKC', 'Dairy'], hits: 4 }
const bagels = { ...base, key: 'bagels', question: 'bagels', labels: ['Bagels'], approvedAt: '2026-09-29T12:00:00Z', approvedBy: 'me@x.co' }

async function renderList(readings: unknown[], available = true) {
  vi.mocked(fetchJson).mockImplementation(async (_url, init) => (init.method === 'POST' ? { ok: true } : { ok: true, readings, available }))
  renderWithProviders(<ReadQuestions token="tok" />, { community: { slug: 'philly' } })
  await screen.findByText(/most asked first/)
}

const posted = () =>
  vi
    .mocked(fetchJson)
    .mock.calls.filter(([, init]) => init.method === 'POST')
    .map(([, init]) => JSON.parse(String(init.body)))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('ReadQuestions', () => {
  it('lists what’s to review with how it was read, and folds the approved away', async () => {
    await renderList([ikc, bagels])
    const review = screen.getByRole('heading', { name: /To review \(1\)/ }).closest('section')!
    const row = within(review).getByTestId('read-question')
    expect(row.textContent).toContain('“IKC dairy?”')
    expect(row.textContent).toContain('4 times')
    expect(within(row).getByText('Kosher Cert: IKC')).toBeTruthy()
    expect(screen.queryByText('“bagels”')).toBeNull()
    expect(screen.getByRole('button', { name: /Approved/ }).textContent).toContain('1')
  })

  it('Approve makes it a rule, saved for real, and moves it to Approved', async () => {
    await renderList([ikc])
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(posted()).toEqual([{ key: 'ikc dairy', action: 'approve' }])
    expect(screen.getByRole('heading', { name: /To review \(0\)/ })).toBeTruthy()
  })

  it('Forget takes it off the list', async () => {
    await renderList([ikc])
    await userEvent.click(screen.getByRole('button', { name: 'Forget' }))
    expect(posted()).toEqual([{ key: 'ikc dairy', action: 'forget' }])
    expect(screen.queryByText('“IKC dairy?”')).toBeNull()
  })

  it('says plainly when the table isn’t there yet', async () => {
    await renderList([], false)
    expect(screen.getByText(/migration 062/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /To review/ })).toBeNull()
  })
})
