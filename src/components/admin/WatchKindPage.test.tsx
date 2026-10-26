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
    expect(screen.getByTestId('kind-place')).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens a place not checked by what’s wrong, each with its own fix', async () => {
    const added = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const page = { id: 'w2', url: 'https://lms.example/', active: true, lastRunAt: null, lastOkAt: null, lastError: null, failingSince: null, createdAt: added, lastCheck: null }
    const shul = { id: 'b', name: 'Lower Merion Synagogue', href: '/philly/synagogues/b', website: 'https://lms.example', pages: [{ watch: page }], off: false, reason: null, fields: [], times: { key: 'minyanim', minyanim: [], schedules: [] } }
    const posts: unknown[] = []
    const lms = place('b', 'Lower Merion Synagogue', { matched: false, section: 'to_check', fields: [field('Name', 'nothing'), field('Website', 'nothing')] })
    await renderPage([lms], 'synagogue', (url, init) => {
      if (url.includes('job=times') && !init?.method) return { name: 'Shul times', places: [shul] }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        posts.push([url.replace(/[?&]community=philly/, ''), body])
        return body.action === 'check' && !body.id ? { read: ['w2'] } : { ok: true }
      }
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Lower Merion Synagogue/ }))
    const open = screen.getByTestId('kind-place-open')
    expect(within(open).getAllByTestId('problem').map((p) => p.textContent)).toEqual([
      'Nothing checks its nameNamexFind it on GoogleNot on Google',
      `lms.example·never read · added ${day(added)}WebsitexRead it now`,
    ])
    expect(within(open).queryByText(/more checked/)).toBeNull()
    // Its listing, not the job page it waits on.
    expect(within(open).getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', '/philly/synagogues/b')

    // Read it now reads that page: its website searched, then the page.
    await user.click(within(open).getByRole('button', { name: 'Read it now' }))
    expect(posts).toEqual([
      ['/api/admin/watches/hours?job=times', { action: 'check', resourceId: 'b' }],
      ['/api/admin/watches/hours?job=times', { action: 'check', resourceId: 'b', id: 'w2' }],
    ])
    posts.length = 0
    await user.click(within(open).getByRole('button', { name: 'Not on Google' }))
    expect(posts).toEqual([['/api/admin/watches/google', { action: 'not_on_google', id: 'b' }]])
  })

  it('opens a place waiting by where each change came from, each decided on its own', async () => {
    const at = new Date().toISOString()
    const weekday = (time: string) => [{ id: 'm', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time }]
    const times = { id: 'f1', operation: 'update', targetId: 'b', name: 'Lower Merion Synagogue', from: 'its website', says: 'Its page says', named: null, at, notes: [], lines: [], page: 'https://lms.example/davening', part: 'weekday', times: { field: {}, current: weekday('6:45 AM'), proposed: weekday('6:30 AM'), currentSchedules: [], proposedSchedules: [] } }
    const shul = { id: 'b', name: 'Lower Merion Synagogue', href: '/philly/synagogues/b', website: 'https://lms.example', pages: [], off: false, reason: null, fields: [], times: { key: 'minyanim', minyanim: weekday('6:45 AM'), schedules: [] }, findings: [times] }
    const lms = place('b', 'Lower Merion Synagogue', {
      fields: [field('Name', 'google'), { field: 'phone', label: 'Phone', value: '610-555-0100', by: { kind: 'google' } }],
      compare: { at, rows: [{ field: 'phone', label: 'Phone', google: '610-555-0199', changed: true }] },
    })
    const sent: unknown[] = []
    await renderPage([lms], 'synagogue', (url, init) => {
      if (url.includes('job=times') && !init?.method) return { name: 'Shul times', places: [shul] }
      if (init?.method) {
        sent.push([init.method, url.replace(/[?&]community=philly/, ''), JSON.parse(String(init.body))])
        return { ok: true }
      }
    })
    const user = userEvent.setup()
    expect(rows()).toEqual(['Lower Merion Synagogue2 changes'])
    await user.click(screen.getByRole('button', { name: /Lower Merion Synagogue/ }))
    const open = screen.getByTestId('kind-place-open')
    expect(within(open).getAllByTestId('waiting-group').map((g) => g.textContent)).toEqual([
      `From lms.example/davening · ${day(at)}Shacharis · Mon–Fri6:30 AMWas 6:45 AMAcceptEditKeep as is`,
      `From its Google listing · ${day(at)}Phone610-555-0199Was 610-555-0100AcceptEditKeep as is`,
    ])
    expect(within(open).getAllByRole('link', { name: 'Edit' }).map((a) => a.getAttribute('href'))).toEqual(['/philly/admin/watches/times', '/philly/admin/watches/google'])
    expect(within(open).getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', '/philly/synagogues/b')

    const [shulTimes, google] = within(open).getAllByTestId('waiting-group')
    await user.click(within(shulTimes).getByRole('button', { name: 'Accept' }))
    expect(sent).toEqual([['PATCH', '/api/admin/submissions/f1', { status: 'approved' }]])
    sent.length = 0
    await user.click(within(google).getByRole('button', { name: 'Keep as is' }))
    expect(sent).toEqual([['POST', '/api/admin/watches/google', { action: 'keep', id: 'b' }]])
  })

  // Oct 25 (the user): "grocery should go to grocery". What a grocery's
  // own website found waits here, with no job page to Edit it on.
  it('a grocery’s website finding waits under Grocery: Accept or Keep as is', async () => {
    const at = new Date().toISOString()
    const phone = { id: 'f1', operation: 'update', targetId: 'g', name: 'GIANT', from: 'its website', says: 'Its page says', named: null, at, notes: [], page: 'https://giant.example/store', section: 'contact', lines: [{ key: 'phone', label: 'Phone', before: '215-555-0100', after: '215-555-0199' }] }
    const store = { id: 'g', name: 'GIANT', category: 'grocery', href: '/philly/grocery/g', pages: [{ watch: { id: 'w1', url: 'https://giant.example/store', active: true, lastOkAt: at, lastRunAt: at, createdAt: at } }], findings: [phone] }
    const giant = place('g', 'GIANT', { category: 'grocery', categoryLabel: 'Grocery', href: '/philly/grocery/g' })
    const sent: unknown[] = []
    await renderPage([giant], 'grocery', (url, init) => {
      if (url.includes('/api/admin/categories')) return { ok: true, categories: [{ id: 'grocery', pluralLabel: 'Grocery', kind: 'listing', hasAddress: true }] }
      if (url.includes('/api/admin/watches/sites')) return { ok: true, places: [store] }
      if (init?.method) {
        sent.push([init.method, url.replace(/[?&]community=philly/, ''), JSON.parse(String(init.body))])
        return { ok: true }
      }
    })
    const user = userEvent.setup()
    expect(rows()).toEqual(['GIANT1 change'])
    await user.click(screen.getByRole('button', { name: /GIANT/ }))
    const open = screen.getByTestId('kind-place-open')
    expect(within(open).getAllByTestId('waiting-group').map((g) => g.textContent)).toEqual([`From giant.example/store · ${day(at)}Phone215-555-0199Was 215-555-0100AcceptKeep as is`])
    expect(within(open).queryByRole('link', { name: 'Edit' })).toBeNull()
    await user.click(within(open).getByRole('button', { name: 'Accept' }))
    expect(sent).toEqual([['PATCH', '/api/admin/submissions/f1', { status: 'approved' }]])
  })

  it('a closure: Keep closed or Show as open', async () => {
    const at = new Date().toISOString()
    const ritas = place('r', 'Rita’s', { closure: { status: 'CLOSED_TEMPORARILY', shownOpen: false, since: at, readAt: at, kept: null } })
    const sent: unknown[] = []
    await renderPage([ritas], 'synagogue', (url, init) => {
      if (init?.method) {
        sent.push(JSON.parse(String(init.body)))
        return { ok: true }
      }
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Rita’s/ }))
    const [g] = within(screen.getByTestId('kind-place-open')).getAllByTestId('waiting-group')
    expect(g.textContent).toBe(`From its Google listing · ${day(at)}Open or closedClosed for nowWas OpenOn the siteShown closed since ${day(at)}Opens again by itself when Google says open.Keep closedShow as open`)
    await user.click(within(g).getByRole('button', { name: 'Keep closed' }))
    expect(sent).toEqual([{ action: 'open', open: false, id: 'r' }])
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
