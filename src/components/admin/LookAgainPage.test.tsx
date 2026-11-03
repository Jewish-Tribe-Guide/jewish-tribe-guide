// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { LookItem } from '@/lib/lookAgain'
import LookAgainPage from './LookAgainPage'
import { forgetWatchJobs } from './useWatchJobs'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/job/look-again',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

// Board XSuFCMdLQmBYNJqfWaEM3A (Oct 27): a group per kind, each row its
// name, why and when; a row opens with its last try and next, Read it now
// and Stop trying; Stopped trying at the foot.

const item = (over: Partial<LookItem>): LookItem => ({ kind: 'google', id: 'g', name: 'The Kosher Grill', why: 'Never looked for', note: null, lastTry: null, found: null, stopped: null, ...over })
const ITEMS = [
  item({ kind: 'eruv', id: 'ep', name: 'Elkins Park Eruv', why: 'No status page on yiep.org' }),
  item({ kind: 'menu', id: 'sh', name: 'Shlomo’s Market', why: 'Not a menu', note: 'An online grocery catalog, not a menu of prepared dishes.', lastTry: '2026-10-24T12:00:00Z' }),
  item({}),
  item({ id: 'cc', name: 'CKids Philly', why: 'You said Not on Google', stopped: '2026-11-01T12:00:00Z' }),
]

type Post = { url: string; body: Record<string, unknown> }
const posts: Post[] = []

async function renderPage(lookAgain: Record<string, unknown> | null, answer: Record<string, unknown> = {}) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      posts.push({ url: String(url), body: JSON.parse(String(init.body)) })
      return { ok: true, ...answer }
    }
    if (String(url).includes('/api/admin/watches/look-again') && lookAgain) return { ok: true, ...lookAgain }
    throw new Error('down')
  })
  renderWithProviders(<LookAgainPage token="tok" />, { community: { slug: 'philly' } })
  await act(() => new Promise((r) => setTimeout(r, 0)))
}

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.mocked(fetchJson).mockReset()
  forgetWatchJobs()
})

describe('LookAgainPage', () => {
  it('a group per kind, each row its why and when, and what it left out', async () => {
    await renderPage({ available: true, items: ITEMS, leftOut: ['Young Professionals Philly', 'Kosher Deals WhatsApp'], runs: [] })
    expect(screen.getByTestId('look-tonight')).toHaveTextContent(/Tonight, \d{1,2}:00 AM · 2 due/)
    expect(screen.getByTestId('look-tonight')).toHaveTextContent('3 in all')
    expect(within(screen.getAllByRole('region', { name: 'Eruv status page' })[0]).getAllByRole('button', { name: /Elkins Park Eruv/ })[0]).toHaveTextContent('No status page on yiep.org')
    expect(within(screen.getAllByRole('region', { name: 'Menus that couldn’t be read' })[0]).getAllByRole('button', { name: /Shlomo/ })[0]).toHaveTextContent('Oct 24 · next Nov 23')
    const google = screen.getAllByRole('region', { name: 'Not on Google' })[0]
    expect(within(google).getAllByRole('button', { name: /The Kosher Grill/ })[0]).toHaveTextContent('Not tried yet · tonight')
    // Left out opens to name them (board Main).
    fireEvent.click(within(google).getByRole('button', { name: /Left out: 2 groups, not places/ }))
    expect(google).toHaveTextContent('Young Professionals Philly · Kosher Deals WhatsApp')
    expect(within(google).queryByText('CKids Philly')).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Stopped trying' })).getByText('1')).toBeInTheDocument()
  })

  it('a row opens in place: its last try in full, its next, Read it now and Stop trying', async () => {
    await renderPage({ available: true, items: ITEMS, leftOut: [], runs: [] }, { found: false, read: false })
    fireEvent.click(screen.getAllByRole('button', { name: /Shlomo/ })[0])
    const opened = screen.getByTestId('look-opened')
    expect(opened).toHaveTextContent('Last try, Oct 24An online grocery catalog, not a menu of prepared dishes.')
    expect(opened).toHaveTextContent('Next tryNov 23')
    expect(within(opened).getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', '/philly/admin/watches/place/sh?from=job/look-again')
    await act(async () => fireEvent.click(within(opened).getByRole('button', { name: 'Read it now' })))
    expect(posts).toEqual([{ url: expect.stringContaining('/api/admin/watches/look-again'), body: { action: 'try', kind: 'menu', id: 'sh' } }])
    expect(screen.getByRole('status')).toHaveTextContent('Still couldn’t be read.')
    posts.length = 0
    await act(async () => fireEvent.click(within(screen.getByTestId('look-opened')).getByRole('button', { name: 'Stop trying' })))
    expect(posts.map((p) => p.body)).toEqual([{ action: 'stop', kind: 'menu', id: 'sh' }])
  })

  it('Read it now that finds it says it waits in To do', async () => {
    await renderPage({ available: true, items: ITEMS, leftOut: [], runs: [] }, { found: true })
    fireEvent.click(screen.getAllByRole('button', { name: /Elkins Park/ })[0])
    await act(async () => fireEvent.click(within(screen.getByTestId('look-opened')).getByRole('button', { name: 'Read it now' })))
    expect(screen.getByRole('status')).toHaveTextContent('Found it. It’s waiting in To do.')
  })

  it('one stopped starts again from Stopped trying', async () => {
    await renderPage({ available: true, items: ITEMS, leftOut: [], runs: [] })
    fireEvent.click(within(screen.getByRole('region', { name: 'Stopped trying' })).getByRole('button', { name: /Stopped trying/ }))
    fireEvent.click(screen.getByRole('button', { name: /CKids Philly/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start trying again' })))
    expect(posts.map((p) => p.body)).toEqual([{ action: 'resume', kind: 'google', id: 'cc' }])
  })

  it('before its table, says it isn’t set up', async () => {
    await renderPage({ available: false, items: [], leftOut: [], runs: [] })
    expect(screen.getByText('Look again isn’t set up on this site yet.')).toBeInTheDocument()
  })
})
