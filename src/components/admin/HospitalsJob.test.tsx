// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { Watch, WatchCheck } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import HospitalsJob, { type Hospital, type ListedBox } from './HospitalsJob'
import { day } from './JobPage'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/hospitals',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const READ = ago(0.1)
const check = (result: WatchCheck['result'], over: Partial<WatchCheck> = {}): WatchCheck => ({ at: READ, what: 'contacts', from: null, result, read: [], differences: [], queue: null, ...over })
const URL_ = 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5'
const watch = (over: Partial<Watch>): Watch =>
  ({ id: 'w', communityId: 'philly', kind: 'website', url: URL_, active: true, lastRunAt: READ, lastOkAt: READ, lastError: null, failingSince: null, lastCheck: null, ...over }) as Watch
const hospital = (over: Partial<Hospital>): Hospital => ({
  id: 'h',
  name: 'Hospital',
  href: '/philly/hospital/hospital-h',
  watch: null,
  notOnRefuah: false,
  source: 'match',
  line: '',
  refuah: null,
  nearby: [],
  ...over,
})

// HUP as the drawing has it (Oct 21).
const LIAISON = [{ name: 'Bikur Cholim of Philadelphia', who: 'Mrs. Schwartz', phones: ['+1 215-805-8668'] }]
const RIDES = [
  { from: 'Monroe', name: 'Gemach Hatzolah – Monroe', phones: ['+1 845-782-5376'] },
  { from: 'Monsey', name: 'Darchei Chesed', phones: ['+1 845-425-4070'] },
  { from: 'Philadelphia', name: 'Bikur Cholim of Philadelphia', phones: ['+1 215-805-8668'] },
  { from: 'Boro Park', name: 'Chesed of Boro Park', phones: ['+1 718-431-0111'] },
]
const REFUAH_RIDES = [RIDES[0], { ...RIDES[1], phones: ['+1 845-555-0118'] }, RIDES[2], { from: 'Lakewood', name: 'Lakewood rides', phones: ['+1 732-555-0100'] }]
const boxes = (over: Partial<Record<string, unknown>> = {}): ListedBox[] => [
  { title: 'Who to call', keys: ['liaisons'], labels: ['Liaisons'], now: { liaisons: LIAISON } },
  { title: 'Kosher food', keys: ['pantry', 'food_packages'], labels: ['Pantry', 'Food packages'], now: { pantry: [{ name: '1st Floor', phones: ['+1 215-805-8668'] }], food_packages: null } },
  { title: 'A place to stay', keys: ['accommodations'], labels: ['Accommodations'], now: { accommodations: null } },
  { title: 'Rides', keys: ['transportation'], labels: ['Transportation'], now: { transportation: RIDES, ...over } },
]
const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 's-rides',
  operation: 'update',
  targetId: 'hup',
  name: 'Hospital of the University of Pennsylvania',
  from: 'Refuah',
  says: 'Refuah says',
  named: 'Refuah',
  at: READ,
  notes: [],
  lines: [{ key: 'transportation', label: 'Transportation', before: '', after: '', choosable: true }],
  section: 'Rides',
  values: { transportation: REFUAH_RIDES },
  ...over,
})

const HUP = hospital({ id: 'hup', name: 'Hospital of the University of Pennsylvania', boxes: boxes(), findings: [finding()], watch: watch({ id: 'w-hup', lastCheck: check('differs', { queue: 'filed' }) }) })
const JEFF = hospital({ id: 'jeff', name: 'Jefferson', boxes: boxes(), watch: watch({ id: 'w-jeff', lastCheck: check('agrees') }) })
const PA = hospital({ id: 'pa', name: 'Pennsylvania Hospital', boxes: boxes(), watch: watch({ id: 'w-pa', lastCheck: check('nothing') }) })
const SHRINERS = hospital({
  id: 'shriners',
  name: 'Shriners Children’s Philadelphia',
  source: null,
  boxes: boxes(),
  nearby: [{ id: 'jx7a', name: 'Temple University Hospital', street: '3401 N Broad St', url: 'https://refuah.com/hospitals/jx7a', miles: 1.4 }],
})

