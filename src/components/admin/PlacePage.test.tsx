// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import PlacePage from './PlacePage'
import { forgetWatchJobs } from './useWatchJobs'
import { day } from './watchText'
import { makeCategory, makeListing } from '@/test/providerFixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/place/a',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const field = (label: string, kind: string) => ({ field: label.toLowerCase(), label, value: 'x', by: { kind } })
const place = (id: string, name: string, over = {}) => ({
  id, name, street: null, address: null, category: 'synagogue', categoryLabel: 'Synagogues', href: `/philly/synagogues/${id}`,
  matched: true, section: 'checked', fields: [field('Name', 'google')], readAt: new Date().toISOString(), failedAt: null, notOnGoogle: null, closure: null, compare: null, ...over,
})

async function renderPage(id: string, places: unknown[], more: (url: string, init?: RequestInit) => unknown = () => undefined, from?: string) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    const got = more(String(url), init)
    if (got !== undefined) return got
    if (String(url).includes('/api/admin/categories')) return { ok: true, categories: [{ id: 'synagogue', pluralLabel: 'Synagogues', kind: 'listing', hasAddress: true }] }
    if (String(url).includes('/api/admin/watches/google')) return { ok: true, counts: {}, places }
    // Every other job answers with nothing: none of these places is in it.
    throw new Error('down')
  })
  renderWithProviders(<PlacePage token="tok" id={id} from={from} />, { community: { slug: 'philly' } })
  await act(() => new Promise((r) => setTimeout(r, 0)))
}

afterEach(() => {
  cleanup()
  vi.mocked(fetchJson).mockReset()
  forgetWatchJobs()
})

