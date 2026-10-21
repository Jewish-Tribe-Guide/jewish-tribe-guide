// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { Watch, WatchCheck } from '@/lib/watches'
import HoursJob, { type HoursPlace } from './HoursJob'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/hours',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const check = (result: WatchCheck['result'], over: Partial<WatchCheck> = {}): WatchCheck => ({ at: ago(0.1), what: 'hours', from: 'page', result, read: [], differences: [], queue: null, ...over })
const watch = (over: Partial<Watch>): Watch =>
  ({ id: 'w', communityId: 'philly', kind: 'website', url: 'https://lmcmikvah.org/', active: true, lastRunAt: ago(0.1), lastOkAt: ago(0.1), lastError: null, failingSince: null, lastCheck: null, ...over }) as Watch
const place = (over: Partial<HoursPlace>): HoursPlace => ({
  id: 'p',
  name: 'Mikvah',
  href: '/philly/mikvah/mikvah-p',
  website: null,
  pages: [],
  off: false,
  offSince: null,
  reason: null,
  pending: 0,
  fields: ['Women’s Hours', 'Men’s Hours', 'Keilim Hours'],
  ...over,
})

// Lower Merion, as the Oct 21 dry run read it: its women's hours differ.
const LMC = place({
  id: 'lmc',
  name: 'Lower Merion Community Mikvah',
  pending: 1,
  pages: [
    { watch: watch({ id: 'w-home', lastCheck: check('differs', { differences: ['Women’s Hours: 7:30 PM – 9:30 PM on its website, 8:30 PM – 10:30 PM on the listing'], queue: 'filed' }) }), source: 'Found from its website' },
    { watch: watch({ id: 'w-mens', url: 'https://lmcmikvah.org/mens-mikvah/', lastCheck: check('agrees', { read: ['Men’s Hours: Sun–Thu 4:30 AM – 10:00 AM'] }) }), source: 'Found from its website’s Men’s Mikvah link' },
  ],
})
const MOISHE = place({ id: 'mz', name: 'Mikvah Moishe Zvi', pages: [{ watch: watch({ id: 'w-mz', url: 'https://mikvahwestphilly.com/', lastCheck: check('agrees') }), source: 'Added by hand' }] })
const MEI = place({ id: 'mei', name: 'Mikvah Mei Shalva', website: 'https://philamikvah.org/', reason: 'Read its website: no weekly hours on it.' })

const posts: { url: string; body: Record<string, unknown> }[] = []
const gets: string[] = []
async function renderPage(places: HoursPlace[], post: (body: Record<string, unknown>) => Record<string, unknown> = () => ({}), job?: 'times') {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posts.push({ url: String(url), body })
      return { ok: true, ...post(body) }
    }
    gets.push(String(url))
    return { ok: true, available: true, name: job === 'times' ? 'Shul times' : 'Mikvah hours', places }
  })
  renderWithProviders(<HoursJob token="tok" job={job} />, { community: { slug: 'philly' } })
  await screen.findByTestId('hours-counts')
}
const region = (name: RegExp) => screen.getByRole('region', { name })
const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement
const open = (name: string) => userEvent.setup().click(within(rowOf(name)).getAllByRole('button')[0])

afterEach(() => {
  posts.length = 0
  gets.length = 0
  cleanup()
  vi.resetAllMocks()
})

