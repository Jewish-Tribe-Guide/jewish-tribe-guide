// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import WatchKindPage from './WatchKindPage'
import { forgetWatchJobs } from './useWatchJobs'
import { day } from './JobPage'

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

async function renderPage(places: unknown[], category = 'synagogue', more: (url: string, init?: RequestInit) => unknown = () => undefined) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    const got = more(String(url), init)
    if (got !== undefined) return got
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

  it('says where an up-to-date place is read from', async () => {
    await renderPage([place('a', 'Kesher Israel')])
    await userEvent.setup().click(tab(/Up to date/))
    expect(rows()).toEqual(['Kesher IsraelGoogle'])
    await userEvent.setup().click(tab(/Waiting for you/))
    expect(within(screen.getByRole('tabpanel')).getByText('Nothing waiting.')).toBeTruthy()
  })

  it('opens a place up to date in its boxes, and reads, adds and changes its sources', async () => {
    const at = new Date(Date.now() - 3_600_000).toISOString()
    const page = { id: 'w1', url: 'https://kesher.example/davening', active: true, lastRunAt: at, lastOkAt: at, lastError: null, failingSince: null, createdAt: at, lastCheck: { at, what: 'times', from: 'page', result: 'agrees', read: [], parts: [{ part: 'weekday', size: 1 }], differences: [], queue: null } }
    const shul = { id: 'a', name: 'Kesher Israel', href: '/philly/synagogues/a', website: 'https://kesher.example', pages: [{ watch: page }], off: false, reason: null, fields: [], times: { key: 'minyanim', minyanim: [{ id: 'm', tefillah: 'shacharis', days: ['mon'], time: '7 AM' }], schedules: [] } }
    const posts: unknown[] = []
    await renderPage([place('a', 'Kesher Israel')], 'synagogue', (url, init) => {
      if (url.includes('job=times') && !init?.method) return { name: 'Shul times', places: [shul] }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        posts.push([url.replace(/[?&]community=philly/, ''), body])
        return body.action === 'check' && !body.id && url.includes('hours') ? { read: ['w1'] } : { ok: true }
      }
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Kesher Israel/ }))
    const open = screen.getByTestId('kind-place-open')
    expect(within(open).getAllByTestId('job-box').map((b) => b.getAttribute('aria-label'))).toEqual(['Usual weekday times', 'Name and contact'])
    expect(within(open).getAllByTestId('box-source').map((f) => f.textContent)).toEqual([`Same as kesher.example/davening · read ${day(at)} · Change`, `Same as its Google listing · read ${day(new Date().toISOString())}`])

    // Read it now: its website searched, then its page read.
    await user.click(within(open).getByRole('button', { name: 'Read it now' }))
    expect(posts).toEqual([
      ['/api/admin/watches/hours?job=times', { action: 'check', resourceId: 'a' }],
      ['/api/admin/watches/hours?job=times', { action: 'check', resourceId: 'a', id: 'w1' }],
    ])

    // Add a source: a newsletter's email, as a newsletter.
    posts.length = 0
    await user.click(within(open).getByRole('button', { name: 'Add a source' }))
    await user.type(within(open).getByLabelText('A web page, or the email its newsletter comes from'), 'office@kesher.example')
    expect(within(open).getByText('An email: read for its times. Subscribe the guide’s inbox to it too.')).toBeTruthy()
    await user.click(within(open).getByRole('button', { name: 'Add' }))
    expect(posts).toEqual([['/api/admin/watches', { action: 'add', purpose: 'times', url: 'office@kesher.example', resourceId: 'a' }]])

    // Change: another page, in place of the one it reads.
    posts.length = 0
    await user.click(within(open).getByRole('button', { name: 'Change' }))
    await user.type(within(open).getByLabelText('The page to read instead'), 'https://kesher.example/times')
    await user.click(within(open).getByRole('button', { name: 'Use this' }))
    expect(posts).toEqual([['/api/admin/watches/hours?job=times', { action: 'give', resourceId: 'a', url: 'https://kesher.example/times', replaces: 'w1' }]])
  })

  it('has no Read it now for a place read only from Google', async () => {
    await renderPage([place('a', 'Kesher Israel')])
    const user = userEvent.setup()
    await user.click(tab(/Up to date/))
    await user.click(screen.getByRole('button', { name: /Kesher Israel/ }))
    const open = screen.getByTestId('kind-place-open')
    expect(within(open).queryByRole('button', { name: /Read (it|them) now/ })).toBeNull()
    expect(within(open).getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', '/philly/synagogues/a')
  })

  it('says so for a kind nothing watches', async () => {
    await renderPage([place('a', 'Kesher Israel')], 'whatsapp')
    expect(screen.getByText('Nothing of this kind is watched.')).toBeTruthy()
  })
})
