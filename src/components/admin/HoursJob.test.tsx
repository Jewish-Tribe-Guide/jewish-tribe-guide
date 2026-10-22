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
import HoursJob, { READ_ON_LOAD, type HoursPlace } from './HoursJob'

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

// ── Shul times, redrawn Oct 21 (artifact B3vwpSiqwdK833s9VAVHBc) ────────────
describe('Shul times', () => {
  const FIELD = { key: 'minyanim', label: 'Davening Times', type: 'minyanim' as const }
  const rule = { time: 'At Candle Lighting (not after 7:00 PM)', anchor: 'candle_lighting' as const, offsetMinutes: 0, notAfter: '19:00' }
  const shacharis: Minyan = { id: 's1', tefillah: 'shacharis', days: ['mon', 'thu'], time: '6:45am' }
  const friday: Minyan = { id: 'f1', tefillah: 'mincha_maariv', days: ['fri'], ...rule }
  const week: SpecialSchedule = { id: 'wk', name: 'Times for Oct 19 – Oct 25', from: '2026-10-19', to: '2026-10-25', mode: 'replace', kind: 'week', postedBy: 'website', minyanim: [{ id: 'a', tefillah: 'shacharis', on: ['2026-10-22'], time: '7:00am' }] }
  const times = (over: Partial<FindingTimes> = {}): FindingTimes => ({
    field: FIELD,
    current: [shacharis, friday],
    proposed: [shacharis, { id: 'n1', tefillah: 'mincha_maariv', days: ['fri'], time: '7:00 PM', season: 'summer' }, { ...friday, season: 'winter' }],
    currentSchedules: [],
    proposedSchedules: [],
    ...over,
  })
  const usualLine = { key: 'minyanim', label: 'Davening Times', before: '…', after: '…', choosable: true }
  const weekLine = { key: 'minyanim_schedules', label: 'Special schedules', before: '—', after: '…', choosable: true }
  const page = (id: string, over: Partial<WatchCheck> = {}, url = 'https://mekorhabracha.org/davening') => ({ watch: watch({ id, url, lastCheck: check('differs', { what: 'times', queue: 'filed', ...over }) }), source: 'Found from its website' })
  const MEKOR = place({
    id: 'mekor',
    name: 'Mekor Habracha',
    fields: ['Davening Times'],
    website: 'https://mekorhabracha.org/',
    pages: [page('w-mekor')],
    findings: [finding({ id: 's-mekor', targetId: 'mekor', name: 'Mekor Habracha', lines: [usualLine], times: times() })],
  })
  const KESHER = place({ id: 'k', name: 'Kesher Israel', fields: ['Davening Times'], website: 'https://historickesherisrael.com/', pages: [page('w-k', { result: 'agrees', queue: null, read: ['Shacharis · Sun–Fri · 8:00 AM'] }, 'https://historickesherisrael.com/')] })
  const NONE = place({ id: 'n', name: 'Beth Am', fields: ['Davening Times'], website: 'https://betham.org/', reason: 'Read its website: no davening times on it.' })
  const VILNA = place({ id: 'v', name: 'Vilna Congregation', fields: ['Davening Times'], off: true, offSince: ago(0) })
  const times$ = (places: HoursPlace[], post?: (body: Record<string, unknown>) => Record<string, unknown>) => renderPage(places, post, 'times')

  it('says at the top whether anything needs you, with no Not read yet', async () => {
    await times$([MEKOR, KESHER, NONE, VILNA])
    expect(gets[0]).toBe('/api/admin/watches/hours?job=times&community=philly')
    expect(screen.getByTestId('job-counts')).toHaveTextContent('1 shul’s website says something different.4 shuls, read every morning from their own websites. 1 needs its page found. 1 kept by hand.')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['To check 1', 'Can’t be read 1', 'Checked 1', 'Off 1'])
  })

  it('a quiet day says so', async () => {
    await times$([KESHER, { ...KESHER, id: 'k2', name: 'Kesher Two' }])
    expect(screen.getByTestId('job-counts')).toHaveTextContent('All 2 shuls match their websites.')
  })

  it('a shul with a change says the change on its row, and opening it is the comparison: no Compare', async () => {
    await times$([MEKOR])
    expect(pill(MEKOR.name)).toBe('2 changes')
    expect(within(rowOf(MEKOR.name)).getByTestId('job-line')).toHaveTextContent('Mincha & Maariv · Fri: new, 7 PM in summer, at candle lighting, never after 7 PM in winter')
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull()
    await open(MEKOR.name)
    const shul = screen.getByRole('region', { name: MEKOR.name })
    expect(within(shul).getByText(/^From/)).toHaveTextContent(/^From mekorhabracha\.org\/davening · read [A-Z][a-z]{2} \d+$/)
    expect(within(shul).getByText('Their website says the usual times should be:')).toBeInTheDocument()
    const marked = within(shul).getAllByTestId('proposal-row').map((r) => `${r.dataset.status}: ${r.textContent}`)
    expect(marked).toEqual([
      'same: Shacharis · Mon, Thu6:45 AM',
      'new: NewMincha & Maariv · FriSummer7 PM',
      'changed: ChangedMincha & Maariv · FriWinterAll yearat candle lighting, never after 7 PM',
    ])
    expect(within(shul).getByText('All year').tagName).toBe('S')
    expect(within(shul).getByText('This week’s schedule: their website doesn’t post one, so the listing shows the usual times.')).toBeInTheDocument()
    // Its pages, under the proposal.
    expect(within(shul).getByTestId('shul-pages')).toHaveTextContent('Reads 1 page.')
    expect(within(shul).getByRole('button', { name: 'Use a different page' })).toBeInTheDocument()
    expect(within(shul).getByRole('button', { name: 'Add a page' })).toBeInTheDocument()
    expect(within(shul).getByRole('link', { name: 'Open its website' })).toHaveAttribute('href', 'https://mekorhabracha.org/')
  })

  it('Use this makes the listing the proposal; it says so where it was, and the top says nothing needs you', async () => {
    await times$([MEKOR])
    await open(MEKOR.name)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Use this' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-mekor?community=philly', body: { status: 'approved' } })
    expect(screen.getByTestId('finding-decided')).toHaveTextContent('Updated on the listing.')
    expect(screen.getByTestId('job-counts')).toHaveTextContent(/^Its one shul matches its website\./)
  })

  it('Keep the listing skips it until the website changes', async () => {
    await times$([MEKOR])
    await open(MEKOR.name)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Keep the listing' }))
    expect(posts.at(-1)!.body).toEqual({ status: 'rejected' })
    expect(screen.getByTestId('finding-decided')).toHaveTextContent('Skipped. Not shown again unless its website says something new.')
  })

  it('Edit opens the proposal in the listing’s editor, filled in, and saves what was edited', async () => {
    await times$([MEKOR])
    await open(MEKOR.name)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('proposal-edit')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save to the listing' }))
    expect(posts.at(-1)!.body).toEqual({ status: 'approved', payload: { details: { minyanim: times().proposed, minyanim_schedules: [] } } })
  })

  it('a posted week is proposed apart from the usual times, on its own dates', async () => {
    const posted = place({ ...MEKOR, findings: [finding({ id: 's-wk', targetId: 'mekor', lines: [weekLine], times: times({ proposed: [shacharis, friday], proposedSchedules: [week] }) })] })
    await times$([posted])
    expect(pill(MEKOR.name)).toBe('This week')
    expect(within(rowOf(MEKOR.name)).getByTestId('job-line')).toHaveTextContent('This week’s schedule, Oct 19 – Oct 25: Thursday, Oct 22, Shacharis 7 AM, usually 6:45 AM')
    await open(MEKOR.name)
    expect(screen.getByTestId('proposal-week')).toHaveTextContent('Goes on the listing as This week’s schedule. The usual times stay as they are.')
    expect(screen.getByText(/Same as their website\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip this week' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Use this week' }))
    expect(posts.at(-1)!.body).toEqual({ status: 'approved' })
  })

  it('with both, each part has a tick, and Use this sends only the ticked one', async () => {
    const both = place({ ...MEKOR, findings: [finding({ id: 's-both', targetId: 'mekor', lines: [usualLine, weekLine], times: times({ proposedSchedules: [week] }) })] })
    await times$([both])
    await open(MEKOR.name)
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: /^Use This week’s schedule/ }))
    await user.click(screen.getByRole('button', { name: 'Use this' }))
    expect(posts.at(-1)!.body).toEqual({ status: 'approved', only: ['minyanim'] })
  })

  it('a shul that matches shows what it read', async () => {
    await times$([KESHER])
    expect(pill(KESHER.name)).toBe('Same')
    expect(within(rowOf(KESHER.name)).getByTestId('job-line')).toHaveTextContent(/^Same as their website · read [A-Z][a-z]{2} \d+$/)
    await open(KESHER.name)
    expect(screen.getByTestId('job-read')).toHaveTextContent('Same as their website. Usual times it read:Shacharis · Sun–Fri · 8:00 AMNothing to decide. Read again every morning.')
  })

  it('Reading is a switch per shul: off, it’s kept by hand; on, it’s read straight away', async () => {
    await times$([KESHER, VILNA], (body) => (body.action === 'off' ? { pages: KESHER.pages.map((x) => ({ ...x, watch: { ...x.watch, active: false } })), off: true } : { pages: [], off: false, reason: 'Read its website: no davening times on it.' }))
    await open(KESHER.name)
    const user = userEvent.setup()
    await user.click(screen.getByRole('switch', { name: /Reading/ }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/hours?job=times&community=philly', body: { resourceId: 'k', action: 'off' } })
    expect(pill(KESHER.name)).toBe('Reading off')
    expect(screen.getByRole('switch', { name: /Reading/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('button', { name: 'Turn off this place' })).toBeNull()
    await tab('Off')
    expect(within(rowOf(VILNA.name)).getByTestId('job-line')).toHaveTextContent(/^Kept by hand · reading turned off [A-Z][a-z]{2} \d+$/)
    await open(VILNA.name)
    await user.click(within(screen.getByRole('region', { name: VILNA.name })).getByRole('switch'))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'v', action: 'on' })
  })

  it('one that can’t be read opens with its page to give', async () => {
    await times$([NONE])
    expect(pill(NONE.name)).toBe('Can’t be read')
    await open(NONE.name)
    expect(screen.getByPlaceholderText('its-website.org/davening')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'No times online' })).toBeNull()
  })
})

