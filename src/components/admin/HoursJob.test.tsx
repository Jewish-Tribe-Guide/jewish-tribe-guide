// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { Watch, WatchCheck } from '@/lib/watches'
import type { Finding, FindingTimes } from '@/lib/watchFindings'
import type { Minyan } from '@/lib/davening'
import type { SpecialSchedule } from '@/lib/schedules'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import HoursJob, { READ_ON_LOAD, type HoursPlace } from './HoursJob'
import type { ShulPlace } from './TimesProposal'
import { day } from './JobPage'

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
  fields: ['Women’s Hours', 'Men’s Hours', 'Keilim Hours'],
  ...over,
})

// What its page found, waiting here to compare (step 6).
const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 's-lmc',
  operation: 'update',
  targetId: 'lmc',
  name: 'Lower Merion Community Mikvah',
  from: 'its website',
  says: 'Its page says',
  named: null,
  at: ago(0.1),
  notes: ['From their website, read today: https://lmcmikvah.org/'],
  lines: [
    { key: 'women_s_hours', label: 'Women’s Hours', before: '8:30 PM – 10:30 PM', after: '7:30 PM – 9:30 PM', choosable: true },
    { key: 'call_before', label: 'Call before', before: '10:00 PM', after: '9:00 PM', choosable: true },
  ],
  ...over,
})

// Lower Merion, as the Oct 21 dry run read it: its women's hours differ.
const LMC = place({
  id: 'lmc',
  name: 'Lower Merion Community Mikvah',
  findings: [finding()],
  pages: [
    { watch: watch({ id: 'w-home', lastCheck: check('differs', { differences: ['Women’s Hours: 7:30 PM – 9:30 PM on its website, 8:30 PM – 10:30 PM on the listing'], queue: 'filed' }) }), source: 'Found from its website' },
    { watch: watch({ id: 'w-mens', url: 'https://lmcmikvah.org/mens-mikvah/', lastCheck: check('agrees', { read: ['Men’s Hours: Sun–Thu 4:30 AM – 10:00 AM'] }) }), source: 'Found from its website’s Men’s Mikvah link' },
  ],
})
const MOISHE = place({ id: 'mz', name: 'Mikvah Moishe Zvi', pages: [{ watch: watch({ id: 'w-mz', url: 'https://mikvahwestphilly.com/', lastCheck: check('agrees') }), source: 'Added by hand' }] })
const MEI = place({ id: 'mei', name: 'Mikvah Mei Shalva', website: 'https://philamikvah.org/', reason: 'Read its website: no weekly hours on it.' })

const posts: { url: string; body: Record<string, unknown> }[] = []
const gets: string[] = []
async function renderPage(places: HoursPlace[] | (() => HoursPlace[]), post: (body: Record<string, unknown>) => Record<string, unknown> = () => ({}), job?: 'times') {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body))
      posts.push({ url: String(url), body })
      return { ok: true, ...post(body) }
    }
    gets.push(String(url))
    return { ok: true, available: true, name: job === 'times' ? 'Shul times' : 'Mikvah hours', places: typeof places === 'function' ? places() : places }
  })
  renderWithProviders(<HoursJob token="tok" job={job} />, { community: { slug: 'philly' } })
  await screen.findByRole('heading', { name: job === 'times' ? 'Shul times' : 'Mikvah hours' })
}
const rows = () => screen.getAllByTestId('job-row')
const rowOf = (name: string) => rows().find((r) => within(r).queryAllByText(name).length) as HTMLElement
const pill = (name: string) => within(rowOf(name)).getByTestId('job-status').textContent
const open = (name: string) => userEvent.setup().click(within(rowOf(name)).getAllByRole('button')[0])
const tab = (name: string) => userEvent.setup().click(screen.getByRole('tab', { name: new RegExp(`^${name} \\d+$`) }))
const HOURS = '/api/admin/watches/hours?community=philly'

afterEach(() => {
  posts.length = 0
  gets.length = 0
  cleanup()
  vi.resetAllMocks()
})

