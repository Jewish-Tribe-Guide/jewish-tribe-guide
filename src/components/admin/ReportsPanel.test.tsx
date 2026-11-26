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
  vi.mocked(fetchJson).mockImplementation(async (url) =>
    String(url).startsWith('/api/admin/watches') ? { watches: [{ active: true, lastRunAt: null }, { active: true, lastRunAt: null }, { active: false, lastRunAt: null }] } : { report: String(url).includes('period=week') ? WEEK : MONTH },
  )
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
    expect(vi.mocked(fetchJson).mock.calls.map(([u]) => u)).toContain('/api/admin/reports?period=month&community=philly')
    expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true')
  })

  // Moved from the top of Places on Nov 25 (item 95): what keeps the guide
  // current is a report, not a place.
  it('has Watches first, ringed, with how many pages it reads', async () => {
    await renderPanel()
    const watches = screen.getByTestId('reports-watches')
    expect(watches).toHaveAttribute('href', '/philly/admin/watches')
    expect(watches.className).toContain('border-emerald-600')
    expect(watches.compareDocumentPosition(screen.getByRole('button', { name: 'Month' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await within(watches).findByText('2 pages')
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

  // Approved and Rejected, the words on To do's own buttons: "Left 0"
  // beside a To do count read as "nothing left to do" (Nov 18 review).
  it('counts what was decided, approved and rejected', async () => {
    await renderPanel()
    const box = screen.getByRole('region', { name: 'Decided in October' })
    const rows = within(box).getAllByRole('row').slice(1)
    expect(rows.map((r) => [...r.querySelectorAll("th, td")].map((c) => c.textContent))).toEqual([
      ['New places', '10', '5'],
      ['Changes', '125', '23'],
      ['Removals', '7', '2'],
    ])
    expect(within(box).getByRole('columnheader', { name: 'Approved' })).toBeInTheDocument()
    expect(within(box).getByRole('columnheader', { name: 'Rejected' })).toBeInTheDocument()
  })

  it('leads on to the searches that found nothing and to the history', async () => {
    await renderPanel()
    expect(screen.getByRole('link', { name: /Searches nobody found/ })).toHaveAttribute('href', '/philly/admin/searches')
    expect(screen.getByText('15 in October')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /History/ })).toHaveAttribute('href', '/philly/admin/history/approved')
  })

  // The public page is on whenever a tab or header link leads to it, so its
  // admin screen (hide an entry) is always reachable (Nov 21).
  it('leads on to What changed', async () => {
    await renderPanel()
    expect(screen.getByRole('link', { name: /What changed/ })).toHaveAttribute('href', '/philly/admin/changes')
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