describe('PlacePage', () => {
  it('opens a place not checked by what’s wrong, each with its own fix', async () => {
    const added = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const page = { id: 'w2', url: 'https://lms.example/', active: true, lastRunAt: null, lastOkAt: null, lastError: null, failingSince: null, createdAt: added, lastCheck: null }
    const shul = { id: 'b', name: 'Lower Merion Synagogue', href: '/philly/synagogues/b', website: 'https://lms.example', pages: [{ watch: page }], off: false, reason: null, fields: [], times: { key: 'minyanim', minyanim: [], schedules: [] } }
    const posts: unknown[] = []
    const lms = place('b', 'Lower Merion Synagogue', { matched: false, section: 'to_check', fields: [field('Name', 'nothing'), field('Website', 'nothing')] })
    await renderPage('b', [lms], (url, init) => {
      if (url.includes('job=times') && !init?.method) return { name: 'Shul times', places: [shul] }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        posts.push([url.replace(/[?&]community=philly/, ''), body])
        return body.action === 'check' && !body.id ? { read: ['w2'] } : { ok: true }
      }
    })
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
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

  // Oct 26: Chabad of the Main Line's schedule page turned the reader away
  // every night, with only Read it now beside it.
  it('a page that doesn’t load: Stop, asked first, beside Read it now', async () => {
    const since = new Date(Date.now() - 6 * 86_400_000).toISOString()
    const ran = new Date(Date.now() - 3_600_000).toISOString()
    const page = { id: 'w3', url: 'https://chabad.example/Schedule.htm', active: true, lastRunAt: ran, lastOkAt: since, lastError: 'Couldn’t read the page: it turned the reader away (403)', failingSince: since, createdAt: since, lastCheck: null }
    const shul = { id: 'c', name: 'Chabad of the Main Line', href: '/philly/synagogues/c', website: 'https://chabad.example', pages: [{ watch: page }], off: false, reason: null, fields: ['Minyanim'], times: { key: 'minyanim', minyanim: [], schedules: [] } }
    const posts: unknown[] = []
    await renderPage('c', [place('c', 'Chabad of the Main Line')], (url, init) => {
      if (url.includes('job=times') && !init?.method) return { name: 'Shul times', places: [shul] }
      if (init?.method === 'POST') {
        posts.push([url.replace(/[?&]community=philly/, ''), JSON.parse(String(init.body))])
        return { ok: true }
      }
    })
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    const problem = within(open).getByTestId('problem')
    expect(within(problem).getByRole('button', { name: 'Read it now' })).toBeTruthy()
    await user.click(within(problem).getByRole('button', { name: 'Stop' }))
    expect(within(problem).getByText('Stop reading chabad.example/Schedule.htm?')).toBeTruthy()
    await user.click(within(problem).getByRole('button', { name: 'Keep reading' }))
    expect(posts).toEqual([])
    await user.click(within(problem).getByRole('button', { name: 'Stop' }))
    await user.click(within(problem).getByRole('button', { name: 'Stop reading' }))
    expect(posts).toContainEqual(['/api/admin/watches/hours?job=times', { action: 'stop', resourceId: 'c', id: 'w3' }])
  })

  // Oct 25: the weekly link check found House of Kosher's kosher
  // certificate link gone (404).
  it('opens a place whose link doesn’t open, with Check it again', async () => {
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString()
    const link = { resourceId: 'b', key: 'kosher_url', field: 'Kosher certificate', url: 'http://houseofkosher.com/Philadelphia', place: 'House of Kosher', category: 'synagogue', href: '/philly/synagogues/b', id: 'w9', checkedAt: since, error: 'Not found', failingSince: since }
    const posts: unknown[] = []
    await renderPage('b', [place('a', 'Kesher Israel'), place('b', 'House of Kosher')], (url, init) => {
      if (url.includes('/api/admin/watches/links') && !init?.method) return { ok: true, links: [link] }
      if (init?.method === 'POST') {
        posts.push([url.replace(/[?&]community=philly/, ''), JSON.parse(String(init.body))])
        return { ok: true }
      }
    })
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    // A link's day is New York's (linkCheck.ts), not the machine's: CI runs
    // in UTC, where after 8 PM here it's already tomorrow.
    const nyDay = new Date(since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    expect(within(open).getAllByTestId('problem').map((p) => p.textContent)).toEqual([`Kosher certificate·not found since ${nyDay}Linkhouseofkosher.com/PhiladelphiaCheck it again`])
    await user.click(within(open).getByRole('button', { name: 'Check it again' }))
    expect(posts).toEqual([['/api/admin/watches/links', { action: 'check', resourceId: 'b', key: 'kosher_url' }]])
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
    await renderPage('b', [lms], (url, init) => {
      if (url.includes('job=times') && !init?.method) return { name: 'Shul times', places: [shul] }
      if (init?.method) {
        sent.push([init.method, url.replace(/[?&]community=philly/, ''), JSON.parse(String(init.body))])
        return { ok: true }
      }
    })
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    expect(within(open).getAllByTestId('waiting-group').map((g) => g.textContent)).toEqual([
      `From lms.example/davening · ${day(at)}Usual weekday timesMonday to FridayShacharis6:30 AM6:45 AMAcceptEditKeep as is`,
      `From its Google listing · ${day(at)}Phone610-555-0199Was 610-555-0100AcceptEditKeep as isWrong place`,
    ])
    // Edit opens the change here, not its job page.
    expect(within(open).queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(within(open).getAllByRole('button', { name: 'Edit' })).toHaveLength(2)
    expect(within(open).getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', '/philly/synagogues/b')

    const [shulTimes, google] = within(open).getAllByTestId('waiting-group')
    await user.click(within(shulTimes).getByRole('button', { name: 'Accept' }))
    expect(sent).toEqual([['PATCH', '/api/admin/submissions/f1', { status: 'approved' }]])
    sent.length = 0
    await user.click(within(google).getByRole('button', { name: 'Keep as is' }))
    expect(sent).toEqual([['POST', '/api/admin/watches/google', { action: 'keep', id: 'b' }]])
    // Oct 26: BZBI Early Childhood, matched to the temple.
    sent.length = 0
    await user.click(within(google).getByRole('button', { name: 'Wrong place' }))
    expect(sent).toEqual([['POST', '/api/admin/watches/google', { action: 'wrong_place', id: 'b' }]])
  })

  // The user, Oct 27: "I want to see the whole schedule with the new ones
  // highlighted." A week the listing has: all of it by day, only what
  // changes highlighted; one it hasn't got, all of it, all highlighted.
  it('a week’s times: the whole week by day, what changes highlighted', async () => {
    const at = new Date().toISOString()
    const day1 = (id: string, on: string, time: string) => ({ id, tefillah: 'shacharis', on: [on], time })
    const week = (minyanim: ReturnType<typeof day1>[]) => ({ id: 'w', name: 'Times for Oct 26 – Oct 31', from: '2026-10-26', to: '2026-10-31', mode: 'replace', kind: 'week', minyanim })
    const had = week([day1('1', '2026-10-26', '6:45am'), day1('2', '2026-10-27', '6:45am')])
    const read = week([day1('1', '2026-10-26', '6:45am'), day1('2', '2026-10-27', '7:00am')])
    const finding = (currentSchedules: unknown[]) => ({ id: 'f1', operation: 'update', targetId: 'b', name: 'Sons of Israel', from: 'its website', says: 'Its page says', named: null, at, notes: [], lines: [], page: 'https://soi.example/cal', part: 'week', times: { field: {}, current: [], proposed: [], currentSchedules, proposedSchedules: [read] } })
    for (const [schedules, changed] of [[[had], ['Shacharis7 AM6:45 AM']], [[], ['Shacharis6:45 AM', 'Shacharis7 AM']]] as const) {
      const shul = { id: 'b', name: 'Sons of Israel', href: '/philly/synagogues/b', website: 'https://soi.example', pages: [], off: false, reason: null, fields: [], times: { key: 'minyanim', minyanim: [], schedules }, findings: [finding([...schedules])] }
      await renderPage('b', [place('b', 'Sons of Israel')], (url, init) => {
        if (url.includes('job=times') && !init?.method) return { name: 'Shul times', places: [shul] }
      })
      const group = within(screen.getByTestId('place-open')).getByTestId('waiting-group')
      expect(within(group).getAllByTestId('waiting-day').map((d) => d.textContent)).toEqual(['Mon, Oct 26', 'Tue, Oct 27'])
      // A row a minyan (the user, Oct 28: "the way we displayed minyan
      // times before we changed was normal and good"), the old time struck.
      expect([...group.querySelectorAll('[data-testid=box-row]:not([data-mark=same])')].map((r) => r.textContent)).toEqual(changed)
      expect([...group.querySelectorAll('[data-testid=box-row] s')].map((r) => r.textContent)).toEqual(schedules.length ? ['6:45 AM'] : [])
      if (!schedules.length) expect(within(group).getByTestId('waiting-part')).toHaveTextContent('This week’s schedule, Oct 26 – Oct 31New')
      cleanup()
    }
  })

  // Oct 25 (the user): "grocery should go to grocery". What a grocery's
  // own website found waits here, with no job page of its own.
  it('a grocery’s website finding waits under Grocery: Accept or Keep as is', async () => {
    const at = new Date().toISOString()
    const phone = { id: 'f1', operation: 'update', targetId: 'g', name: 'GIANT', from: 'its website', says: 'Its page says', named: null, at, notes: [], page: 'https://giant.example/store', section: 'contact', values: { phone: '215-555-0199' }, lines: [{ key: 'phone', label: 'Phone', before: '215-555-0100', after: '215-555-0199' }] }
    const store = { id: 'g', name: 'GIANT', category: 'grocery', href: '/philly/grocery/g', pages: [{ watch: { id: 'w1', url: 'https://giant.example/store', active: true, lastOkAt: at, lastRunAt: at, createdAt: at } }], findings: [phone] }
    const giant = place('g', 'GIANT', { category: 'grocery', categoryLabel: 'Grocery', href: '/philly/grocery/g' })
    const sent: unknown[] = []
    await renderPage('g', [giant], (url, init) => {
      if (url.includes('/api/admin/categories')) return { ok: true, categories: [{ id: 'grocery', pluralLabel: 'Grocery', kind: 'listing', hasAddress: true }] }
      if (url.includes('/api/admin/watches/sites')) return { ok: true, places: [store] }
      if (init?.method) {
        sent.push([init.method, url.replace(/[?&]community=philly/, ''), JSON.parse(String(init.body))])
        return { ok: true }
      }
    })
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    expect(within(open).getAllByTestId('waiting-group').map((g) => g.textContent)).toEqual([`From giant.example/store · ${day(at)}Phone215-555-0199Was 215-555-0100AcceptEditKeep as is`])
    await user.click(within(open).getByRole('button', { name: 'Accept' }))
    expect(sent).toEqual([['PATCH', '/api/admin/submissions/f1', { status: 'approved' }]])
  })

  // Oct 25 (the user): "Edit still sends you to the job page instead of
  // opening the change right there."
  it('Edit opens the change right here: its box, filled in with what was read, saved to the listing', async () => {
    const at = new Date().toISOString()
    const phone = { id: 'f1', operation: 'update', targetId: 'g', name: 'GIANT', from: 'its website', says: 'Its page says', named: null, at, notes: [], page: 'https://giant.example/store', section: 'contact', values: { phone: '215-555-0199' }, lines: [{ key: 'phone', label: 'Phone', before: '215-555-0100', after: '215-555-0199' }] }
    const store = { id: 'g', name: 'GIANT', category: 'grocery', href: '/philly/grocery/g', pages: [], findings: [phone] }
    const giant = place('g', 'GIANT', { category: 'grocery', categoryLabel: 'Grocery', href: '/philly/grocery/g' })
    const category = makeCategory({ id: 'grocery', hasPhone: true, detailFields: [] })
    const item = makeListing({ id: 'g', category: 'grocery', name: 'GIANT', address: '1 Main St', phone: '215-555-0100' })
    await renderPage('g', [giant], (url) => {
      if (url.includes('/api/admin/categories')) return { ok: true, categories: [{ id: 'grocery', pluralLabel: 'Grocery', kind: 'listing', hasAddress: true }] }
      if (url.includes('item=g')) return { ok: true, item, category }
      if (url.includes('/api/admin/watches/sites')) return { ok: true, places: [store] }
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const user = userEvent.setup()
    await user.click(within(screen.getByTestId('place-open')).getByRole('button', { name: 'Edit' }))
    expect(vi.mocked(fetchJson).mock.calls.map(([u]) => u)).toContain('/api/admin/watches/google?item=g&community=philly')
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByDisplayValue('(215) 555-0199')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Save to the listing' }))
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/admin/submissions/'))!
    expect(String(url)).toBe('/api/admin/submissions/f1?community=philly')
    const body = JSON.parse(String(init!.body))
    expect(body).toMatchObject({ status: 'approved', payload: { phone: '(215) 555-0199', address: '1 Main St' } })
    fetchMock.mockRestore()
  })

  it('Edit on a group of several changes opens each one’s box in turn', async () => {
    const at = new Date().toISOString()
    const page = 'https://lmc.example/hours'
    const note = (id: string, key: string, label: string, after: string) => ({ id, operation: 'update', targetId: 'lmc', name: 'LMC', from: 'its website', says: 'Its page says', named: null, at, notes: [], page, section: key, values: { [`${key}_notes`]: after }, lines: [{ key: `${key}_notes`, label, before: '—', after }] })
    const mikvah = {
      id: 'lmc', name: 'LMC', href: '/philly/mikvahs/lmc', website: 'https://lmc.example', pages: [], off: false, reason: null, fields: [],
      sections: [{ section: 'women', label: 'Women’s', hours: null, notes: 'women_notes', now: {} }, { section: 'men', label: 'Men’s', hours: null, notes: 'men_notes', now: {} }],
      findings: [note('s1', 'women', 'Women’s Notes', 'Call ahead.'), note('s2', 'men', 'Men’s Notes', 'Fridays only.')],
    }
    const category = makeCategory({ id: 'mikvah', detailFields: [{ key: 'women_notes', label: 'Women’s Notes', type: 'textarea' }, { key: 'men_notes', label: 'Men’s Notes', type: 'textarea' }] })
    const item = makeListing({ id: 'lmc', category: 'mikvah', name: 'LMC' })
    await renderPage('lmc', [place('lmc', 'LMC', { category: 'mikvah', categoryLabel: 'Mikvahs', href: '/philly/mikvahs/lmc' })], (url, init) => {
      if (url.includes('/api/admin/categories')) return { ok: true, categories: [{ id: 'mikvah', pluralLabel: 'Mikvahs', kind: 'listing', hasAddress: true }] }
      if (url.includes('item=lmc')) return { ok: true, item, category }
      if (url.includes('/api/admin/watches/hours') && !url.includes('job=times') && !init?.method) return { name: 'Mikvah hours', places: [mikvah] }
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const user = userEvent.setup()
    expect(screen.getAllByTestId('waiting-group')).toHaveLength(1)
    await user.click(within(screen.getByTestId('place-open')).getByRole('button', { name: 'Edit' }))
    let sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByDisplayValue('Call ahead.')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Save to the listing' }))
    sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByDisplayValue('Fridays only.')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Save to the listing' }))
    const sentTo = fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/api/admin/submissions/'))
    expect(sentTo).toEqual(['/api/admin/submissions/s1?community=philly', '/api/admin/submissions/s2?community=philly'])
    fetchMock.mockRestore()
  })

  it('a new place the guide has archived: Bring it back first, then Add as new or Don’t add', async () => {
    const at = new Date().toISOString()
    const lines = [{ key: 'kosherCert', label: 'Kosher Certification', before: '—', after: 'Keystone-K' }]
    const f = { id: 'n1', operation: 'create', targetId: null, name: 'Rita’s', from: 'Mekor Habracha’s list', says: 'The list says', named: null, at, notes: [], lines, values: { kosherCert: ['Keystone-K'] }, address: '1 Main St', category: 'restaurant' }
    const kosher = {
      available: true, categories: [], counts: {}, places: [],
      lists: [{ list: 'mekor', url: 'https://mekor.example/list', watch: null, error: null, entries: 1, updated: null }],
      newPlaces: [{ name: 'Rita’s', address: '1 Main St', on: [{ list: 'mekor', name: 'Rita’s', url: '', says: '' }], archived: 'Rita’s Water Ice', archivedId: 'r-old', filed: 'queued', findings: [f] }],
    }
    const sent: unknown[] = []
    await renderPage('new:Rita’s', [], (url, init) => {
      if (url.includes('/api/admin/categories')) return { ok: true, categories: [{ id: 'restaurant', pluralLabel: 'Food', kind: 'listing', hasAddress: true }] }
      if (url.includes('/api/admin/watches/kosher') && !init?.method) return { ok: true, ...kosher }
      if (init?.method) {
        sent.push([init.method, url.replace(/[?&]community=philly/, ''), JSON.parse(String(init.body))])
        return { ok: true }
      }
    })
    const user = userEvent.setup()
    const [g] = within(screen.getByTestId('place-open')).getAllByTestId('waiting-group')
    expect(within(g).getAllByRole('button').map((b) => b.textContent)).toEqual(['Bring it back', 'Add as new', 'Don’t add'])
    await user.click(within(g).getByRole('button', { name: 'Bring it back' }))
    expect(sent).toEqual([['POST', '/api/admin/watches/kosher', { action: 'restore', resourceId: 'r-old', id: 'n1' }]])
  })

  it('a closure: Keep closed or Show as open', async () => {
    const at = new Date().toISOString()
    const ritas = place('r', 'Rita’s', { closure: { status: 'CLOSED_TEMPORARILY', shownOpen: false, since: at, readAt: at, kept: null } })
    const sent: unknown[] = []
    await renderPage('r', [ritas], (url, init) => {
      if (init?.method) {
        sent.push(JSON.parse(String(init.body)))
        return { ok: true }
      }
    })
    const user = userEvent.setup()
    const [g] = within(screen.getByTestId('place-open')).getAllByTestId('waiting-group')
    expect(g.textContent).toBe(`From its Google listing · ${day(at)}Open or closedClosed for nowWas OpenOn the siteShown closed since ${day(at)}Opens again by itself when Google says open.Keep closedShow as open`)
    await user.click(within(g).getByRole('button', { name: 'Keep closed' }))
    expect(sent).toEqual([{ action: 'open', open: false, id: 'r' }])
  })

  it('says where an up-to-date place is read from', async () => {
    await renderPage('a', [place('a', 'Kesher Israel')])
    expect(screen.getByTestId('place-open')).toHaveTextContent('Google')
  })

  it('opens a place up to date in its boxes, and reads, adds and changes its sources', async () => {
    const at = new Date(Date.now() - 3_600_000).toISOString()
    const page = { id: 'w1', url: 'https://kesher.example/davening', active: true, lastRunAt: at, lastOkAt: at, lastError: null, failingSince: null, createdAt: at, lastCheck: { at, what: 'times', from: 'page', result: 'agrees', read: [], parts: [{ part: 'weekday', size: 1 }], differences: [], queue: null } }
    const shul = { id: 'a', name: 'Kesher Israel', href: '/philly/synagogues/a', website: 'https://kesher.example', pages: [{ watch: page }], off: false, reason: null, fields: [], times: { key: 'minyanim', minyanim: [{ id: 'm', tefillah: 'shacharis', days: ['mon'], time: '7 AM' }], schedules: [] } }
    const posts: unknown[] = []
    await renderPage('a', [place('a', 'Kesher Israel')], (url, init) => {
      if (url.includes('job=times') && !init?.method) return { name: 'Shul times', places: [shul] }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        posts.push([url.replace(/[?&]community=philly/, ''), body])
        return body.action === 'check' && !body.id && url.includes('hours') ? { read: ['w1'] } : { ok: true }
      }
    })
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    expect(within(open).getAllByTestId('job-box').map((b) => b.getAttribute('aria-label'))).toEqual(['Usual weekday times', 'Name and contact'])
    expect(within(open).getAllByTestId('box-source').map((f) => f.textContent)).toEqual([`Same as kesher.example/davening · read ${day(at)} · Change · Stop`, `Same as its Google listing · read ${day(new Date().toISOString())}`])

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

    // Stop: the page no longer read, as its job page's Reads × did.
    posts.length = 0
    await user.click(within(open).getByRole('button', { name: 'Stop' }))
    expect(within(open).getByText('Stop reading kesher.example/davening?')).toBeTruthy()
    await user.click(within(open).getByRole('button', { name: 'Stop reading' }))
    expect(posts).toEqual([['/api/admin/watches/hours?job=times', { action: 'stop', resourceId: 'a', id: 'w1' }]])
  })

  it('has no Read it now for a place read only from Google', async () => {
    await renderPage('a', [place('a', 'Kesher Israel')])
    const open = screen.getByTestId('place-open')
    expect(within(open).queryByRole('button', { name: /Read (it|them) now/ })).toBeNull()
    expect(within(open).getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', '/philly/synagogues/a')
  })

  it('says so for a place nothing watches', async () => {
    await renderPage('gone', [place('a', 'Kesher Israel')])
    expect(screen.getByText('Nothing is watching this place now.')).toBeTruthy()
    expect(screen.queryByTestId('place-open')).toBeNull()
  })

  // The user, Oct 31: Sababa Falafel, from the Google job, opened a page of
  // every Food place with its card far below the fold.
  it('is only that place, under its name, and Back goes where it was opened from', async () => {
    const places = [place('a', 'Kesher Israel'), place('b', 'Lower Merion Synagogue')]
    for (const [from, label, href] of [['todo', 'To do', '/philly/admin'], ['job/google', 'Google', '/philly/admin/watches/job/google'], [undefined, 'Watches', '/philly/admin/watches']] as const) {
      await renderPage('a', places, undefined, from)
      expect(screen.getByRole('heading', { name: 'Kesher Israel' })).toBeTruthy()
      expect(screen.queryByText('Lower Merion Synagogue')).toBeNull()
      expect(screen.queryByRole('tab')).toBeNull()
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('href', href)
      cleanup()
    }
  })

  describe('once it’s decided', () => {
    const at = new Date().toISOString()
    const closed = { closure: { status: 'CLOSED_TEMPORARILY', shownOpen: false, since: at, readAt: at, kept: null } }
    const decided = { closure: { status: 'CLOSED_TEMPORARILY', shownOpen: false, since: at, readAt: at, kept: at } }

    it('goes back when nothing is left to do for it', async () => {
      mockRouter.push.mockClear()
      let row = place('r', 'Rita’s', closed)
      await renderPage('r', [], (url, init) => {
        if (url.includes('/api/admin/watches/google') && init?.method) {
          row = place('r', 'Rita’s', decided)
          return { ok: true }
        }
        if (url.includes('/api/admin/watches/google')) return { ok: true, counts: {}, places: [row] }
      }, 'todo')
      expect(mockRouter.push).not.toHaveBeenCalled()
      await userEvent.setup().click(within(screen.getByTestId('waiting-group')).getByRole('button', { name: 'Keep closed' }))
      await act(() => new Promise((r) => setTimeout(r, 0)))
      expect(mockRouter.push).toHaveBeenCalledWith('/philly/admin')
    })

    it('stays while something else is left', async () => {
      mockRouter.push.mockClear()
      const compare = { at, rows: [{ field: 'phone', label: 'Phone', google: '610-555-0199', changed: true }] }
      const fields = [field('Name', 'google'), { field: 'phone', label: 'Phone', value: '610-555-0100', by: { kind: 'google' } }]
      let row = place('r', 'Rita’s', { ...closed, compare, fields })
      await renderPage('r', [], (url, init) => {
        if (url.includes('/api/admin/watches/google') && init?.method) {
          row = place('r', 'Rita’s', { ...decided, compare, fields })
          return { ok: true }
        }
        if (url.includes('/api/admin/watches/google')) return { ok: true, counts: {}, places: [row] }
      }, 'todo')
      await userEvent.setup().click(within(screen.getByTestId('place-open')).getByRole('button', { name: 'Keep closed' }))
      await act(() => new Promise((r) => setTimeout(r, 0)))
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it('doesn’t go back for what was read on an earlier visit catching up', async () => {
      mockRouter.push.mockClear()
      let row = place('r', 'Rita’s', closed)
      await renderPage('r', [], (url) => (url.includes('/api/admin/watches/google') ? { ok: true, counts: {}, places: [row] } : undefined), 'todo')
      cleanup()
      row = place('r', 'Rita’s', decided)
      await renderPage('r', [], (url) => (url.includes('/api/admin/watches/google') ? { ok: true, counts: {}, places: [row] } : undefined), 'todo')
      expect(mockRouter.push).not.toHaveBeenCalled()
    })
  })
})

// Oct 25 (the user): "the job page has all the info of eruv tracked but
// … when you click eruv it only tracks eruv status". Its Details, Map and
// what the Eruv page did with its sources, here.
describe('an eruv', () => {
  const at = new Date(Date.now() - 3_600_000).toISOString()
  const BASE = {
    id: 'x', name: 'x', covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false,
    status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null,
    lineUrl: null, sortOrder: 1, active: true, rawLine: null, lineReadAt: null, lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null,
    statusEmail: null, statusEmailKept: null,
  }
  const LM = { ...BASE, id: 'lm', name: 'Lower Merion Eruv', covers: 'Bala Cynwyd', website: 'https://lowermerioneruv.org/', hotline: '(610) 664-5626', statusUrl: 'https://lowermerioneruv.org/status', status: 'up', statusWords: 'The Eruv is UP!', statusCheckedAt: at, lineUrl: 'https://maps.example/lm.kml', lineReadAt: at }
  const ELKINS = { ...BASE, id: 'elkins', name: 'Elkins Park Eruv', statusEmail: 'eruv@yiep.org', statusEmailKept: { messageId: 'm', subject: 'This week', sentAt: at, text: 'Shabbat shalom', words: null } }
  const NORTHEAST = { ...BASE, id: 'ne', name: 'Northeast Eruv', website: 'https://neeruv.org/' }
  const site = { id: 'w-lm', communityId: 'philly', kind: 'website', url: 'https://lowermerioneruv.org/', resourceId: null, active: true, lastRunAt: at, lastOkAt: at, lastError: null, failingSince: null, createdAt: at, lastCheck: null, createdBy: 'eruv website' }
  const posts: unknown[] = []
  const eruvPage = (id: string, found: unknown = { ok: true, found: [], error: null }) =>
    renderPage(id, [], (url, init) => {
      if (url.includes('/api/admin/categories')) return { ok: true, categories: [{ id: 'eruv-information', pluralLabel: 'Eruv Information', kind: 'eruv' }] }
      if (url.includes('/api/admin/watches/eruv') && !init?.method) return { available: true, timezone: 'America/New_York', eruvim: [LM, ELKINS, NORTHEAST], findings: [], watches: [site] }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        posts.push([url.replace(/[?&]community=philly/, ''), body])
        return body.action === 'find' ? found : { ok: true }
      }
    })
  afterEach(() => {
    posts.length = 0
  })

  it('opens in its Details, Status and Map, each footed with where it’s read, and stops or changes each', async () => {
    await eruvPage('lm')
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    expect(within(open).getAllByTestId('job-box').map((b) => b.getAttribute('aria-label'))).toEqual(['Status', 'Details', 'Map'])
    expect(within(open).getAllByTestId('box-source').map((f) => f.textContent)).toEqual([
      `Same as its status page · read ${day(at)} · Change · Stop`,
      `Same as lowermerioneruv.org · read ${day(at)} · Stop`,
      `Same as its map · read ${day(at)} · Change · Stop`,
    ])
    expect(within(open).getByText('(610) 664-5626')).toBeTruthy()
    expect(within(open).getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', '/philly/eruv?item=lm')

    // Read them now: its status page and map, then its website.
    await user.click(within(open).getByRole('button', { name: 'Read them now' }))
    expect(posts).toEqual([
      ['/api/admin/eruvim', { id: 'lm', action: 'check' }],
      ['/api/admin/watches/eruv', { action: 'read', id: 'lm' }],
    ])

    // Its page dates each week's post.
    posts.length = 0
    await user.click(within(open).getByRole('checkbox', { name: 'Its page dates each week’s post' }))
    expect(posts).toEqual([['/api/admin/eruvim', { id: 'lm', action: 'save', edit: { statusDated: true } }]])

    // Stop reading its map, asked first.
    posts.length = 0
    const map = within(open).getAllByTestId('job-box')[2]
    await user.click(within(map).getByRole('button', { name: 'Stop' }))
    await user.click(within(map).getByRole('button', { name: 'Keep reading' }))
    expect(posts).toEqual([])
    await user.click(within(map).getByRole('button', { name: 'Stop' }))
    await user.click(within(map).getByRole('button', { name: 'Stop reading' }))
    expect(posts).toEqual([['/api/admin/eruvim', { id: 'lm', action: 'save', edit: { lineUrl: '' } }]])

    // Its website's read paused.
    posts.length = 0
    const details = within(open).getAllByTestId('job-box')[1]
    await user.click(within(details).getByRole('button', { name: 'Stop' }))
    await user.click(within(details).getByRole('button', { name: 'Stop reading' }))
    expect(posts).toEqual([['/api/admin/watches', { action: 'pause', id: 'w-lm' }]])

    // Change its status to its emails: the page emptied.
    posts.length = 0
    const status = within(open).getAllByTestId('job-box')[0]
    await user.click(within(status).getByRole('button', { name: 'Change' }))
    await user.type(within(status).getByLabelText('Its status page, or the address its emails come from'), 'eruv@lowermerioneruv.org')
    expect(within(status).getByText('An email: read for its status. Subscribe the guide’s inbox to it too.')).toBeTruthy()
    await user.click(within(status).getByRole('button', { name: 'Use this' }))
    expect(posts).toEqual([['/api/admin/eruvim', { id: 'lm', action: 'save', edit: { statusEmail: 'eruv@lowermerioneruv.org', statusUrl: '' } }]])
  })

  // Oct 26: Elkins Park's eruv map page, gone (404) every night since Oct 25.
  it('a website that doesn’t load: Stop pauses it, beside Read it now', async () => {
    const since = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const gone = { ...LM, id: 'ep', name: 'Elkins Park Eruv', website: 'https://yiep.example/eruv-map', lineUrl: null, lineReadAt: null }
    const down = { ...site, id: 'w-ep', url: 'https://yiep.example/eruv-map', lastOkAt: since, lastError: 'The page answered 404', failingSince: since }
    await renderPage('ep', [], (url, init) => {
      if (url.includes('/api/admin/categories')) return { ok: true, categories: [{ id: 'eruv-information', pluralLabel: 'Eruv Information', kind: 'eruv' }] }
      if (url.includes('/api/admin/watches/eruv') && !init?.method) return { available: true, timezone: 'America/New_York', eruvim: [gone], findings: [], watches: [down] }
      if (init?.method === 'POST') {
        posts.push([url.replace(/[?&]community=philly/, ''), JSON.parse(String(init.body))])
        return { ok: true }
      }
    })
    const user = userEvent.setup()
    const problem = within(screen.getByTestId('place-open')).getByTestId('problem')
    expect(within(problem).getByRole('button', { name: 'Read it now' })).toBeTruthy()
    await user.click(within(problem).getByRole('button', { name: 'Stop' }))
    expect(within(problem).getByText('Stop reading its website?')).toBeTruthy()
    await user.click(within(problem).getByRole('button', { name: 'Stop reading' }))
    expect(posts).toContainEqual(['/api/admin/watches', { action: 'pause', id: 'w-ep' }])
  })

  it('an email it couldn’t read: say what it says, here', async () => {
    await eruvPage('elkins')
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    expect(within(open).getByTestId('eruv-kept-email').textContent).toContain('This week')
    await user.click(within(open).getByRole('button', { name: 'It says up' }))
    expect(posts).toEqual([['/api/admin/eruvim', { id: 'elkins', action: 'email-says', says: 'up' }]])
  })

  it('nothing gives its status: find its status page on its website, or add one', async () => {
    await eruvPage('ne', { ok: true, found: [{ url: 'https://neeruv.org/status', link: 'Status', status: 'up', words: 'The eruv is up' }], error: null })
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    await user.click(within(open).getByRole('button', { name: 'Find its status page' }))
    expect(posts).toEqual([['/api/admin/eruvim', { id: 'ne', action: 'find' }]])
    expect(within(open).getByTestId('eruv-found').textContent).toContain('Its “Status” page, neeruv.org/status, says it’s up')
    posts.length = 0
    await user.click(within(open).getByRole('button', { name: 'Read its status from here' }))
    expect(posts).toEqual([
      ['/api/admin/eruvim', { id: 'ne', action: 'save', edit: { statusUrl: 'https://neeruv.org/status', statusEmail: '', statusDated: false } }],
      ['/api/admin/eruvim', { id: 'ne', action: 'check' }],
    ])

    posts.length = 0
    await user.click(within(open).getByRole('button', { name: 'Add a source' }))
    await user.type(within(open).getByLabelText('Its status page, or the address its emails come from'), 'eruv@neeruv.org')
    await user.click(within(open).getByRole('button', { name: 'Add' }))
    expect(posts).toEqual([['/api/admin/eruvim', { id: 'ne', action: 'save', edit: { statusEmail: 'eruv@neeruv.org', statusUrl: '' } }]])
  })
})

// What the Hospitals and Dishes pages' Reads did with a source, here (Oct 25).
describe('stopping a hospital’s or food place’s source', () => {
  const at = new Date(Date.now() - 3_600_000).toISOString()
  const posts: unknown[] = []
  const kind = (id: string, category: string, label: string, job: (url: string) => unknown) =>
    renderPage(id, [place(category[0], category === 'hospital' ? 'CHOP' : 'Cherry Grill', { category })], (url, init) => {
      if (url.includes('/api/admin/categories')) return { ok: true, categories: [{ id: category, pluralLabel: label, kind: 'listing', hasAddress: true }] }
      if (init?.method === 'POST') {
        posts.push([url.replace(/[?&]community=philly/, ''), JSON.parse(String(init.body))])
        return { ok: true }
      }
      if (url.includes('/api/admin/watches/google')) return undefined
      return job(url)
    })
  afterEach(() => {
    posts.length = 0
  })

  it('a hospital Refuah doesn’t have: Not on Refuah, beside Give its page', async () => {
    const chop = { id: 'h', name: 'CHOP', href: '/philly/hospitals/chop', category: 'hospital', watch: null, notOnRefuah: false, source: null, line: '', refuah: null, nearby: [], boxes: [{ title: 'Bikur Cholim', keys: ['bikur'], labels: ['Bikur Cholim room'], now: {} }] }
    await kind('h', 'hospital', 'Hospitals', (url) => (url.includes('/api/admin/watches/hospitals') ? { hospitals: [chop] } : undefined))
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    expect(within(open).getByRole('button', { name: 'Give its page on Refuah' })).toBeTruthy()
    await user.click(within(open).getByRole('button', { name: 'Not on Refuah' }))
    expect(posts).toEqual([['/api/admin/watches/hospitals', { action: 'none', resourceId: 'h' }]])
  })

  it('a food place’s menu: Stop unlinks its menu link', async () => {
    const grill = { id: 'r', name: 'Cherry Grill', href: '/philly/restaurants/cherry', category: 'restaurant', dishes: ['Schnitzel'], website: 'https://cherrygrill88.com', menuUrl: 'https://cherrygrill88.com/menu', reading: { status: 'approved', readAt: at, sourceUrl: 'https://cherrygrill88.com/menu', dishes: [{ name: 'Schnitzel', quote: 'Schnitzel', checked: true }] } }
    await kind('r', 'restaurant', 'Restaurants', (url) => (url.includes('/api/admin/main-dishes') ? { places: [grill] } : undefined))
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    await user.click(within(open).getByRole('button', { name: 'Stop' }))
    await user.click(within(open).getByRole('button', { name: 'Stop reading' }))
    expect(posts).toEqual([['/api/admin/main-dishes', { action: 'unlink', resourceId: 'r' }]])
  })
})

// Oct 26 (the user: "have everything accounted for so then we can remove
// job pages"): what only the job pages did, on the kinds' pages.
describe('what the job pages did', () => {
  const posts: unknown[] = []
  const answer = (job: (url: string) => unknown) => (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push([url.replace(/[?&]community=philly/, ''), init.body instanceof FormData ? [...init.body.keys()] : JSON.parse(String(init.body))])
      return { ok: true }
    }
    return job(url)
  }
  afterEach(() => {
    posts.length = 0
  })

  it('a shul turned off, and a page of it stopped: Not read, each with Read it again', async () => {
    const stopped = { id: 'x', url: 'https://kesher.example/events', active: false, lastRunAt: null, lastOkAt: null, lastError: null, failingSince: null, createdAt: new Date().toISOString(), lastCheck: null }
    const shul = { id: 'a', name: 'Kesher Israel', href: '/philly/synagogues/a', website: 'https://kesher.example', pages: [], stopped: [{ watch: stopped }], off: true, reason: null, fields: [], times: { key: 'minyanim', minyanim: [], schedules: [] } }
    await renderPage('a', [place('a', 'Kesher Israel')], answer((url) => (url.includes('job=times') ? { name: 'Shul times', places: [shul] } : undefined)))
    const open = screen.getByTestId('place-open')
    const notRead = within(open).getByRole('region', { name: 'Not read' })
    expect(notRead).toHaveTextContent('Not read · kesher.exampleRead it againNot read · kesher.example/eventsRead it again')
    const user = userEvent.setup()
    const [place_, page] = within(notRead).getAllByRole('button', { name: 'Read it again' })
    await user.click(place_)
    await user.click(page)
    expect(posts).toEqual([
      ['/api/admin/watches/hours?job=times', { action: 'on', resourceId: 'a' }],
      ['/api/admin/watches/hours?job=times', { action: 'again', resourceId: 'a', id: 'x' }],
    ])
  })

  it('a field nothing checks, on a place Google has: Check it against Google', async () => {
    await renderPage('b', [place('b', 'Lower Merion Synagogue', { section: 'to_check', fields: [field('Name', 'google'), field('Website', 'nothing')] })], answer(() => undefined))
    const user = userEvent.setup()
    await user.click(within(screen.getByTestId('place-open')).getByRole('button', { name: 'Check it against Google' }))
    expect(posts).toEqual([['/api/admin/watches/google', { action: 'check', id: 'b' }]])
  })

  const food = (job: (url: string) => unknown) =>
    renderPage('r', [place('r', 'Joy Cafe', { category: 'restaurant' })], (url, init) => {
      if (url.includes('/api/admin/categories')) return { ok: true, categories: [{ id: 'restaurant', pluralLabel: 'Restaurants', kind: 'listing', hasAddress: true }] }
      return answer(job)(url, init)
    })

  it('a food place on neither kosher list: Change gives its page on Keystone-K’s list', async () => {
    const kosher = { available: true, lists: [], counts: {}, places: [{ id: 'r', name: 'Joy Cafe', category: 'restaurant', certs: ['OU'], levels: [], on: [], differences: [], href: '/x' }], newPlaces: [] }
    await food((url) => (url.includes('/api/admin/watches/kosher') ? kosher : undefined))
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    const box = within(open).getAllByTestId('job-box').find((b) => b.getAttribute('aria-label') === 'Kosher')!
    expect(box).toHaveTextContent('HechsherOUOn neither list')
    await user.click(within(box).getByRole('button', { name: 'Change' }))
    await user.type(within(open).getByLabelText('Its page on Keystone-K’s list'), 'https://keystone-k.org/kosher/joy-cafe/')
    await user.click(within(open).getByRole('button', { name: 'Use this' }))
    expect(posts).toEqual([['/api/admin/watches/kosher', { action: 'page', resourceId: 'r', url: 'https://keystone-k.org/kosher/joy-cafe/' }]])
  })

  it('a menu that can’t be read: photos of it, or No menu online', async () => {
    const joy = { id: 'r', name: 'Joy Cafe', href: '/x', category: 'restaurant', dishes: ['Falafel'], website: 'https://joy.example', menuUrl: 'https://joy.example/menu', reading: { status: 'failed', readAt: new Date().toISOString() } }
    await food((url) => (url.includes('/api/admin/main-dishes') ? { places: [joy] } : undefined))
    const user = userEvent.setup()
    const open = screen.getByTestId('place-open')
    await user.upload(within(open).getByLabelText('Photos of the menu'), new File(['x'], 'menu.jpg', { type: 'image/jpeg' }))
    await user.click(within(open).getByRole('button', { name: 'No menu online' }))
    expect(posts).toEqual([
      ['/api/admin/main-dishes', ['action', 'resourceId', 'file']],
      ['/api/admin/main-dishes', { action: 'no_menu', resourceId: 'r' }],
    ])
  })
})