describe('HoursJob', () => {
  it('groups the places by what their pages’ last reads found, with the Watches row’s counts', async () => {
    await renderPage([LMC, MOISHE, MEI])
    expect(screen.getByRole('heading', { name: 'Mikvah hours' })).toBeInTheDocument()
    // What's read is said once, not on every row.
    expect(screen.getByText(/^3 places\. Women’s Hours, Men’s Hours and Keilim Hours, each read every morning/)).toBeInTheDocument()
    expect(screen.queryByText('Women’s Hours · Men’s Hours · Keilim Hours')).toBeNull()
    expect(screen.getByTestId('hours-counts').textContent).toBe('1 checked · 1 to check · 1 can’t be read')
    expect(within(region(/^To check/)).getByText(/1 difference from the listing, in the moderation queue\./)).toBeInTheDocument()
    expect(within(region(/^Checked/)).getByText(/the same hours as the listing\./)).toBeInTheDocument()
    expect(within(region(/^Can’t be read/)).getByText('Read its website: no weekly hours on it.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '‹ Watches' })).toHaveAttribute('href', '/philly/admin/watches')
  })

  it('a place shows each page it’s read from, where it came from and what it found', async () => {
    await renderPage([LMC])
    await open(LMC.name)
    const [home, mens] = screen.getAllByTestId('hours-page')
    expect(within(home).getByRole('link', { name: 'lmcmikvah.org' })).toHaveAttribute('href', 'https://lmcmikvah.org/')
    expect(home).toHaveTextContent('Found from its website')
    expect(home).toHaveTextContent('7:30 PM – 9:30 PM on its website, 8:30 PM – 10:30 PM on the listing')
    expect(mens).toHaveTextContent('Found from its website’s Men’s Mikvah link')
    expect(mens).toHaveTextContent(/Read .*: as on the listing\./)
    // What it read, whatever it made of it (the user, Oct 21).
    expect(within(mens).getByTestId('hours-read')).toHaveTextContent('It readMen’s Hours: Sun–Thu 4:30 AM – 10:00 AM')
    // Any page can be stopped, found or given.
    expect(within(mens).getByRole('button', { name: 'Stop reading this page' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Approve or reject it in the moderation queue' })).toHaveAttribute('href', '/philly/admin')
  })

  it('a page can be checked now, and stopped for good, and read again', async () => {
    const found = check('differs', { differences: ['Hours: closed Sunday on its website'], queue: 'filed' })
    const stopped = { watch: { ...MOISHE.pages[0].watch, active: false, createdBy: 'listing pages (stopped)' }, source: 'Stopped' }
    await renderPage([{ ...MOISHE, website: 'https://mikvahwestphilly.com/' }], (body) =>
      body.action === 'check' ? { watch: { ...MOISHE.pages[0].watch, lastCheck: found } } : body.action === 'stop' ? { pages: [], stopped: [stopped] } : { pages: MOISHE.pages, stopped: [] },
    )
    await open(MOISHE.name)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Check now' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches?community=philly', body: { action: 'check', id: 'w-mz' } })
    // It stays where it was, saying what the read found.
    expect(within(region(/^Checked/)).getByText(/1 difference from the listing, in the moderation queue\./)).toBeInTheDocument()
    expect(screen.getByText('Hours: closed Sunday on its website')).toBeInTheDocument()
    // Its website, to see what the reader missed.
    expect(screen.getByRole('link', { name: 'Open its website' })).toHaveAttribute('href', 'https://mikvahwestphilly.com/')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Stop reading this page' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/hours?community=philly', body: { resourceId: 'mz', action: 'stop', id: 'w-mz' } })
    expect(screen.queryByTestId('hours-page')).toBeNull()
    expect(screen.getByTestId('hours-stopped')).toHaveTextContent('Stopped, not read: mikvahwestphilly.com')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Read it again' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'mz', action: 'again', id: 'w-mz' })
    expect(screen.getAllByTestId('hours-page')).toHaveLength(1)
    expect(screen.queryByTestId('hours-stopped')).toBeNull()
  })

  it('the Shul times page: its own places and words', async () => {
    const KESHER = place({ id: 'k', name: 'Kesher Israel', fields: ['Davening Times'], website: 'https://kesher.org/', reason: 'Read its website: no davening times on it.' })
    await renderPage([KESHER], (body) => (body.action === 'off' ? { pages: [], off: true } : {}), 'times')
    expect(gets[0]).toBe('/api/admin/watches/hours?job=times&community=philly')
    expect(screen.getByRole('heading', { name: 'Shul times' })).toBeInTheDocument()
    expect(screen.getByText(/^1 place\. Davening Times, each read every morning/)).toBeInTheDocument()
    await open(KESHER.name)
    expect(screen.getByPlaceholderText('its-website.org/davening')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'No times online' }))
    expect(posts.at(-1)!.url).toBe('/api/admin/watches/hours?job=times&community=philly')
    expect(within(rowOf(KESHER.name)).getByText('No times online: not read.')).toBeInTheDocument()
  })

  it('one that can’t be read: give its hours page, or say it has no hours online', async () => {
    const given = { watch: watch({ id: 'w-new', url: 'https://philamikvah.org/hours', lastCheck: check('agrees') }), source: 'Added by hand' }
    await renderPage([MEI], (body) => (body.action === 'give' ? { pages: [given], off: false } : { pages: [], off: true }))
    await open(MEI.name)
    expect(screen.getByRole('link', { name: 'Fill it in yourself' })).toHaveAttribute('href', MEI.href)
    await userEvent.setup().type(screen.getByPlaceholderText('its-website.org/hours'), 'philamikvah.org/hours')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save and read' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/hours?community=philly', body: { resourceId: 'mei', action: 'give', url: 'philamikvah.org/hours' } })
    expect(within(rowOf(MEI.name)).getByText(/the same hours as the listing\./)).toBeInTheDocument()
    expect(within(rowOf(MEI.name)).getByRole('link', { name: 'philamikvah.org/hours' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Turn off this place' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'mei', action: 'off' })
    expect(screen.getByRole('button', { name: 'Turn back on' })).toBeInTheDocument()
  })

  it('one whose pages were just found on its website is Not read yet, not Can’t be read', async () => {
    const reason = 'Its hours pages are found, and read on a coming morning.'
    await renderPage([place({ id: 'f', name: 'Found Mikvah', website: 'https://found.org/', found: true, reason })])
    expect(within(region(/^Not read yet/)).getByText(reason)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^Can’t be read/ })).toBeNull()
  })

  it('one with no hours online is in Off, saying so, with Turn back on', async () => {
    await renderPage([place({ id: 'ol', name: 'Mikvah Ohel Leah', off: true }), place({ id: 'x', name: 'Paused Mikvah', pages: [{ watch: watch({ active: false }), source: 'Found from its website' }] })])
    expect(screen.getByTestId('hours-counts').textContent).toContain('2 off')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show Off' }))
    expect(within(rowOf('Mikvah Ohel Leah')).getByText('No hours online: not read.')).toBeInTheDocument()
    expect(within(rowOf('Paused Mikvah')).getByText('Turned off: not read.')).toBeInTheDocument()
    await open('Mikvah Ohel Leah')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Turn back on' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'ol', action: 'on' })
  })
})
