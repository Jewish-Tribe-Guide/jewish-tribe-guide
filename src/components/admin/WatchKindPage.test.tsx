// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import WatchKindPage from './WatchKindPage'
import { forgetWatchJobs } from './useWatchJobs'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/kind/synagogue',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const field = (label: string, kind: string) => ({ field: label.toLowerCase(), label, value: 'x', by: { kind } })
const place = (id: string, name: string, over = {}) => ({
  id, name, street: null, address: null, category: 'synagogue', categoryLabel: 'Synagogues', href: `/philly/synagogues/${id}`,
  matched: true, section: 'checked', fields: [field('Name', 'google')], readAt: new Date().toISOString(), failedAt: null, notOnGoogle: null, closure: null, compare: null, ...over,
})

async function renderPage(places: unknown[], category = 'synagogue') {
  vi.mocked(fetchJson).mockImplementation(async (url) => {
    if (String(url).includes('/api/admin/categories')) return { ok: true, categories: [{ id: 'synagogue', pluralLabel: 'Synagogues', kind: 'listing', hasAddress: true }] }
    if (String(url).includes('/api/admin/watches/google')) return { ok: true, counts: {}, places }
    // Every other job answers with nothing: none of these places is in it.
    throw new Error('down')
  })
  renderWithProviders(<WatchKindPage token="tok" category={category} />, { community: { slug: 'philly' } })
  await act(() => new Promise((r) => setTimeout(r, 0)))
}

const rows = () => screen.getAllByTestId('kind-place').map((r) => r.textContent)
const tab = (name: RegExp) => screen.getByRole('tab', { name })

afterEach(() => {
  cleanup()
  vi.mocked(fetchJson).mockReset()
  forgetWatchJobs()
})

describe('WatchKindPage', () => {
  it('opens on the first tab with places in it, each saying why', async () => {
    await renderPage([place('a', 'Kesher Israel'), place('b', 'Lower Merion Synagogue', { section: 'to_check', fields: [field('Name', 'google'), field('Website', 'nothing')] })])
    expect(screen.getByRole('heading', { name: 'Synagogues' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Waiting for you 0', 'Not checked 1', 'Up to date 1'])
    expect(tab(/Not checked/)).toHaveAttribute('aria-selected', 'true')
    expect(rows()).toEqual(['Lower Merion SynagogueWebsite not checked'])
    expect(screen.getByTestId('kind-place')).toHaveAttribute('href', '/philly/admin/watches/google')
  })

  it('says where an up-to-date place is read from, and opens its listing', async () => {
    await renderPage([place('a', 'Kesher Israel')])
    await userEvent.setup().click(tab(/Up to date/))
    expect(rows()).toEqual(['Kesher IsraelGoogle'])
    expect(screen.getByTestId('kind-place')).toHaveAttribute('href', '/philly/synagogues/a')
    await userEvent.setup().click(tab(/Waiting for you/))
    expect(within(screen.getByRole('tabpanel')).getByText('Nothing waiting.')).toBeTruthy()
  })

  it('says so for a kind nothing watches', async () => {
    await renderPage([place('a', 'Kesher Israel')], 'whatsapp')
    expect(screen.getByText('Nothing of this kind is watched.')).toBeTruthy()
  })
})
