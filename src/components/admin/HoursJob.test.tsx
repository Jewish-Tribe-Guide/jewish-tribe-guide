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
import type { ListedSection, MikvahPlace } from './MikvahHours'
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
/** On the tab showing. */
const shown = (name: string) => screen.queryAllByTestId('job-row').some((r) => within(r).queryAllByText(name).length > 0)
const open = (name: string) => userEvent.setup().click(within(rowOf(name)).getAllByRole('button')[0])
const tab = (name: string) => userEvent.setup().click(screen.getByRole('tab', { name: new RegExp(`^${name} \\d+$`) }))
const HOURS = '/api/admin/watches/hours?community=philly'

afterEach(() => {
  posts.length = 0
  gets.length = 0
  cleanup()
  vi.resetAllMocks()
})

// ── Mikvah hours, drawn Oct 21 (artifact 7MUNppcA4S4yvXKupEKJPR) ────────────
// A mikvah opened is its listing's own sections: an update per section
// (Women’s), its Hours and its Notes, first and open; a section a page gives
// the same closed under it; Reads last.
describe('Mikvah hours', () => {
  const evening = (open: string, close: string) => ({ open, close })
  const night = evening('20:30', '22:30')
  const earlier = evening('19:30', '21:30')
  const dawn = evening('04:30', '10:00')
  const WOMEN_NOW = { sun: null, mon: night, tue: night, wed: night, thu: night, fri: null, sat: null }
  const WOMEN_READ = { sun: earlier, mon: earlier, tue: earlier, wed: earlier, thu: earlier, fri: null, sat: null }
  const MEN_NOW = { sun: dawn, mon: dawn, tue: dawn, wed: dawn, thu: dawn }
  const NOTE = 'By appointment, 48 hours ahead.'
  // Lower Merion's sections as its listing has them (dev, Oct 22).
  const SECTIONS: ListedSection[] = [
    { section: 'womenTevillah', label: 'Women’s', hours: 'women_s_hours', notes: 'women_s_notes', labels: ['Women’s Hours', 'Women’s Notes'], now: { women_s_hours: WOMEN_NOW, women_s_notes: 'By appointment.' } },
    { section: 'menTevillah', label: 'Men’s', hours: 'men_s_hours', notes: 'men_s_notes', labels: ['Men’s Hours', 'Men’s Notes'], now: { men_s_hours: MEN_NOW, men_s_notes: null } },
    { section: 'keilim', label: 'Keilim', hours: 'keilim_hours', notes: null, labels: ['Keilim Hours'], now: { keilim_hours: null } },
  ]
  const HOME = 'https://lmcmikvah.org/'
  const MENS = 'https://lmcmikvah.org/mens-mikvah/'
  const WOMEN = finding({
    id: 's-women',
    page: HOME,
    section: 'womenTevillah',
    values: { women_s_hours: WOMEN_READ, women_s_notes: NOTE },
    lines: [
      { key: 'women_s_hours', label: 'Women’s Hours', before: '…', after: '…', choosable: true },
      { key: 'women_s_notes', label: 'Women’s Notes', before: 'By appointment.', after: NOTE, choosable: true },
    ],
  })
  const page = (id: string, url: string, c: WatchCheck) => ({ watch: watch({ id, url, lastCheck: c }), source: 'Found from its website' })
  const LOWER: MikvahPlace = place({
    id: 'lmc',
    name: 'Lower Merion Community Mikvah',
    website: HOME,
    findings: [WOMEN],
    sections: SECTIONS,
    pages: [
      page('w-none', 'https://lmcmikvah.org/contact', check('nothing')),
      page('w-mens', MENS, check('agrees', { read: ['Men’s Hours, Sun–Thu: 4:30 AM – 10:00 AM'] })),
      page('w-home', HOME, check('differs', { queue: 'filed', read: ['Women’s Hours, Sun–Thu: 7:30 PM – 9:30 PM', `Women’s Notes: ${NOTE}`] })),
    ],
  } as Partial<MikvahPlace>)
  const SAME: MikvahPlace = place({ id: 'mz', name: 'Mikvah Moishe Zvi', sections: [SECTIONS[1]], pages: [page('w-mz', 'https://mikvahwestphilly.com/', check('agrees', { read: ['Men’s Hours, Sun–Thu: 4:30 AM – 10:00 AM'] }))] } as Partial<MikvahPlace>)
  const NONE = place({ id: 'mei', name: 'Mikvah Mei Shalva', website: 'https://philamikvah.org/', reason: 'Read its website: no weekly hours on it.' })
  const OFF = place({ id: 'ol', name: 'Mikvah Ohel Leah', off: true, offSince: ago(0) })
  const today = () => day(new Date().toISOString())
  const mikvah = (name: string) => screen.getByRole('region', { name })
  const boxes = (name: string) => within(mikvah(name)).getAllByRole('region').map((b) => `${b.getAttribute('aria-label')} | ${within(b).queryByTestId('box-pill')?.textContent ?? ''} | ${within(b).getAllByRole('button')[0].getAttribute('aria-expanded')}`)
  const box = (name: string, label: string) => within(mikvah(name)).getByRole('region', { name: label })
  const marked = (b: HTMLElement) => within(b).getAllByTestId('box-row').map((r) => `${r.dataset.mark}: ${r.textContent}`)

  it('says at the top whether a mikvah has an update; tabs, each with its count', async () => {
    await renderPage([SAME, NONE, LOWER, OFF])
    expect(gets[0]).toBe(HOURS)
    expect(screen.getByTestId('job-counts')).toHaveTextContent('1 mikvah has an update from its website.')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['To check 1', 'Can’t be read 1', 'Checked 1', 'Off 1'])
    expect(pill(LOWER.name)).toBe('1 update')
    await tab('Checked')
    expect(pill(SAME.name)).toBe('Same')
    await tab('Can’t be read')
    expect(pill(NONE.name)).toBe('No hours found')
    expect(screen.getByRole('link', { name: '‹ Watches' })).toHaveAttribute('href', '/philly/admin/watches')
  })

  // Oct 22: a place the morning's search hasn't reached yet (the page
  // itself searches nothing).
  it('a mikvah not searched yet says so', async () => {
    await renderPage([{ ...NONE, reason: 'Not searched yet.' }])
    expect(pill(NONE.name)).toBe('Not searched yet')
  })

  it('a quiet day says so, and opens on the first tab with anything in it', async () => {
    await renderPage([SAME, NONE])
    expect(screen.getByTestId('job-counts')).toHaveTextContent('No mikvah’s website has an update.')
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Can’t be read')
    await tab('To check')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('None right now.')
  })

  it('opened: a box per section it reads, the update first and open; the same one closed; Reads last', async () => {
    await renderPage([LOWER])
    await open(LOWER.name)
    expect(boxes(LOWER.name)).toEqual(['Women’s | 3 changes | true', 'Men’s | Same | false', 'Reads | 3 pages | false'])
  })

  it('an update: its hours by day beside what they were, its note lit with the old one struck; Use this, Edit, Keep; where it’s from', async () => {
    await renderPage([LOWER])
    await open(LOWER.name)
    const b = box(LOWER.name, 'Women’s')
    expect(within(b).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Hours', 'Notes'])
    expect(marked(b)).toEqual(['changed: Sunday7:30–9:30 PMClosed', 'changed: Monday to Thursday7:30–9:30 PM8:30–10:30 PM'])
    const note = within(b).getByTestId('box-note')
    expect(note.dataset.mark).toBe('changed')
    expect(note).toHaveTextContent(NOTE)
    expect(within(note).getByText('By appointment.').tagName).toBe('S')
    expect(within(b).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Use this', 'Edit', 'Keep the listing'])
    expect(within(b).getByTestId('box-source')).toHaveTextContent(/^From lmcmikvah\.org · read [A-Z][a-z]{2} \d+$/)
  })

  it('the same section: the listing’s hours, unmarked, “Same as” the page that gave it, no buttons', async () => {
    await renderPage([LOWER])
    await open(LOWER.name)
    await userEvent.setup().click(within(mikvah(LOWER.name)).getByRole('button', { name: /^Men’s/ }))
    const b = box(LOWER.name, 'Men’s')
    expect(marked(b)).toEqual(['same: Sunday to Thursday4:30–10:00 AM'])
    expect(within(b).queryByTestId('box-note')).toBeNull()
    expect(within(b).getByTestId('box-source')).toHaveTextContent(/^Same as lmcmikvah\.org\/mens-mikvah · read/)
    expect(within(b).getAllByRole('button')).toHaveLength(1)
  })

  it('Reads: each page named for the section it gives; one with no hours greyed last, and can be stopped', async () => {
    await renderPage([LOWER])
    await open(LOWER.name)
    await userEvent.setup().click(within(mikvah(LOWER.name)).getByRole('button', { name: /^Reads/ }))
    const lines = within(mikvah(LOWER.name)).getAllByTestId('job-source').map((l) => l.textContent?.replace(/read [A-Z][a-z]{2} \d+/, 'read …'))
    expect(lines).toEqual(['lmcmikvah.orgWomen’sread …', 'lmcmikvah.org/mens-mikvahMen’sread …', 'lmcmikvah.org/contactno hours'])
    await userEvent.setup().click(within(mikvah(LOWER.name)).getByRole('button', { name: 'Stop reading lmcmikvah.org/contact' }))
    expect(posts.at(-1)).toEqual({ url: HOURS, body: { resourceId: 'lmc', action: 'stop', id: 'w-none' } })
  })

  it('Use this takes the section whole; its box closes and says so', async () => {
    await renderPage([LOWER])
    await open(LOWER.name)
    await userEvent.setup().click(within(box(LOWER.name, 'Women’s')).getByRole('button', { name: 'Use this' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-women?community=philly', body: { status: 'approved' } })
    // Nothing left to decide: straight to Checked (the user, Oct 22).
    expect(shown(LOWER.name)).toBe(false)
    expect(screen.getByTestId('job-counts')).toHaveTextContent('No mikvah’s website has an update.')
    await tab('Checked')
    expect(pill(LOWER.name)).toBe(`Used ${today()}`)
    await open(LOWER.name)
    expect(boxes(LOWER.name)[0]).toBe(`Women’s | Used ${today()} | false`)
  })

  it('Keep the listing: kept, and said so', async () => {
    await renderPage([LOWER])
    await open(LOWER.name)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Keep the listing' }))
    expect(posts.at(-1)!.body).toEqual({ status: 'rejected' })
    expect(shown(LOWER.name)).toBe(false)
    await tab('Checked')
    expect(pill(LOWER.name)).toBe(`Kept ${today()}`)
  })

  it('Edit: the listing’s own editor for the section, filled with the website’s, saving that section only', async () => {
    const category = makeCategory({
      id: 'mikvah',
      detailFields: [
        { key: 'womenTevillah', label: 'Women’s Tevillah', type: 'boolean', filterLabel: 'Women’s' },
        { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours', audienceKey: 'womenTevillah' },
        { key: 'women_s_notes', label: 'Women’s Notes', type: 'textarea', audienceKey: 'womenTevillah' },
        { key: 'men_s_hours', label: 'Men’s Hours', type: 'hours', audienceKey: 'menTevillah' },
      ],
    })
    const item = makeListing({ id: 'lmc', category: 'mikvah', name: LOWER.name, womenTevillah: true, women_s_hours: WOMEN_NOW, women_s_notes: 'By appointment.', men_s_hours: MEN_NOW })
    await renderPage([LOWER])
    const listed = vi.mocked(fetchJson).getMockImplementation()!
    vi.mocked(fetchJson).mockImplementation(async (url, init, fallback) => (String(url).includes('item=lmc') ? { ok: true, item, category } : listed(url, init, fallback)))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await open(LOWER.name)
    const user = userEvent.setup()
    await user.click(within(box(LOWER.name, 'Women’s')).getByRole('button', { name: 'Edit' }))
    expect(vi.mocked(fetchJson).mock.calls.map(([u]) => u)).toContain('/api/admin/watches/hours?item=lmc&community=philly')
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText('Women’s hours')).toBeInTheDocument()
    expect(within(sheet).getByDisplayValue(NOTE)).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Save to the listing' }))
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/admin/submissions/'))!
    expect(String(url)).toBe('/api/admin/submissions/s-women?community=philly')
    const sent = JSON.parse(String(init!.body))
    expect(sent.status).toBe('approved')
    expect(Object.keys(sent.payload.details).sort()).toEqual(['women_s_hours', 'women_s_notes'])
    expect(sent.payload.details.women_s_notes).toBe(NOTE)
    expect(sent.payload.details.women_s_hours).toMatchObject({ sun: earlier, mon: earlier })
    await waitFor(() => expect(shown(LOWER.name)).toBe(false))
    await tab('Checked')
    expect(pill(LOWER.name)).toBe(`Used ${today()}`)
    fetchMock.mockRestore()
  })

  // Mikvah hours board 1's Contact (Oct 22): only what Google doesn't keep.
  describe('its Contact, from its website', () => {
    const CONTACT = { name: 'Contact', fields: [{ key: 'phone', label: 'Phone', kind: 'phone' as const, value: '(484) 808-5626' }, { key: 'e', label: 'Email', kind: 'email' as const, value: 'office@lmcmikvah.org' }] }
    const PHONE = finding({ id: 's-contact', page: HOME, section: 'contact', values: { phone: '(484) 808-5600' }, lines: [{ key: 'phone', label: 'Phone', before: '(484) 808-5626', after: '(484) 808-5600', choosable: true }] })
    const withContact = (over: Partial<WatchCheck>) => ({
      ...LOWER,
      contact: CONTACT,
      findings: [WOMEN, PHONE],
      pages: LOWER.pages.map((x) => (x.watch.id === 'w-home' ? { ...x, watch: { ...x.watch, lastCheck: { ...x.watch.lastCheck!, ...over } } } : x)),
    })
    const MZ_CONTACT = { name: 'Contact', fields: [{ key: 'women_s_phone', label: 'Women’s Phone', kind: 'phone' as const, value: '267.496.1990' }, { key: 'men_s_phone', label: 'Men’s Phone', kind: 'phone' as const, value: '267.738.8995' }] }

    it('an update: after the sections’ updates, above the Same ones; the changed phone beside what it was, the email as listed', async () => {
      await renderPage([withContact({ contact: { same: ['e'], changes: ['phone'] } })])
      await open(LOWER.name)
      expect(boxes(LOWER.name)).toEqual(['Women’s | 3 changes | true', 'Contact | 1 change | true', 'Men’s | Same | false', 'Reads | 3 pages | false'])
      const b = box(LOWER.name, 'Contact')
      expect(marked(b)).toEqual(['changed: Phone(484) 808-5600(484) 808-5626', 'same: Emailoffice@lmcmikvah.org'])
      expect(within(b).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Use this', 'Edit', 'Keep the listing'])
      expect(within(b).getByTestId('box-source')).toHaveTextContent(/^From lmcmikvah\.org · read/)
      expect(pill(LOWER.name)).toBe('2 updates')
      await userEvent.setup().click(within(b).getByRole('button', { name: 'Use this' }))
      expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-contact?community=philly', body: { status: 'approved' } })
      expect(boxes(LOWER.name)[1]).toBe(`Contact | Used ${today()} | false`)
    })

    it('Reads names the page for it too', async () => {
      await renderPage([withContact({ contact: { same: ['e'], changes: ['phone'] } })])
      await open(LOWER.name)
      await userEvent.setup().click(within(mikvah(LOWER.name)).getByRole('button', { name: /^Reads/ }))
      expect(within(mikvah(LOWER.name)).getAllByTestId('job-source')[0].textContent?.replace(/read [A-Z][a-z]{2} \d+/, 'read …')).toBe('lmcmikvah.orgWomen’s · Contactread …')
    })

    it('the same: closed after the sections, the listing’s own, “Same as” the page that gave them', async () => {
      const mz = { ...SAME, contact: MZ_CONTACT, pages: SAME.pages.map((x) => ({ ...x, watch: { ...x.watch, lastCheck: { ...x.watch.lastCheck!, contact: { same: ['women_s_phone', 'men_s_phone'], changes: [] } } } })) }
      await renderPage([mz])
      await tab('Checked')
      await open(SAME.name)
      expect(boxes(SAME.name)).toEqual(['Men’s | Same | false', 'Contact | Same | false', 'Reads | 1 page | false'])
      await userEvent.setup().click(within(mikvah(SAME.name)).getByRole('button', { name: /^Contact/ }))
      const b = box(SAME.name, 'Contact')
      expect(marked(b)).toEqual(['same: Women’s Phone267.496.1990', 'same: Men’s Phone267.738.8995'])
      expect(within(b).getByTestId('box-source')).toHaveTextContent(/^Same as mikvahwestphilly\.com · read/)
    })

    it('Edit: the listing’s own contact box, filled with the website’s phone, saved to the listing', async () => {
      const category = makeCategory({ id: 'mikvah', hasPhone: true, detailFields: [{ key: 'website', label: 'Website', type: 'url', renderAs: 'row' }, { key: 'e', label: 'Email', type: 'text', renderAs: 'row' }] })
      const item = makeListing({ id: 'lmc', category: 'mikvah', name: LOWER.name, address: '123 Main St', phone: '(484) 808-5626', website: 'https://lmcmikvah.org/', e: 'office@lmcmikvah.org' })
      await renderPage([withContact({})])
      const listed = vi.mocked(fetchJson).getMockImplementation()!
      vi.mocked(fetchJson).mockImplementation(async (url, init, fallback) => (String(url).includes('item=lmc') ? { ok: true, item, category } : listed(url, init, fallback)))
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      await open(LOWER.name)
      const user = userEvent.setup()
      await user.click(within(box(LOWER.name, 'Contact')).getByRole('button', { name: 'Edit' }))
      expect(vi.mocked(fetchJson).mock.calls.map(([u]) => u)).toContain('/api/admin/watches/hours?item=lmc&community=philly')
      const sheet = await screen.findByRole('dialog')
      expect(within(sheet).getByDisplayValue('(484) 808-5600')).toBeInTheDocument()
      // The rest of the box is the admin's to fix while there.
      await user.clear(within(sheet).getByDisplayValue('https://lmcmikvah.org/'))
      await user.type(within(sheet).getByLabelText('Website'), 'https://lmcmikvah.org/contact')
      await user.click(within(sheet).getByRole('button', { name: 'Save to the listing' }))
      const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/admin/submissions/'))!
      expect(String(url)).toBe('/api/admin/submissions/s-contact?community=philly')
      const sent = JSON.parse(String(init!.body))
      expect(sent).toMatchObject({ status: 'approved', payload: { phone: '(484) 808-5600', address: '123 Main St', details: { website: 'https://lmcmikvah.org/contact', e: 'office@lmcmikvah.org' } } })
      fetchMock.mockRestore()
    })
  })

  it('a finding that isn’t one section’s is shown whole, to compare', async () => {
    await renderPage([{ ...LOWER, findings: [finding({ id: 's-old', targetId: 'lmc' })] } as MikvahPlace])
    await open(LOWER.name)
    expect(within(mikvah(LOWER.name)).getByRole('region', { name: 'From its website' })).toBeInTheDocument()
    expect(within(mikvah(LOWER.name)).getByRole('button', { name: 'Compare' })).toBeInTheDocument()
  })

  it('Read them now reads every page of the place, and what it filed shows on its row', async () => {
    let now: MikvahPlace = { ...LOWER, findings: [] }
    await renderPage(
      () => [now],
      (body) => {
        if (body.action !== 'check') return {}
        now = LOWER
        return { pages: LOWER.pages, stopped: [] }
      },
    )
    await tab('Checked')
    await open(LOWER.name)
    await userEvent.setup().click(within(mikvah(LOWER.name)).getByRole('button', { name: /^Reads/ }))
    await userEvent.setup().click(within(mikvah(LOWER.name)).getByRole('button', { name: 'Read them now' }))
    expect(posts.at(-1)).toEqual({ url: HOURS, body: { resourceId: 'lmc', action: 'check' } })
    // An update: to To check.
    await waitFor(() => expect(shown(LOWER.name)).toBe(false))
    await tab('To check')
    expect(pill(LOWER.name)).toBe('1 update')
  })

  it('a page not read yet is read as soon as the page loads', async () => {
    const unread = place({ id: 'u', name: 'Unread Mikvah', pages: [{ watch: watch({ id: 'w-u', lastRunAt: null, lastCheck: null }), source: 'Found from its website' }] })
    const read = { watch: watch({ id: 'w-u', lastCheck: check('agrees') }), source: 'Found from its website' }
    let answer: (v: Record<string, unknown>) => void = () => {}
    vi.mocked(fetchJson).mockImplementation(async (url, init) => {
      if (init?.method === 'POST') {
        posts.push({ url: String(url), body: JSON.parse(String(init.body)) })
        return new Promise((done) => (answer = done))
      }
      return { ok: true, available: true, name: 'Mikvah hours', places: [unread] }
    })
    renderWithProviders(<HoursJob token="tok" />, { community: { slug: 'philly' } })
    await screen.findByRole('heading', { name: 'Mikvah hours' })
    await waitFor(() => expect(pill('Unread Mikvah')).toBe('Reading…'))
    expect(posts.map((p) => p.body)).toEqual([{ resourceId: 'u', action: 'check' }])
    answer({ ok: true, pages: [read], stopped: [] })
    await waitFor(() => expect(shown('Unread Mikvah')).toBe(false))
    await tab('Checked')
    expect(pill('Unread Mikvah')).toBe('Same')
  })

  it('reads a place’s pages one request each, in order, saying how far it is', async () => {
    const pageOf = (id: string, c: ReturnType<typeof check> | null = null) => ({ watch: watch({ id, lastRunAt: c ? 'now' : null, lastCheck: c }), source: 'Found from its website' })
    const unread = place({ id: 'u', name: 'Unread Mikvah', pages: [pageOf('w-a'), pageOf('w-b')] })
    const answers: ((v: Record<string, unknown>) => void)[] = []
    vi.mocked(fetchJson).mockImplementation(async (url, init) => {
      if (init?.method === 'POST') {
        posts.push({ url: String(url), body: JSON.parse(String(init.body)) })
        return new Promise((done) => answers.push(done))
      }
      return { ok: true, available: true, name: 'Mikvah hours', places: [unread] }
    })
    renderWithProviders(<HoursJob token="tok" />, { community: { slug: 'philly' } })
    await screen.findByRole('heading', { name: 'Mikvah hours' })
    // The search first, reading nothing: all of Sons of Israel's pages in
    // one request passed the host's 60s (Oct 22).
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].body).toEqual({ resourceId: 'u', action: 'check' })
    answers[0]({ ok: true, pages: unread.pages, stopped: [], read: ['w-a', 'w-b'] })
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1].body).toEqual({ resourceId: 'u', action: 'check', id: 'w-a' })
    expect(pill('Unread Mikvah')).toBe('Reading 1 of 2…')
    // The next only once the one before it is back.
    answers[1]({ ok: true, pages: [pageOf('w-a', check('agrees')), pageOf('w-b')], stopped: [] })
    await waitFor(() => expect(posts).toHaveLength(3))
    expect(posts[2].body).toEqual({ resourceId: 'u', action: 'check', id: 'w-b' })
    await waitFor(() => expect(pill('Unread Mikvah')).toBe('Reading 2 of 2…'))
    answers[2]({ ok: true, pages: [pageOf('w-a', check('agrees')), pageOf('w-b', check('agrees'))], stopped: [] })
    await waitFor(() => expect(shown('Unread Mikvah')).toBe(false))
    await tab('Checked')
    expect(pill('Unread Mikvah')).toBe('Same')
    expect(posts).toHaveLength(3)
  })

  it('reads at most a few on its own, leaving the rate limit for Read them now', async () => {
    const unread = Array.from({ length: READ_ON_LOAD + 2 }, (_, i) => place({ id: `u${i}`, name: `Unread ${i}`, pages: [{ watch: watch({ id: `w-u${i}`, lastRunAt: null, lastCheck: null }), source: 'Found from its website' }] }))
    await renderPage(unread, () => ({ pages: [], stopped: [] }))
    await waitFor(() => expect(posts).toHaveLength(READ_ON_LOAD))
  })

  it('one that can’t be read: why on its row; opened, only Reads, open, its website saying why; a page can be given', async () => {
    await renderPage([NONE])
    expect(pill(NONE.name)).toBe('No hours found')
    await open(NONE.name)
    expect(boxes(NONE.name)).toEqual(['Reads | 1 page | true'])
    expect(within(mikvah(NONE.name)).getByTestId('job-source')).toHaveTextContent('philamikvah.orgno hours')
    const user = userEvent.setup()
    await user.click(within(mikvah(NONE.name)).getByRole('button', { name: 'Add a page' }))
    await user.type(screen.getByPlaceholderText('its-website.org/hours'), 'philamikvah.org/hours')
    await user.click(screen.getByRole('button', { name: 'Save and read' }))
    expect(posts.at(-1)).toEqual({ url: HOURS, body: { resourceId: 'mei', action: 'give', url: 'philamikvah.org/hours' } })
  })

  it('Reading off: its row says Not read, Reads says Off; turned back on, it’s read', async () => {
    await renderPage([SAME, OFF], (body) => (body.action === 'off' ? { pages: SAME.pages.map((x) => ({ ...x, watch: { ...x.watch, active: false } })), off: true } : { pages: [], off: false }))
    await tab('Checked')
    await open(SAME.name)
    const user = userEvent.setup()
    await user.click(within(mikvah(SAME.name)).getByRole('button', { name: /^Reads/ }))
    await user.click(within(mikvah(SAME.name)).getByRole('switch', { name: /Reading/ }))
    expect(posts.at(-1)).toEqual({ url: HOURS, body: { resourceId: 'mz', action: 'off' } })
    expect(shown(SAME.name)).toBe(false)
    await tab('Off')
    expect(pill(SAME.name)).toBe('Not read')
    await open(OFF.name)
    const reads = within(mikvah(OFF.name)).getByRole('region', { name: 'Reads' })
    expect(within(reads).getByTestId('box-pill')).toHaveTextContent('Off')
    expect(within(reads).queryByRole('button', { name: 'Read them now' })).toBeNull()
    await user.click(within(reads).getByRole('switch'))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'ol', action: 'on' })
  })

  it('the last one turned back on leaves Off, and Off stays open, empty', async () => {
    await renderPage([SAME, OFF], () => ({ pages: SAME.pages, off: false }))
    await tab('Off')
    await open(OFF.name)
    await userEvent.setup().click(within(within(mikvah(OFF.name)).getByRole('region', { name: 'Reads' })).getByRole('switch'))
    expect(shown(OFF.name)).toBe(false)
    expect(screen.getByRole('tab', { name: 'Off 0' })).toHaveAttribute('aria-selected', 'true')
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

  // The user, Oct 22: a shul's newsletter is one of its reads, not a watch
  // apart. BZBI's website turns the reader away; its newsletter is read.
  it('a shul read from its newsletter: Same, and the newsletter a line in its Reads', async () => {
    const BZBI = place({
      id: 'bz',
      name: 'Temple Beth Zion-Beth Israel',
      fields: ['Davening Times'],
      website: 'https://bzbi.example/',
      reason: 'Its website wouldn’t open: it turned the reader away (403).',
      times: { key: 'minyanim', minyanim: listing, schedules: [] },
      newsletters: [watch({ id: 'nl', url: 'mailto:communications@bzbi.example', createdBy: 'shul newsletters', lastCheck: null, pageChangedAt: ago(30) })],
    } as Partial<ShulPlace>)
    await times$([BZBI])
    await tab('Checked')
    expect(pill(BZBI.name)).toBe('Same')
    await open(BZBI.name)
    expect(boxes(BZBI.name)).toEqual(['Reads | 1 page · newsletter | true'])
    const lines = within(shul(BZBI.name)).getAllByTestId('job-source').map((l) => l.textContent)
    expect(lines).toEqual([`communications@bzbi.exampleNewsletterread ${day(ago(30))}`, expect.stringMatching(/^bzbi\.example/)])
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

  // A newsletter's times are filed a part at a time too (Oct 22): in its
  // part's box, from its newsletter, which has no page.
  it('a newsletter’s update: in its part’s box, from its newsletter', async () => {
    const fromNewsletter = { ...SHAB, id: 's-news', from: 'its newsletter', page: undefined }
    await times$([{ ...SOI, findings: [fromNewsletter] } as ShulPlace])
    await open(SOI.name)
    const b = box(SOI.name, 'Usual Shabbos times')
    expect(within(b).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Use this', 'Edit', 'Keep the listing'])
    expect(within(b).getByTestId('box-source')).toHaveTextContent(/^From its newsletter · read [A-Z][a-z]{2} \d+$/)
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

  // Rodeph Shalom on dev, Oct 22: its calendar gives only dated times, its
  // update was used, and it said "Same" with nothing under it.
  it('a calendar’s week that’s the same: what it read, “Same as” its page; not once its update was kept', async () => {
    const read = ['Shacharis Thu Oct 22 8:10 AM', 'Kabbalas Shabbos Fri Oct 23 6:00 PM']
    const at = ago(2)
    const rodeph = (status: 'approved' | 'rejected') =>
      place({
        id: 'rs',
        name: 'Rodeph Shalom',
        fields: ['Davening Times'],
        times: { key: 'minyanim', minyanim: listing, schedules: [] },
        decided: { at: ago(1.9), status },
        pages: [timesPage('w-rs', 'https://rs.example/calendar/', { at, from: 'calendar', read, differences: ['New, that day only: shacharis · Thu Oct 22 · 8:10 AM'] })],
      } as Partial<ShulPlace>)
    await times$([rodeph('approved')])
    await tab('Checked')
    await open('Rodeph Shalom')
    expect(boxes('Rodeph Shalom')).toEqual(['This week’s schedule | Same | false', 'Reads | 1 page | false'])
    await userEvent.setup().click(within(shul('Rodeph Shalom')).getByRole('button', { name: /^This week’s schedule/ }))
    const b = box('Rodeph Shalom', 'This week’s schedule')
    expect(marked(b)).toEqual(['same: Shacharis Thu Oct 228:10 AM', 'same: Kabbalas Shabbos Fri Oct 236:00 PM'])
    expect(within(b).getByTestId('box-source')).toHaveTextContent(`Same as rs.example/calendar · read ${day(at)}`)

    cleanup()
    await times$([rodeph('rejected')])
    await tab('Checked')
    await open('Rodeph Shalom')
    expect(boxes('Rodeph Shalom')).toEqual(['Reads | 1 page | true'])
  })

  // Shul times' notes: a shul's phone "would be read from its website too (a
  // Phone box under its times)", when Google doesn't keep it.
  describe('its Phone, from its website', () => {
    const PHONE_BOX = { name: 'Phone', fields: [{ key: 'phone', label: 'Phone', kind: 'phone' as const, value: '(215) 629-1995' }] }
    const NEW_PHONE = finding({ id: 's-phone', targetId: 'soi', name: 'Sons of Israel', page: 'https://soi.example/', section: 'contact', values: { phone: '(215) 555-0100' }, lines: [{ key: 'phone', label: 'Phone', before: '(215) 629-1995', after: '(215) 555-0100', choosable: true }] })

    it('an update: under its times’ updates, above the part that’s the same; Reads names the page for it', async () => {
      const soi = { ...SOI, contact: PHONE_BOX, findings: [WEEK, SHAB, NEW_PHONE], pages: SOI.pages.map((x) => (x.watch.id === 'w-home' ? { ...x, watch: { ...x.watch, lastCheck: { ...x.watch.lastCheck!, contact: { same: [], changes: ['phone'] } } } } : x)) }
      await times$([soi])
      await open(SOI.name)
      expect(boxes(SOI.name)).toEqual(['Usual Shabbos times | 2 new | true', 'This week’s schedule | Oct 21–24 | true', 'Phone | 1 change | true', 'Usual weekday times | Same | false', 'Reads | 4 pages | false'])
      expect(marked(box(SOI.name, 'Phone'))).toEqual(['changed: Phone(215) 555-0100(215) 629-1995'])
      expect(pill(SOI.name)).toBe('3 updates')
      await userEvent.setup().click(within(shul(SOI.name)).getByRole('button', { name: /^Reads/ }))
      expect(within(shul(SOI.name)).getAllByTestId('job-source').map((x) => x.textContent?.replace(/read [A-Z][a-z]{2} \d+/, 'read …'))).toContain('soi.examplePhoneread …')
    })

    it('the same: a closed Phone box after its times, “Same as” its page', async () => {
      const kesher = { ...KESHER, contact: PHONE_BOX, pages: KESHER.pages.map((x) => ({ ...x, watch: { ...x.watch, lastCheck: { ...x.watch.lastCheck!, contact: { same: ['phone'], changes: [] } } } })) }
      await times$([kesher])
      await tab('Checked')
      await open(KESHER.name)
      expect(boxes(KESHER.name).map((b) => b.split(' | ').slice(0, 2).join(' | '))).toContain('Phone | Same')
      expect(boxes(KESHER.name).at(-2)).toBe('Phone | Same | false')
      await userEvent.setup().click(within(shul(KESHER.name)).getByRole('button', { name: /^Phone/ }))
      expect(within(box(KESHER.name, 'Phone')).getByTestId('box-source')).toHaveTextContent(/^Same as kesher\.example · read/)
    })
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
    expect(shown(SOI.name)).toBe(false)
    expect(screen.getByTestId('job-counts')).toHaveTextContent('No shul’s website has an update.')
    await tab('Checked')
    expect(pill(SOI.name)).toBe(`Used ${today()}`)
    await open(SOI.name)
    expect(boxes(SOI.name).slice(0, 2)).toEqual([`Usual Shabbos times | Used ${today()} | false`, `This week’s schedule | Skipped ${today()} | false`])
  })

  it('Keep the listing: kept, and said so', async () => {
    await times$([place({ ...SOI, findings: [SHAB] })])
    await open(SOI.name)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Keep the listing' }))
    expect(posts.at(-1)!.body).toEqual({ status: 'rejected' })
    expect(shown(SOI.name)).toBe(false)
    await tab('Checked')
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
    await waitFor(() => expect(shown(SOI.name)).toBe(false))
    await tab('Checked')
    expect(pill(SOI.name)).toBe(`Used ${today()}`)
    fetchMock.mockRestore()
  })

  // Oct 22: Kol Tzedek's website gave this week and next, and its update
  // had no Edit. Edit opens both weeks, and saves both.
  it('this week’s and next: Edit opens both weeks, saved to the listing together', async () => {
    const next: SpecialSchedule = { ...week, id: 'wk2', name: 'Times for Oct 25 – Oct 31', from: '2026-10-25', to: '2026-10-31', minyanim: [on('x1', 'shacharis', ['2026-10-26'], '7:00am')] }
    const TWO = part('s-two', 'week', CAL, times({ proposedSchedules: [week, next] }))
    const category = makeCategory({ id: 'synagogue', detailFields: [FIELD] })
    const item = makeListing({ id: 'soi', category: 'synagogue', name: 'Sons of Israel', minyanim: listing })
    await times$([place({ ...SOI, findings: [TWO] })])
    const listed = vi.mocked(fetchJson).getMockImplementation()!
    vi.mocked(fetchJson).mockImplementation(async (url, init, fallback) => (String(url).includes('item=soi') ? { ok: true, item, category } : listed(url, init, fallback)))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await open(SOI.name)
    const user = userEvent.setup()
    await user.click(within(box(SOI.name, 'This week’s schedule')).getByRole('button', { name: 'Edit' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getAllByTestId('minyan-box-list').map((l) => l.querySelector('p')!.textContent)).toEqual(['Oct 21–24', 'Oct 25–31'])
    await user.click(within(sheet).getByRole('button', { name: 'Save to the listing' }))
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/admin/submissions/'))!
    expect(String(url)).toBe('/api/admin/submissions/s-two?community=philly')
    expect(JSON.parse(String(init!.body)).payload.details.minyanim_schedules.map((s: SpecialSchedule) => s.id)).toEqual(['wk', 'wk2'])
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
    expect(shown(KESHER.name)).toBe(false)
    await tab('Off')
    expect(pill(KESHER.name)).toBe('Not read')
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
