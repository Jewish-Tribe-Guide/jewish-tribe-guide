// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { fetchJson } from '@/lib/fetchJson'
import type { Report } from '@/lib/reportsStore'
import ReportsPanel from './ReportsPanel'

// Reports (the admin redesign's board "Reports"): listing views, the places
// opened most, what was decided, and the ways on to the searches and the
// history.

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/metrics',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const MONTH: Report = {
  words: 'in October',
  views: {
    bars: [
      { label: 'Oct 17', count: 93 },
      { label: '18', count: 141 },
    ],
    total: 234,
    since: '2026-10-17',
  },
  topPlaces: [
    { id: 'a', name: 'Mekor Habracha', count: 35 },
    { id: 'b', name: 'HipCityVeg', count: 25 },
  ],
  decided: { newPlaces: { taken: 10, left: 5 }, changes: { taken: 125, left: 23 }, removals: { taken: 7, left: 2 } },
  missedSearches: 15,
}

const WEEK: Report = { ...MONTH, words: 'this week', missedSearches: 4, topPlaces: [] }

async function renderPanel() {
  vi.mocked(fetchJson).mockImplementation(async (url) => ({ report: String(url).includes('period=week') ? WEEK : MONTH }))
  renderWithProviders(<ReportsPanel token="tok" />, { community: { slug: 'philly' } })
  await screen.findByRole('heading', { name: 'Listing views' })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ReportsPanel', () => {
  it('opens on the month, for this community', async () => {
    await renderPanel()
    expect(vi.mocked(fetchJson).mock.calls[0]![0]).toBe('/api/admin/reports?period=month&community=philly')
    expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws a bar a day, with the total since the first', async () => {
    await renderPanel()
    expect(screen.getByText('234 since Oct 17')).toBeInTheDocument()
    const chart = screen.getByRole('figure', { name: 'Listing views' })
    expect(within(chart).getAllByRole('listitem', { name: /:/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Oct 17: 93', '18: 141'])
  })

  it('lists the places opened most, with their counts', async () => {
    await renderPanel()
    const box = screen.getByRole('region', { name: 'Most viewed places' })
    expect(within(box).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Mekor Habracha35', 'HipCityVeg25'])
  })

  it('counts what was decided, taken and left', async () => {
    await renderPanel()
    const box = screen.getByRole('region', { name: 'Decided in October' })
    const rows = within(box).getAllByRole('row').slice(1)
    expect(rows.map((r) => [...r.querySelectorAll("th, td")].map((c) => c.textContent))).toEqual([
      ['New places', '10', '5'],
      ['Changes', '125', '23'],
      ['Removals', '7', '2'],
    ])
    expect(within(box).getByRole('columnheader', { name: 'Taken' })).toBeInTheDocument()
    expect(within(box).getByRole('columnheader', { name: 'Left' })).toBeInTheDocument()
  })

  it('leads on to the searches that found nothing and to the history', async () => {
    await renderPanel()
    expect(screen.getByRole('link', { name: /Searches nobody found/ })).toHaveAttribute('href', '/philly/admin/searches')
    expect(screen.getByText('15 in October')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /History/ })).toHaveAttribute('href', '/philly/admin/history/approved')
  })

  it('a week asks for the week and says so', async () => {
    const user = userEvent.setup()
    await renderPanel()
    await user.click(screen.getByRole('button', { name: 'Week' }))
    expect(await screen.findByRole('region', { name: 'Decided this week' })).toBeInTheDocument()
    expect(vi.mocked(fetchJson).mock.calls.at(-1)![0]).toBe('/api/admin/reports?period=week&community=philly')
    expect(screen.getByText('4 this week')).toBeInTheDocument()
    expect(screen.getByText('None opened this week.')).toBeInTheDocument()
  })

  // The old Metrics tab's Pending tile counted watch findings To do sends to
  // their job pages, so the two said different numbers. Reports counts
  // nothing that's waiting: To do is where that number lives.
  it('has no count of what’s waiting', async () => {
    await renderPanel()
    expect(screen.queryByText(/Pending/)).toBeNull()
  })
})
