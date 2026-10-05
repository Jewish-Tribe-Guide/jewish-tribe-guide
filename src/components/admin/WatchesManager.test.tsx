// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { Watch } from '@/lib/watches'
import WatchesManager from './WatchesManager'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const SHUL = { id: 'shul-1', name: 'Lower Merion Synagogue', categoryLabel: 'Synagogue' }

function watch(over: Partial<Watch>): Watch {
  return {
    id: 'w',
    communityId: 'philly',
    kind: 'website',
    url: 'https://example.org/',
    resourceId: null,
    label: null,
    active: true,
    createdAt: ago(10),
    createdBy: null,
    lastRunAt: ago(0.1),
    lastOkAt: ago(0.1),
    lastError: null,
    failingSince: null,
    lastFiled: null,
    pageHash: 'h',
    pageChangedAt: null,
    ...over,
  }
}

async function renderTab(watches: Watch[], { available = true, post = {} as Record<string, unknown> } = {}) {
  vi.mocked(fetchJson).mockImplementation(async (_url, init) =>
    init?.method === 'POST' ? { ok: true, ...post } : { ok: true, available, watches, listings: [SHUL] },
  )
  renderWithProviders(<WatchesManager token="tok" />, { community: { slug: 'philly' } })
  await screen.findByText(/Pages the guide reads on its own/)
}

afterEach(() => {
  cleanup()
  vi.mocked(fetchJson).mockReset()
})

describe('WatchesManager', () => {
  it('says plainly which watch is broken, since when and why', async () => {
    await renderTab([
      watch({ id: 'k', kind: 'keystone_list', label: 'Keystone-K’s list', lastFiled: 3 }),
      watch({ id: 'b', label: 'BZBI worship page', failingSince: ago(2), lastError: 'The page answered 403', lastOkAt: ago(3) }),
    ])
    const [keystone, bzbi] = screen.getAllByTestId('watch-row')
    expect(within(keystone).getByText(/^Working/)).toBeInTheDocument()
    expect(within(keystone).getByText(/Last read: 3 suggestions/)).toBeInTheDocument()
    expect(within(bzbi).getByText(/Not working since .*: The page answered 403/)).toBeInTheDocument()
  })

  // The cron itself can stop, and then nothing fails: the last result just
  // sits there looking fine. The tab must not let it.
  it('flags a watch that hasn’t run in days, even though its last run worked', async () => {
    await renderTab([watch({ lastRunAt: ago(4), lastOkAt: ago(4) })])
    expect(screen.getByText(/The daily run may have stopped/)).toBeInTheDocument()
  })

  it('shows the listing a page keeps current, and when its page changed', async () => {
    await renderTab([watch({ resourceId: 'shul-1', pageChangedAt: ago(1) })])
    expect(screen.getByText('Keeps current: Lower Merion Synagogue (Synagogue)')).toBeInTheDocument()
    expect(screen.getByText(/Changed .*: worth a look/)).toBeInTheDocument()
  })

  it('adds a page, tied to a listing picked by name', async () => {
    const created = watch({ id: 'new', url: 'https://lowermerionsynagogue.org/', label: 'Weekly times' })
    await renderTab([], { post: { watch: created } })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Web address'), 'lowermerionsynagogue.org')
    await user.type(screen.getByLabelText(/The listing it keeps current/), 'Lower Merion Synagogue')
    await user.type(screen.getByLabelText(/Name/), 'Weekly times')
    await user.click(screen.getByRole('button', { name: 'Watch this page' }))
    const [, init] = vi.mocked(fetchJson).mock.calls.find(([, i]) => i?.method === 'POST')!
    expect(JSON.parse(String(init!.body))).toEqual({ action: 'add', url: 'lowermerionsynagogue.org', resourceId: 'shul-1', label: 'Weekly times' })
    expect(await screen.findByText('Weekly times')).toBeInTheDocument()
  })

  it('says the migration is needed, and that Keystone-K is still read, before 070', async () => {
    await renderTab([], { available: false })
    expect(screen.getByText(/needs database migration 070/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Watch this page' })).not.toBeInTheDocument()
  })
})