describe('HoursJob', () => {
  // The user, Oct 21: "Each listing is there, showing the source reading
  // from, the results, how it compares to what we have... A way to have it
  // check again." All of it on the closed row.
  it('every row says how it compares, where it read from, and has Check now, without opening it', async () => {
    const OFF = place({ id: 'ol', name: 'Aaron Mikvah', off: true })
    await renderPage([MOISHE, OFF, MEI, LMC])
    expect(screen.getByTestId('job-counts').textContent).toBe('2 need you · 4 places')
    expect(pill(LMC.name)).toBe('Differs from the listing')
    expect(within(rowOf(LMC.name)).getByText(/^From lmcmikvah\.org and 1 other page · read /)).toBeInTheDocument()
    expect(within(rowOf(LMC.name)).getByRole('button', { name: 'Check now' })).toBeInTheDocument()
    // What it found waits on its row, not in the moderation queue (step 6).
    expect(within(rowOf(LMC.name)).getByTestId('finding')).toHaveTextContent('Women’s Hours: its page says 7:30 PM – 9:30 PM. The listing says 8:30 PM – 10:30 PM. And 1 more.')
    await tab('Can’t be read')
    expect(pill(MEI.name)).toBe('Couldn’t read')
    expect(within(rowOf(MEI.name)).getByText('Read its website: no weekly hours on it.')).toBeInTheDocument()
    expect(within(rowOf(MEI.name)).getByRole('button', { name: 'Check now' })).toBeInTheDocument()
    await tab('Checked')
    expect(pill(MOISHE.name)).toBe('Same as the listing')
    expect(within(rowOf(MOISHE.name)).getByText(/^From mikvahwestphilly\.com · read [A-Z][a-z]{2} \d+$/)).toBeInTheDocument()
    await tab('Off')
    expect(within(rowOf(OFF.name)).getByText('No hours online: not read.')).toBeInTheDocument()
    expect(within(rowOf(OFF.name)).getByRole('button', { name: 'Turn back on' })).toBeInTheDocument()
    // What's read is said once, not on every row.
    expect(screen.getByText(/^Women’s Hours, Men’s Hours and Keilim Hours, read every morning/)).toBeInTheDocument()
    expect(screen.queryByText('Women’s Hours · Men’s Hours · Keilim Hours')).toBeNull()
    expect(screen.getByRole('link', { name: '‹ Watches' })).toHaveAttribute('href', '/philly/admin/watches')
  })

  // The user, Oct 21: "can the to check, can't be read, not read yet be
  // tabs so the page isn't so messy"; and then no "Not read yet": a page
  // is read as soon as it's found.
  it('in tabs, each with its count, opening on the first with anything in it; Off only when there are any', async () => {
    await renderPage([MOISHE, MEI])
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['To check 0', 'Can’t be read 1', 'Checked 1'])
    // Nothing to check: it opens on Can't be read.
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Can’t be read')
    expect(rows().map((r) => within(r).getAllByRole('button')[0].querySelector('.font-semibold')?.textContent)).toEqual([MEI.name])
    await tab('To check')
    expect(screen.queryAllByTestId('job-row')).toHaveLength(0)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('None right now.')
  })

  it('opened: each page it reads, where it came from, what it read, and how that compares', async () => {
    await renderPage([LMC])
    await open(LMC.name)
    const [home, mens] = screen.getAllByTestId('job-source')
    expect(within(home).getByRole('link', { name: 'lmcmikvah.org' })).toHaveAttribute('href', 'https://lmcmikvah.org/')
    expect(home).toHaveTextContent('Found from its website')
    expect(home).toHaveTextContent('7:30 PM – 9:30 PM on its website, 8:30 PM – 10:30 PM on the listing')
    expect(mens).toHaveTextContent('Found from its website’s Men’s Mikvah link')
    expect(mens).toHaveTextContent(/Read .*: the same as the listing\./)
    // What it read, whatever it made of it (the user, Oct 21).
    expect(within(mens).getByTestId('job-read')).toHaveTextContent('What it readMen’s Hours: Sun–Thu 4:30 AM – 10:00 AM')
    // Any page can be replaced or stopped, found or given.
    expect(within(mens).getByRole('button', { name: 'Use a different page' })).toBeInTheDocument()
    expect(within(mens).getByRole('button', { name: 'Stop reading this page' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', LMC.href)
  })

  it('Check now reads every page of the place, and what it filed is read back to compare, in the same place', async () => {
    const found = check('differs', { differences: ['Hours: closed Sunday on its website'], queue: 'filed' })
    let now = { ...MOISHE, website: 'https://mikvahwestphilly.com/' }
    const filed = { ...now, pages: [{ ...MOISHE.pages[0], watch: { ...MOISHE.pages[0].watch, lastCheck: found } }], findings: [finding({ id: 's-mz', targetId: 'mz', name: MOISHE.name, lines: [] })] }
    await renderPage(() => [LMC, now], (body) => {
      if (body.action !== 'check') return {}
      now = filed
      return { pages: filed.pages, stopped: [] }
    })
    await tab('Checked')
    await userEvent.setup().click(within(rowOf(MOISHE.name)).getByRole('button', { name: 'Check now' }))
    expect(posts.at(-1)).toEqual({ url: HOURS, body: { resourceId: 'mz', action: 'check' } })
    expect(await within(rowOf(MOISHE.name)).findByTestId('finding')).toBeInTheDocument()
    expect(pill(MOISHE.name)).toBe('Differs from the listing')
    expect(gets.at(-1)).toBe('/api/admin/watches/hours?counts&community=philly')
    // Still in Checked: it doesn't jump away under the admin's hand.
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Checked 1')
    expect(rows()).toEqual([rowOf(MOISHE.name)])
  })

  // The user, Oct 21: "all the ones in not read yet can't be checked", and
  // then no "Not read yet" at all: read as soon as the page loads.
  it('a page not read yet is read as soon as the page loads, in To check; one with no page has Check now', async () => {
    const unread = place({ id: 'u', name: 'Unread Mikvah', pages: [{ watch: watch({ id: 'w-u', lastRunAt: null, lastCheck: null }), source: 'Found from its website' }] })
    const read = { watch: watch({ id: 'w-u', lastCheck: check('agrees') }), source: 'Found from its website' }
    let answer: (v: Record<string, unknown>) => void = () => {}
    vi.mocked(fetchJson).mockImplementation(async (url, init) => {
      if (init?.method === 'POST') {
        posts.push({ url: String(url), body: JSON.parse(String(init.body)) })
        return new Promise((done) => (answer = done))
      }
      return { ok: true, available: true, name: 'Mikvah hours', places: [unread, MEI] }
    })
    renderWithProviders(<HoursJob token="tok" />, { community: { slug: 'philly' } })
    await screen.findByRole('heading', { name: 'Mikvah hours' })
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['To check 1', 'Can’t be read 1', 'Checked 0'])
    expect(await within(rowOf('Unread Mikvah')).findByRole('button', { name: 'Reading…' })).toBeDisabled()
    expect(posts.map((p) => p.body)).toEqual([{ resourceId: 'u', action: 'check' }])
    expect(pill('Unread Mikvah')).toBe('Not read yet')
    answer({ ok: true, pages: [read], stopped: [] })
    await waitFor(() => expect(pill('Unread Mikvah')).toBe('Same as the listing'))
    await tab('Can’t be read')
    void userEvent.setup().click(within(rowOf(MEI.name)).getByRole('button', { name: 'Check now' }))
    await waitFor(() => expect(posts.at(-1)!.body).toEqual({ resourceId: 'mei', action: 'check' }))
  })

  it('reads at most a few on its own, leaving the rate limit for Check now', async () => {
    const unread = Array.from({ length: READ_ON_LOAD + 2 }, (_, i) => place({ id: `u${i}`, name: `Unread ${i}`, pages: [{ watch: watch({ id: `w-u${i}`, lastRunAt: null, lastCheck: null }), source: 'Found from its website' }] }))
    await renderPage(unread, () => ({ pages: [], stopped: [] }))
    await waitFor(() => expect(posts).toHaveLength(READ_ON_LOAD))
  })

  it('a finding whose read listed no differences still says it differs', async () => {
    await renderPage([{ ...LMC, pages: [{ ...LMC.pages[0], watch: { ...LMC.pages[0].watch, lastCheck: check('differs', { queue: 'filed' }) } }] }])
    expect(pill(LMC.name)).toBe('Differs from the listing')
  })

  it('Compare: a tick per line, and Update sends only the ticked ones; it stays where it was, saying so', async () => {
    await renderPage([LMC, MOISHE])
    const user = userEvent.setup()
    await user.click(within(rowOf(LMC.name)).getByRole('button', { name: 'Compare' }))
    const box = screen.getByRole('region', { name: /what its website says/ })
    expect(within(box).getAllByTestId('finding-line')).toHaveLength(2)
    await user.click(within(box).getByRole('checkbox', { name: 'Call before' }))
    await user.click(within(box).getByRole('button', { name: 'Update 1 on the listing' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-lmc?community=philly', body: { status: 'approved', only: ['women_s_hours'] } })
    expect(within(rowOf(LMC.name)).getByTestId('finding-decided')).toHaveTextContent('Updated on the listing.')
    expect(within(rowOf(LMC.name)).getByText(/^Updated on the listing [A-Z][a-z]{2} \d+\.$/)).toBeInTheDocument()
    expect(rows()[0]).toBe(rowOf(LMC.name))
    expect(screen.getByTestId('job-counts').textContent).toBe('0 need you · 2 places')
  })

  it('Skip for now: rejected, and it says when it comes back', async () => {
    await renderPage([LMC])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(posts.at(-1)!.body).toEqual({ status: 'rejected' })
    expect(screen.getByTestId('finding-decided')).toHaveTextContent('Skipped. Not shown again unless its website says something new.')
    expect(screen.getByText(/^Skipped [A-Z][a-z]{2} \d+: shown again if its page changes\.$/)).toBeInTheDocument()
  })

  // The user, Oct 21: "a way to replace the source or add a source".
  it('a page can be replaced with another, stopped for good and read again, or another added', async () => {
    const mz = MOISHE.pages[0]
    const other = { watch: watch({ id: 'w-other', url: 'https://mikvahwestphilly.com/hours', lastCheck: check('agrees') }), source: 'Added by hand' }
    const stopped = { watch: { ...mz.watch, active: false, createdBy: 'listing pages (stopped)' }, source: 'Stopped' }
    await renderPage([{ ...MOISHE, website: 'https://mikvahwestphilly.com/' }], (body) =>
      body.action === 'give' && body.replaces ? { pages: [other], stopped: [stopped] } : body.action === 'again' ? { pages: [other, mz], stopped: [] } : body.action === 'stop' ? { pages: [mz], stopped: [{ ...other, source: 'Stopped' }] } : { pages: [mz, other], stopped: [] },
    )
    await open(MOISHE.name)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Use a different page' }))
    await user.type(screen.getByLabelText('Instead of mikvahwestphilly.com'), 'mikvahwestphilly.com/hours')
    await user.click(screen.getByRole('button', { name: 'Save and read' }))
    expect(posts.at(-1)).toEqual({ url: HOURS, body: { resourceId: 'mz', action: 'give', url: 'mikvahwestphilly.com/hours', replaces: 'w-mz' } })
    expect(screen.getAllByTestId('job-source')).toHaveLength(1)
    expect(screen.getByTestId('hours-stopped')).toHaveTextContent('Stopped, not read: mikvahwestphilly.com')
    await user.click(screen.getByRole('button', { name: 'Read it again' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'mz', action: 'again', id: 'w-mz' })
    expect(screen.getAllByTestId('job-source')).toHaveLength(2)
    await user.click(within(screen.getAllByTestId('job-source')[0]).getByRole('button', { name: 'Stop reading this page' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'mz', action: 'stop', id: 'w-other' })
    await user.click(screen.getByRole('button', { name: 'Add a page' }))
    await user.type(screen.getByPlaceholderText('its-website.org/hours'), 'mikvahwestphilly.com/keilim')
    await user.click(screen.getByRole('button', { name: 'Save and read' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'mz', action: 'give', url: 'mikvahwestphilly.com/keilim' })
    // Its website, to see what the reader missed.
    expect(screen.getByRole('link', { name: 'Open its website' })).toHaveAttribute('href', 'https://mikvahwestphilly.com/')
  })

  it('one that can’t be read opens with its page to give; given, it’s read and says so', async () => {
    const given = { watch: watch({ id: 'w-new', url: 'https://philamikvah.org/hours', lastCheck: check('agrees') }), source: 'Added by hand' }
    await renderPage([MEI], (body) => (body.action === 'give' ? { pages: [given], off: false } : { pages: [given], off: true }))
    await open(MEI.name)
    await userEvent.setup().type(screen.getByPlaceholderText('its-website.org/hours'), 'philamikvah.org/hours')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save and read' }))
    expect(posts.at(-1)).toEqual({ url: HOURS, body: { resourceId: 'mei', action: 'give', url: 'philamikvah.org/hours' } })
    expect(pill(MEI.name)).toBe('Same as the listing')
    expect(within(rowOf(MEI.name)).getByRole('link', { name: 'philamikvah.org/hours' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Turn off this place' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'mei', action: 'off' })
    expect(within(rowOf(MEI.name)).getByRole('button', { name: 'Turn back on' })).toBeInTheDocument()
    expect(within(rowOf(MEI.name)).getByText('Turned off: not read.')).toBeInTheDocument()
  })

  it('one that’s off says so, and Turn back on reads it', async () => {
    await renderPage([place({ id: 'ol', name: 'Mikvah Ohel Leah', off: true }), place({ id: 'x', name: 'Paused Mikvah', pages: [{ watch: watch({ active: false }), source: 'Found from its website' }] })])
    expect(pill('Paused Mikvah')).toBe('Off')
    expect(within(rowOf('Paused Mikvah')).getByText('Turned off: not read.')).toBeInTheDocument()
    await userEvent.setup().click(within(rowOf('Mikvah Ohel Leah')).getByRole('button', { name: 'Turn back on' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'ol', action: 'on' })
  })
})

// ── Shul times, drawn Oct 21 (artifact B3vwpSiqwdK833s9VAVHBc, v13) ─────────
// A shul opened is its listing's boxes: an update per part (Usual Shabbos
// times, This week's schedule) first and open, a part that's the same
// closed under them, Reads last.
describe('Shul times', () => {
  const FIELD = { key: 'minyanim', label: 'Davening Times', type: 'minyanim' as const }
  const m = (id: string, tefillah: Minyan['tefillah'], days: Minyan['days'], time: string, over: Partial<Minyan> = {}): Minyan => ({ id, tefillah, days, time, ...over })
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'] as Minyan['days']
  const listing: Minyan[] = [m('a', 'shacharis', weekdays, '6:45am'), m('b', 'shacharis', weekdays, '8:15am'), m('c', 'shacharis', ['sun'], '7:00am'), m('d', 'mincha_maariv', ['sun', 'mon', 'tue', 'wed', 'thu'], '6:00pm')]
  const shabbos = [m('n1', 'mincha_maariv', ['fri'], '7:00pm', { season: 'summer' }), m('n2', 'shacharis', ['sat'], '9:00am', { notes: 'Main Sanctuary' })]
  const on = (id: string, tefillah: Minyan['tefillah'], dates: string[], time: string) => ({ id, tefillah, on: dates, time })
  const week: SpecialSchedule = {
    id: 'wk',
    name: 'Times for Oct 21 – Oct 24',
    from: '2026-10-21',
    to: '2026-10-24',
    mode: 'replace',
    kind: 'week',
    postedBy: 'website',
    minyanim: [on('w1', 'shacharis', ['2026-10-21', '2026-10-22'], '6:45am'), on('w2', 'shacharis', ['2026-10-21', '2026-10-22'], '8:15am'), on('w3', 'mincha_maariv', ['2026-10-21', '2026-10-22'], '5:55pm'), on('w4', 'shacharis', ['2026-10-24'], '9:00am')],
  }
  const times = (over: Partial<FindingTimes>): FindingTimes => ({ field: FIELD, current: listing, proposed: listing, currentSchedules: [], proposedSchedules: [], ...over })
  const TEFILLOT = 'https://soi.example/tefillot'
  const CAL = 'https://soi.example/cal.php'
  const part = (id: string, p: 'weekday' | 'shabbos' | 'week', page: string, t: FindingTimes) =>
    finding({ id, targetId: 'soi', name: 'Sons of Israel', lines: [{ key: p === 'week' ? 'minyanim_schedules' : 'minyanim', label: 'Davening Times', before: '…', after: '…', choosable: true }], times: t, part: p, page })
  const SHAB = part('s-shab', 'shabbos', TEFILLOT, times({ proposed: [...listing, ...shabbos] }))
  const WEEK = part('s-week', 'week', CAL, times({ proposedSchedules: [week] }))
  const timesPage = (id: string, url: string, over: Partial<WatchCheck> = {}) => ({ watch: watch({ id, url, lastCheck: check('differs', { what: 'times', queue: 'filed', ...over }) }), source: 'Found from its website' })
  // Sons of Israel on dev, Oct 21: Tefillot gives the usual times, the
  // calendar this week's, the home page nothing of its own, one page none.
  const SOI = place({
    id: 'soi',
    name: 'Sons of Israel',
    fields: ['Davening Times'],
    website: 'https://soi.example/',
    times: { key: 'minyanim', minyanim: listing, schedules: [] },
    findings: [WEEK, SHAB],
    pages: [
      timesPage('w-home', 'https://soi.example/', { result: 'agrees', queue: null, parts: [] }),
      timesPage('w-none', 'https://soi.example/cholim', { result: 'nothing', queue: null }),
      timesPage('w-cal', CAL, { parts: [{ part: 'week', size: 4 }] }),
      timesPage('w-tef', TEFILLOT, { parts: [{ part: 'weekday', size: 4 }, { part: 'shabbos', size: 2 }] }),
    ],
  } as Partial<ShulPlace>)
  const KESHER = place({
    id: 'k',
    name: 'Kesher Israel',
    fields: ['Davening Times'],
    website: 'https://kesher.example/',
    times: { key: 'minyanim', minyanim: listing, schedules: [] },
    pages: [timesPage('w-k', 'https://kesher.example/', { result: 'agrees', queue: null, read: ['Shacharis Mon–Fri 6:45 AM'] })],
  } as Partial<ShulPlace>)
  const NONE = place({ id: 'n', name: 'Beth Am', fields: ['Davening Times'], website: 'https://betham.example/', reason: 'Read its website: no davening times on it.' })
  const VILNA = place({ id: 'v', name: 'Vilna Congregation', fields: ['Davening Times'], off: true, offSince: ago(0) })
  const times$ = (places: HoursPlace[], post?: (body: Record<string, unknown>) => Record<string, unknown>) => renderPage(places, post, 'times')
  const today = () => day(new Date().toISOString())
  const shul = (name: string) => screen.getByRole('region', { name })
  const boxes = (name: string) => within(shul(name)).getAllByRole('region').map((b) => `${b.getAttribute('aria-label')} | ${within(b).queryByTestId('box-pill')?.textContent ?? ''} | ${within(b).getAllByRole('button')[0].getAttribute('aria-expanded')}`)
  const box = (name: string, label: string) => within(shul(name)).getByRole('region', { name: label })
  const marked = (b: HTMLElement) => within(b).getAllByTestId('box-row').map((r) => `${r.dataset.mark}: ${r.textContent}`)

  it('says at the top whether a shul has updates, and how many aren’t read yet', async () => {
    await times$([SOI, KESHER, NONE, VILNA, place({ id: 'nr', name: 'Not Read Shul', fields: ['Davening Times'], pages: [{ watch: watch({ id: 'w-nr', lastRunAt: null }), source: 'Found from its website' }] })])
    expect(gets[0]).toBe('/api/admin/watches/hours?job=times&community=philly')
    expect(screen.getByTestId('job-counts')).toHaveTextContent('1 shul has updates from its website. 1 not read yet.')
    expect(pill(SOI.name)).toBe('2 updates')
    await tab('Checked')
    expect(pill(KESHER.name)).toBe('Same')
  })

  it('a quiet day says so', async () => {
    await times$([KESHER])
    expect(screen.getByTestId('job-counts')).toHaveTextContent('No shul’s website has an update.')
  })

  it('opened: an open box per update, first; the part that’s the same closed under them; Reads last', async () => {
    await times$([SOI])
    await open(SOI.name)
    expect(boxes(SOI.name)).toEqual(['Usual Shabbos times | 2 new | true', 'This week’s schedule | Oct 21–24 | true', 'Usual weekday times | Same | false', 'Reads | 4 pages | false'])
  })

  it('an update’s box: its rows under their days, a new one lit; Use this, Edit, Keep the listing; where it’s from', async () => {
    await times$([SOI])
    await open(SOI.name)
    const b = box(SOI.name, 'Usual Shabbos times')
    expect(within(b).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Friday night', 'Shabbos day'])
    expect(marked(b)).toEqual(['new: Mincha & MaarivSummer7 PM', 'new: ShacharisMain Sanctuary9 AM'])
    expect(within(b).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Use this', 'Edit', 'Keep the listing'])
    expect(within(b).getByTestId('box-source')).toHaveTextContent(/^From soi\.example\/tefillot · read [A-Z][a-z]{2} \d+$/)
  })

  it('this week’s: days with the same times as one, a tefillah’s times on one line, a changed one beside its usual time', async () => {
    await times$([SOI])
    await open(SOI.name)
    const b = box(SOI.name, 'This week’s schedule')
    expect(within(b).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Wed, Oct 21 and Thu, Oct 22', 'Shabbos, Oct 24'])
    expect(marked(b)).toEqual(['same: Shacharis6:45 and 8:15 AM', 'changed: Mincha & Maariv5:55 PM6 PM', 'same: Shacharis9 AM'])
    expect(within(b).getByText('6 PM').tagName).toBe('S')
    expect(within(b).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Use this week', 'Edit', 'Skip this week'])
    expect(within(b).getByTestId('box-source')).toHaveTextContent(/^From soi\.example\/cal\.php · read/)
  })

  it('the same part: the listing’s times, grouped, “Same as” the page that gave it, no buttons', async () => {
    await times$([SOI])
    await open(SOI.name)
    const user = userEvent.setup()
    await user.click(within(shul(SOI.name)).getByRole('button', { name: /^Usual weekday times/ }))
    const b = box(SOI.name, 'Usual weekday times')
    expect(within(b).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Sunday', 'Monday to Friday', 'Sunday to Thursday'])
    expect(marked(b)).toEqual(['same: Shacharis7 AM', 'same: Shacharis6:45 and 8:15 AM', 'same: Mincha & Maariv6 PM'])
    expect(within(b).getByTestId('box-source')).toHaveTextContent(/^Same as soi\.example\/tefillot · read/)
    expect(within(b).getAllByRole('button')).toHaveLength(1)
  })

  it('Reads: the pages that gave a part first, named for it; then the one that gave nothing; a page with no times greyed last', async () => {
    await times$([SOI])
    await open(SOI.name)
    await userEvent.setup().click(within(shul(SOI.name)).getByRole('button', { name: /^Reads/ }))
    const lines = within(shul(SOI.name)).getAllByTestId('job-source').map((l) => l.textContent?.replace(/read [A-Z][a-z]{2} \d+/, 'read …'))
    expect(lines).toEqual([
      'soi.example/tefillotUsual weekday times · Usual Shabbos timesread …',
      'soi.example/cal.phpThis week’s scheduleread …',
      'soi.exampleNothing from itread …',
      'soi.example/cholimno times',
    ])
    expect(within(shul(SOI.name)).getByRole('switch', { name: /Reading/ })).toHaveAttribute('aria-checked', 'true')
    await userEvent.setup().click(within(shul(SOI.name)).getByRole('button', { name: 'Stop reading soi.example/cholim' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'soi', action: 'stop', id: 'w-none' })
  })

  it('Use this changes only that part; its box closes, says so, and sits under the update still to decide', async () => {
    await times$([SOI])
    await open(SOI.name)
    await userEvent.setup().click(within(box(SOI.name, 'Usual Shabbos times')).getByRole('button', { name: 'Use this' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-shab?community=philly', body: { status: 'approved' } })
    expect(boxes(SOI.name).slice(0, 2)).toEqual(['This week’s schedule | Oct 21–24 | true', `Usual Shabbos times | Used ${today()} | false`])
    expect(pill(SOI.name)).toBe('1 update')
    await userEvent.setup().click(within(box(SOI.name, 'This week’s schedule')).getByRole('button', { name: 'Skip this week' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-week?community=philly', body: { status: 'rejected' } })
    expect(boxes(SOI.name).slice(0, 2)).toEqual([`Usual Shabbos times | Used ${today()} | false`, `This week’s schedule | Skipped ${today()} | false`])
    expect(pill(SOI.name)).toBe(`Used ${today()}`)
    expect(screen.getByTestId('job-counts')).toHaveTextContent('No shul’s website has an update.')
  })

  it('Keep the listing: kept, and said so', async () => {
    await times$([place({ ...SOI, findings: [SHAB] })])
    await open(SOI.name)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Keep the listing' }))
    expect(posts.at(-1)!.body).toEqual({ status: 'rejected' })
    expect(pill(SOI.name)).toBe(`Kept ${today()}`)
  })

  it('Edit: the listing’s own editor for that part, filled with the website’s, saved to the listing as that update', async () => {
    const category = makeCategory({ id: 'synagogue', detailFields: [FIELD] })
    const item = makeListing({ id: 'soi', category: 'synagogue', name: 'Sons of Israel', minyanim: listing })
    await times$([place({ ...SOI, findings: [SHAB] })])
    const listed = vi.mocked(fetchJson).getMockImplementation()!
    vi.mocked(fetchJson).mockImplementation(async (url, init, fallback) => (String(url).includes('item=soi') ? { ok: true, item, category } : listed(url, init, fallback)))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await open(SOI.name)
    const user = userEvent.setup()
    await user.click(within(box(SOI.name, 'Usual Shabbos times')).getByRole('button', { name: 'Edit' }))
    expect(vi.mocked(fetchJson).mock.calls.map(([u]) => u)).toContain('/api/admin/watches/hours?job=times&item=soi&community=philly')
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText('9 AM')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Save to the listing' }))
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/admin/submissions/'))!
    expect(String(url)).toBe('/api/admin/submissions/s-shab?community=philly')
    const sent = JSON.parse(String(init!.body))
    expect(sent.status).toBe('approved')
    expect(sent.payload.details.minyanim).toEqual(expect.arrayContaining([expect.objectContaining({ tefillah: 'shacharis', days: ['sat'], time: '9:00am' })]))
    expect(await screen.findByText(`Used ${today()}`, { selector: '[data-testid="job-status"]' })).toBeTruthy()
    fetchMock.mockRestore()
  })

  it('a filing from before parts is shown whole, to compare', async () => {
    await times$([place({ ...SOI, findings: [finding({ id: 's-old', targetId: 'soi', lines: [{ key: 'minyanim', label: 'Davening Times', before: 'a', after: 'b', choosable: true }] })] })])
    await open(SOI.name)
    expect(within(shul(SOI.name)).getByRole('region', { name: 'From its website' })).toBeInTheDocument()
    expect(within(shul(SOI.name)).getByRole('button', { name: 'Compare' })).toBeInTheDocument()
  })

  it('Reading off: its row says Not read, Reads says Off; turned back on, it’s read', async () => {
    await times$([KESHER, VILNA], (body) => (body.action === 'off' ? { pages: KESHER.pages.map((x) => ({ ...x, watch: { ...x.watch, active: false } })), off: true } : { pages: [], off: false, reason: 'Read its website: no davening times on it.' }))
    await open(KESHER.name)
    const user = userEvent.setup()
    await user.click(within(shul(KESHER.name)).getByRole('button', { name: /^Reads/ }))
    await user.click(within(shul(KESHER.name)).getByRole('switch', { name: /Reading/ }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/hours?job=times&community=philly', body: { resourceId: 'k', action: 'off' } })
    expect(pill(KESHER.name)).toBe('Not read')
    await tab('Off')
    await open(VILNA.name)
    const reads = within(shul(VILNA.name)).getByRole('region', { name: 'Reads' })
    expect(within(reads).getByTestId('box-pill')).toHaveTextContent('Off')
    expect(within(reads).queryByRole('button', { name: 'Read them now' })).toBeNull()
    await user.click(within(reads).getByRole('switch'))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'v', action: 'on' })
  })

  it('one that can’t be read: why on its row; opened, only Reads, open, its website saying why', async () => {
    await times$([NONE])
    expect(pill(NONE.name)).toBe('No times found')
    await open(NONE.name)
    expect(boxes(NONE.name)).toEqual(['Reads | 1 page | true'])
    expect(within(shul(NONE.name)).getByTestId('job-source')).toHaveTextContent('betham.exampleno times')
    await userEvent.setup().click(within(shul(NONE.name)).getByRole('button', { name: 'Add a page' }))
    expect(screen.getByPlaceholderText('its-website.org/davening')).toBeInTheDocument()
  })
})
