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

const base = { hits: 1, model: 'gpt-6-luna', lastUsedAt: '2026-09-30T12:00:00Z', approvedAt: null, approvedBy: null, proposals: [] }
const teachIkc = { word: 'ikc', categoryId: 'restaurant', field: 'kosherCert', value: 'IKC', label: 'Food · Kosher Cert: IKC' }
const ikc = { ...base, key: 'ikc dairy', question: 'IKC dairy?', labels: ['Food', 'Kosher Cert: IKC', 'Dairy'], hits: 4, proposals: [teachIkc] }
const bagels = { ...base, key: 'bagels', question: 'bagels', labels: ['Bagels'], approvedAt: '2026-09-29T12:00:00Z', approvedBy: 'me@x.co' }

async function renderList(readings: unknown[], available = true, words: unknown[] = [], wordsAvailable = true) {
  vi.mocked(fetchJson).mockImplementation(async (_url, init) => (init.method === 'POST' ? { ok: true } : { ok: true, readings, available, words, wordsAvailable }))
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
  it('lists every question read, with how it was read, approved before or not', async () => {
    await renderList([ikc, bagels])
    const list = screen.getByRole('heading', { name: /Questions \(2\)/ }).closest('section')!
    const rows = within(list).getAllByTestId('read-question')
    expect(rows[0].textContent).toContain('“IKC dairy?”')
    expect(rows[0].textContent).toContain('4 times')
    expect(within(rows[0]).getByText('Kosher Cert: IKC')).toBeTruthy()
    expect(rows[1].textContent).toContain('“bagels”')
  })

  // The AI isn't part of the search (the user, Oct 27): a reading never
  // answers on the site, so there's nothing to approve, only words to teach.
  it('has no Approve: a reading never answers on the site', async () => {
    await renderList([ikc, bagels])
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unapprove' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Approved/ })).toBeNull()
  })

  it('Forget takes it off the list', async () => {
    await renderList([ikc])
    await userEvent.click(screen.getByRole('button', { name: 'Forget' }))
    expect(posted()).toEqual([{ key: 'ikc dairy', action: 'forget' }])
    expect(screen.queryByText('“IKC dairy?”')).toBeNull()
  })

  it('Teach teaches the search a word, from this question, and lists it as taught', async () => {
    await renderList([ikc, { ...bagels, proposals: [teachIkc] }])
    const proposal = screen.getAllByTestId('word-proposal')[0]
    expect(proposal.textContent).toContain('“ikc” means Food · Kosher Cert: IKC')
    await userEvent.click(within(proposal).getByRole('button', { name: 'Teach' }))
    expect(posted()).toEqual([
      { action: 'teach', word: { word: 'ikc', categoryId: 'restaurant', field: 'kosherCert', value: 'IKC' }, question: 'IKC dairy?' },
    ])
    // Not proposed again anywhere, and there under Taught words.
    expect(screen.queryAllByTestId('word-proposal')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: /Taught words/ }))
    expect(screen.getByTestId('taught-word').textContent).toContain('from “IKC dairy?”')
  })

  it('Unteach takes a taught word away', async () => {
    const taught = { ...teachIkc, fromQuestion: 'IKC dairy?', taughtBy: 'me@x.co', taughtAt: '2026-09-30T12:00:00Z' }
    await renderList([], true, [taught])
    await userEvent.click(screen.getByRole('button', { name: /Taught words/ }))
    expect(screen.getByTestId('taught-word').textContent).toContain('by me@x.co')
    await userEvent.click(screen.getByRole('button', { name: 'Unteach' }))
    expect(posted()).toEqual([{ action: 'unteach', word: 'ikc' }])
    expect(screen.queryByTestId('taught-word')).toBeNull()
  })

  it('says when teaching needs its migration', async () => {
    await renderList([ikc], true, [], false)
    expect(screen.getByText(/migration 063/)).toBeTruthy()
  })

  it('says plainly when the table isn’t there yet', async () => {
    await renderList([], false)
    expect(screen.getByText(/migration 062/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Questions/ })).toBeNull()
  })
})