const posts: { url: string; body: Record<string, unknown> }[] = []
async function renderPage(hospitals: Hospital[], post: (body: Record<string, unknown>) => Record<string, unknown> = () => ({})) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body))
      posts.push({ url: String(url), body })
      return { ok: true, ...post(body) }
    }
    return { ok: true, available: true, refuahError: null, hospitals }
  })
  renderWithProviders(<HospitalsJob token="tok" />, { community: { slug: 'philly' } })
  await screen.findByRole('heading', { name: 'Hospitals' })
}
const rows = () => screen.getAllByTestId('job-row')
const rowOf = (name: string) => rows().find((r) => within(r).queryAllByText(name).length) as HTMLElement
const pill = (name: string) => within(rowOf(name)).getByTestId('job-status').textContent
/** On the tab showing. */
const shown = (name: string) => screen.queryAllByTestId('job-row').some((r) => within(r).queryAllByText(name).length > 0)
const open = (name: string) => userEvent.setup().click(within(rowOf(name)).getAllByRole('button')[0])
const tab = (name: string) => userEvent.setup().click(screen.getByRole('tab', { name: new RegExp(`^${name} \\d+$`) }))
const place = (name: string) => screen.getByRole('region', { name })
const boxList = (name: string) => within(place(name)).getAllByRole('region').map((b) => `${b.getAttribute('aria-label')} | ${within(b).queryByTestId('box-pill')?.textContent ?? ''} | ${within(b).getAllByRole('button')[0].getAttribute('aria-expanded')}`)
const box = (name: string, label: string) => within(place(name)).getByRole('region', { name: label })
const marked = (b: HTMLElement) => within(b).getAllByTestId('box-row').map((r) => `${r.dataset.mark}: ${r.textContent}`)
const today = () => day(new Date().toISOString())

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('Hospitals', () => {
  it('says at the top whether a hospital has an update from Refuah; tabs, each with its count', async () => {
    await renderPage([HUP, JEFF, PA, SHRINERS])
    expect(screen.getByTestId('job-counts').textContent).toBe('1 hospital has an update from Refuah.')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['To check 1', 'Can’t be read 2', 'Checked 1'])
    expect(rows().map((r) => within(r).getByTestId('job-status').textContent)).toEqual(['1 update'])
    await tab('Can’t be read')
    expect(pill(PA.name)).toBe('Nothing on Refuah')
    expect(pill(SHRINERS.name)).toBe('No Refuah page')
    await tab('Checked')
    expect(pill(JEFF.name)).toBe('Same')
    expect(screen.getByRole('link', { name: '‹ Watches' })).toHaveAttribute('href', '/philly/admin/watches')
  })

  it('opened: the box Refuah updates first and open, the ones it agrees with closed, Reads last', async () => {
    await renderPage([HUP])
    await open(HUP.name)
    expect(boxList(HUP.name)).toEqual(['Rides | 3 updates | true', 'Who to call | Same | false', 'Kosher food | Same | false', 'Reads | 1 page | false'])
    // A box with nothing in it, the same either way, isn't shown.
    expect(within(place(HUP.name)).queryByRole('region', { name: 'A place to stay' })).toBeNull()
  })

  it('an update: each person marked, a changed phone beside what it was, one Refuah no longer has crossed out; Use this, Edit, Keep; where it’s from', async () => {
    await renderPage([HUP])
    await open(HUP.name)
    const b = box(HUP.name, 'Rides')
    expect(marked(b)).toEqual([
      'same: Gemach Hatzolah – MonroeFrom Monroe(845) 782-5376',
      'changed: Darchei ChesedFrom Monsey(845) 555-0118was (845) 425-4070',
      'same: Bikur Cholim of PhiladelphiaFrom Philadelphia(215) 805-8668',
      'gone: Not on RefuahChesed of Boro ParkFrom Boro Park(718) 431-0111',
      'new: Lakewood ridesFrom Lakewood(732) 555-0100',
    ])
    expect(within(b).getByText('was (845) 425-4070').tagName).toBe('SPAN')
    expect(within(b).getByText('Chesed of Boro Park')).toHaveClass('line-through')
    expect(within(b).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Use this', 'Edit', 'Keep the listing'])
    expect(within(b).getByTestId('box-source').textContent).toBe(`From Refuah · read ${day(READ)}`)
    expect(within(b).getByRole('link', { name: 'Refuah' })).toHaveAttribute('href', URL_)
  })

  it('Use this approves the box; Keep the listing rejects it; either says so where it was', async () => {
    await renderPage([HUP, { ...HUP, id: 'two', name: 'Two', findings: [finding({ id: 's-two', targetId: 'two' })] }])
    const user = userEvent.setup()
    await open(HUP.name)
    await user.click(within(box(HUP.name, 'Rides')).getByRole('button', { name: 'Use this' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-rides?community=philly', body: { status: 'approved' } })
    // Nothing left to decide: straight to Checked (the user, Oct 22).
    expect(shown(HUP.name)).toBe(false)
    await open('Two')
    await user.click(within(box('Two', 'Rides')).getByRole('button', { name: 'Keep the listing' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-two?community=philly', body: { status: 'rejected' } })
    expect(shown('Two')).toBe(false)
    await tab('Checked')
    expect(pill(HUP.name)).toBe(`Used ${today()}`)
    expect(pill('Two')).toBe(`Kept ${today()}`)
    await open(HUP.name)
    expect(within(box(HUP.name, 'Rides')).getByTestId('box-pill').textContent).toBe(`Used ${today()}`)
  })

  // Board 4: the listing's own Edit for the box, the one visitors use, a
  // row a person and Add a person.
  it('Edit: the box’s own editor, a row a person, filled with Refuah’s, saving that box only', async () => {
    const category = makeCategory({
      id: 'hospital',
      detailFields: [
        { key: 'liaisons', label: 'Liaisons', type: 'contacts' },
        { key: 'transportation', label: 'Transportation', type: 'contacts', entryFrom: true },
      ],
      listingParts: { boxes: [{ title: 'Who to call', fields: ['liaisons'] }, { title: 'Rides', fields: ['transportation'] }] },
    })
    const item = makeListing({ id: 'hup', category: 'hospital', name: HUP.name, liaisons: LIAISON, transportation: RIDES } as never)
    await renderPage([HUP])
    const listed = vi.mocked(fetchJson).getMockImplementation()!
    vi.mocked(fetchJson).mockImplementation(async (url, init, fallback) => (String(url).includes('item=hup') ? { ok: true, item, category } : listed(url, init, fallback)))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await open(HUP.name)
    const user = userEvent.setup()
    await user.click(within(box(HUP.name, 'Rides')).getByRole('button', { name: 'Edit' }))
    expect(vi.mocked(fetchJson).mock.calls.map(([u]) => u)).toContain('/api/admin/watches/hospitals?item=hup&community=philly')
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText('Lakewood rides')).toBeInTheDocument()
    expect(within(sheet).queryByText('Chesed of Boro Park')).toBeNull()
    expect(within(sheet).getByRole('button', { name: /Add a person/ })).toBeInTheDocument()
    expect(within(sheet).queryByText('Bikur Cholim of Philadelphia', { selector: 'input' })).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Save to the listing' }))
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/admin/submissions/'))!
    expect(String(url)).toBe('/api/admin/submissions/s-rides?community=philly')
    const sent = JSON.parse(String(init!.body))
    expect(sent.status).toBe('approved')
    expect(Object.keys(sent.payload.details)).toEqual(['transportation'])
    expect(sent.payload.details.transportation.map((e: { name: string }) => e.name)).toEqual(['Gemach Hatzolah – Monroe', 'Darchei Chesed', 'Bikur Cholim of Philadelphia', 'Lakewood rides'])
    await waitFor(() => expect(shown(HUP.name)).toBe(false))
    await tab('Checked')
    expect(pill(HUP.name)).toBe(`Used ${today()}`)
  })

  it('a Same box shows what the listing has, and that Refuah agrees', async () => {
    await renderPage([JEFF])
    await open(JEFF.name)
    expect(boxList(JEFF.name)).toEqual(['Who to call | Same | false', 'Kosher food | Same | false', 'Rides | Same | false', 'Reads | 1 page | false'])
    const b = box(JEFF.name, 'Kosher food')
    await userEvent.setup().click(within(b).getAllByRole('button')[0])
    // A box of two lists heads each that has anything.
    expect(within(b).getByText('Pantry')).toBeInTheDocument()
    expect(within(b).queryByText('Food packages')).toBeNull()
    expect(within(b).getByTestId('box-source').textContent).toBe(`Same as Refuah · read ${day(READ)}`)
  })

  it('a finding from before the boxes still shows, with Compare', async () => {
    const legacy = finding({ id: 's-old', section: undefined, values: undefined, lines: [{ key: 'liaisons', label: 'Liaisons', before: 'Bikur Cholim: 215-555-0111', after: 'Bikur Cholim: 215-555-0100', choosable: true }] })
    await renderPage([{ ...HUP, findings: [legacy] }])
    await open(HUP.name)
    expect(boxList(HUP.name)[0]).toBe('From Refuah | 1 update | true')
    expect(within(box(HUP.name, 'From Refuah')).getByRole('button', { name: 'Compare' })).toBeInTheDocument()
  })

  it('Reads: its Refuah link, read for every box, with a × to stop reading it; Read them now', async () => {
    await renderPage([JEFF], (body) => (body.action === 'stop' ? { watch: null, notOnRefuah: false } : {}))
    await open(JEFF.name)
    const reads = within(place(JEFF.name)).getByTestId('job-reads')
    const user = userEvent.setup()
    await user.click(within(reads).getAllByRole('button')[0])
    expect(within(reads).getByTestId('job-source').textContent).toBe(`refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5Refuah link · every boxread ${day(READ)}`)
    await user.click(within(reads).getByRole('button', { name: 'Read them now' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches?community=philly', body: { resourceId: 'jeff', action: 'check', id: 'w-jeff' } })
    await user.click(within(reads).getByRole('button', { name: 'Stop reading refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/hospitals?community=philly', body: { resourceId: 'jeff', action: 'stop' } })
    // Nothing read now: to Can’t be read.
    expect(shown(JEFF.name)).toBe(false)
    await tab('Can’t be read')
    await open(JEFF.name)
    expect(within(within(place(JEFF.name)).getByTestId('job-reads')).getByRole('button', { name: 'Not on Refuah' })).toBeInTheDocument()
  })

  it('nothing on Refuah: Reads open, saying so, with Add a page · Read them now · Not on Refuah · Open its listing', async () => {
    await renderPage([PA])
    await open(PA.name)
    const reads = within(place(PA.name)).getByTestId('job-reads')
    expect(within(reads).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'true')
    expect(within(reads).getByTestId('job-source').textContent).toContain('Refuah linknothing on it')
    expect(within(reads).getAllByRole('button').slice(2).map((x) => x.textContent).concat(within(reads).getAllByRole('link').slice(1).map((x) => x.textContent))).toEqual(['Add a page', 'Read them now', 'Not on Refuah', 'Open its listing'])
    await userEvent.setup().click(within(reads).getByRole('button', { name: 'Not on Refuah' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'pa', action: 'none' })
  })

  it('no Refuah page: Add a page offers Refuah’s hospitals near it, or its address', async () => {
    await renderPage([SHRINERS])
    await open(SHRINERS.name)
    const reads = within(place(SHRINERS.name)).getByTestId('job-reads')
    expect(within(reads).getByTestId('box-pill').textContent).toBe('No page')
    expect(within(reads).queryByRole('button', { name: 'Read them now' })).toBeNull()
    const user = userEvent.setup()
    await user.click(within(reads).getByRole('button', { name: 'Add a page' }))
    await user.click(within(reads).getByRole('button', { name: /Temple University Hospital, 3401 N Broad St/ }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/hospitals?community=philly', body: { resourceId: 'shriners', action: 'choose', url: 'https://refuah.com/hospitals/jx7a' } })
  })

  it('off: not read, the switch turns it back on', async () => {
    await renderPage([hospital({ id: 'x', name: 'Off Hospital', boxes: boxes(), watch: watch({ active: false }) }), hospital({ id: 'y', name: 'Not Listed', boxes: boxes(), notOnRefuah: true })])
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toContain('Off 2')
    expect(pill('Off Hospital')).toBe('Not read')
    expect(pill('Not Listed')).toBe('Not on Refuah')
    await open('Not Listed')
    await userEvent.setup().click(within(place('Not Listed')).getByRole('switch'))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'y', action: 'on' })
  })
})
