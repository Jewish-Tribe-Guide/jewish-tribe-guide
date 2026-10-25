// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { Watch } from '@/lib/watches'
import type { AdminEruv } from '@/lib/eruvStore'
import WatchesManager, { forgetWatchesTab } from './WatchesManager'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
// Step 6: what's read for a shul waits on the Shul times page; a place no
// job reads, in the moderation queue.
const SHUL = { id: 'shul-1', name: 'Lower Merion Synagogue', categoryLabel: 'Synagogue', reads: 'times', job: 'Shul times' }
const MIKVAH = { id: 'mikvah-1', name: 'Mikvah Ohel Rivkah', categoryLabel: 'Mikvah', reads: 'hours' }

function watch(over: Partial<Watch>): Watch {
  return {
    id: 'w',
    communityId: 'philly',
    kind: 'website',
    url: 'https://example.org/',
    resourceId: null,
    label: null,
    active: true,
    createdAt: ago(10),
    createdBy: null,
    lastRunAt: ago(0.1),
    lastOkAt: ago(0.1),
    lastError: null,
    failingSince: null,
    lastFiled: null,
    pageHash: 'h',
    pageChangedAt: null,
    lastCheck: null,
    ...over,
  }
}

const NE: AdminEruv = {
  id: 'northeast', name: 'Northeast Eruv', covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false,
  status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null,
  lineUrl: null, sortOrder: 1, active: true, rawLine: null, lineReadAt: null, lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null,
  statusEmail: null, statusEmailKept: null,
}

type Post = { url: string; body: Record<string, unknown> }
const posts: Post[] = []

async function renderTab(
  watches: Watch[],
  {
    available = true,
    post = {} as Record<string, unknown>,
    eruvim = null as AdminEruv[] | null,
    kosher = null as Record<string, unknown> | null,
    dishes = null as unknown[] | null,
    hospitals = null as unknown[] | null,
    hours = null as unknown[] | null,
    times = null as unknown[] | null,
    google = null as Record<string, unknown> | null,
    runs = null as Record<string, unknown> | null,
    categories = null as unknown[] | null,
  } = {},
) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posts.push({ url: String(url), body })
      return { ok: true, ...post }
    }
    if (String(url).includes('/api/admin/watches/eruv')) {
      if (!eruvim) throw new Error('down')
      return { ok: true, available: true, timezone: 'America/New_York', eruvim, findings: [], watches: [] }
    }
    if (String(url).includes('/api/admin/watches/runs')) {
      if (!runs) throw new Error('down')
      return { ok: true, ...runs }
    }
    // Its places, to put with the others by kind of place: Google is
    // asked nothing for them (googleJobRun.ts).
    if (String(url).includes('/api/admin/watches/google')) {
      if (!google) throw new Error('down')
      return { ok: true, ...google }
    }
    if (String(url).includes('/api/admin/categories')) {
      if (!categories) throw new Error('down')
      return { ok: true, categories }
    }
    if (String(url).includes('/api/admin/watches/kosher')) {
      if (!kosher) throw new Error('down')
      return { ok: true, ...kosher }
    }
    if (String(url).includes('/api/admin/main-dishes')) {
      if (!dishes) throw new Error('down')
      return { ok: true, places: dishes }
    }
    // Counts only: the tab never asks Refuah.
    if (String(url).includes('/api/admin/watches/hospitals?counts')) {
      if (!hospitals) throw new Error('down')
      return { ok: true, hospitals }
    }
    // Counts only: the tab never waits on a website search.
    if (String(url).includes('/api/admin/watches/hours?counts&job=times')) {
      if (!times) throw new Error('down')
      return { ok: true, name: 'Shul times', places: times }
    }
    if (String(url).includes('/api/admin/watches/hours?counts')) {
      if (!hours) throw new Error('down')
      return { ok: true, name: 'Mikvah hours', places: hours }
    }
    return { ok: true, available, watches, listings: [SHUL, MIKVAH] }
  })
  renderWithProviders(<WatchesManager token="tok" />, { community: { slug: 'philly' } })
  await screen.findAllByTestId('job-row')
  // The jobs' counts come in after the tab's own read.
  await act(() => new Promise((r) => setTimeout(r, 0)))
}

const jobRow = (page: string) => screen.getAllByTestId('job-row').find((r) => r.getAttribute('href') === `/philly/admin/watches/${page}`)!

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.mocked(fetchJson).mockReset()
  vi.unstubAllGlobals()
  forgetWatchesTab()
})

describe('WatchesManager', () => {
  // Oct 24 (FinalMain): a row per kind of place, in the site's order, with
  // how many wait for you, aren't checked and are up to date; then the
  // kinds nothing reads.
  it('starts with a row per kind of place, each opening its page', async () => {
    const field = (kind: string) => ({ field: 'name', label: 'Name', value: 'x', by: { kind } })
    const place = (id: string, category: string, over = {}) => ({
      id, name: id, street: null, address: null, category, categoryLabel: category, href: `/philly/${category}/${id}`,
      matched: true, section: 'checked', fields: [field('google')], readAt: ago(0.5), failedAt: null, notOnGoogle: null, closure: null, compare: null, ...over,
    })
    await renderTab([], {
      categories: [
        { id: 'restaurant', pluralLabel: 'Food', kind: 'listing', hasAddress: true },
        { id: 'mikvah', pluralLabel: 'Mikvah', kind: 'listing', hasAddress: true },
        { id: 'whatsapp', pluralLabel: 'WhatsApp Groups', kind: 'listing', hasAddress: false },
        { id: 'young-professional', pluralLabel: 'Networking', kind: 'listing', hasAddress: false },
      ],
      google: {
        counts: { checked: 2, toCheck: 1, cantRead: 0, didntLoad: 0 },
        places: [place('a', 'restaurant'), place('b', 'restaurant', { section: 'to_check', fields: [field('nothing')] }), place('mikvah-1', 'mikvah')],
      },
      hours: [{ id: 'mikvah-1', name: 'Mikvah Ohel Rivkah', href: '', website: null, pages: [{ watch: watch({ lastCheck: null }), source: '' }], off: false, offSince: null, reason: null, findings: [{ id: 'f' }], fields: [] }],
      times: [],
    })
    const rows = screen.getAllByTestId('kind-row')
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/philly/admin/watches/kind/restaurant', '/philly/admin/watches/kind/mikvah'])
    expect(rows[0]).toHaveTextContent('FoodGoogle0waiting for you1not checked1up to date')
    expect(rows[1]).toHaveTextContent('MikvahGoogle · their websites1waiting for you0not checked0up to date')
    expect(screen.getByRole('region', { name: 'What the watches keep current' })).toHaveTextContent('Not watched: WhatsApp Groups · Networking')
  })

  // Oct 21: a row per job, each opening its page. Hospitals are matched to
  // Refuah on their own and listed on their page, not here.
  it('starts with a row per job, with its counts, each opening its page', async () => {
    const refuah = watch({ id: 'r', url: 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5', resourceId: 'h1', lastCheck: { at: ago(0.1), what: 'contacts', from: null, result: 'agrees', read: [], differences: [], queue: null } })
    const empty = watch({ id: 'e', url: 'https://refuah.com/hospitals/jx75q42dv17pxq7zckc9sx31v589mzem', resourceId: 'h2', lastCheck: { at: ago(0.1), what: 'contacts', from: null, result: 'nothing', read: [], differences: [], queue: null } })
    const brokenMenu = watch({ id: 'm', url: 'https://judah.example/menu', resourceId: 'f1', createdBy: 'menu links', failingSince: ago(1), lastError: 'The page answered 404' })
    const place = (status: string | null) => ({ website: 'https://x.example', menuUrl: null, dishes: [], reading: status && { status, readAt: ago(1) } })
    await renderTab([refuah, empty, brokenMenu], {
      // A reading proposes a change only when its menu has one (dishProposal).
      dishes: [{ ...place('approved'), menuWatch: brokenMenu }, place('approved'), { ...place('proposed'), reading: { status: 'proposed', readAt: ago(1), dishes: [{ name: 'Falafel', quote: 'Falafel', checked: true }] } }, place('failed'), place(null)],
      hospitals: [
        { id: 'h1', watch: refuah, notOnRefuah: false },
        { id: 'h2', watch: empty, notOnRefuah: false },
        { id: 'h3', watch: null, notOnRefuah: false },
      ],
    })
    const [dishes, hospitals] = screen.getAllByTestId('job-row')
    expect(dishes).toHaveAttribute('href', '/philly/admin/watches/dishes')
    expect(dishes).toHaveTextContent('5 food places, from their menus')
    expect(dishes).toHaveTextContent('1checked2to check1can’t be read1didn’t load today')
    expect(hospitals).toHaveAttribute('href', '/philly/admin/watches/hospitals')
    expect(hospitals).toHaveTextContent('3 hospitals, from Refuah · 1 with nothing there yet')
    expect(hospitals).toHaveTextContent('1checked0to check1can’t be read0didn’t load today')
  })

  // Oct 21: a mikvah's hours pages are on the Mikvah hours page, found from
  // its website on their own, and its "No hours online" with them.
  it('has a Mikvah hours row', async () => {
    const read = { at: ago(0.1), what: 'hours' as const, from: null, result: 'agrees' as const, read: [], differences: [], queue: null }
    const home = watch({ id: 'h', url: 'https://lmcmikvah.org/', resourceId: 'mikvah-1', createdBy: 'listing pages (found)', lastCheck: read })
    const given = watch({ id: 'g', url: 'https://lmcmikvah.org/keilim/', resourceId: 'mikvah-1', createdBy: 'listing pages', lastCheck: read })
    const off = watch({ id: 'o', url: 'https://guide.invalid/hours-off/m2', resourceId: 'm2', createdBy: 'hours off', active: false })
    const shul = watch({ id: 's', resourceId: 'shul-1', url: 'https://lms.org/', createdBy: 'listing pages' })
    await renderTab([home, given, off, shul], {
      hours: [
        { id: 'mikvah-1', pages: [{ watch: home }, { watch: given }], off: false },
        { id: 'm2', pages: [], off: true },
        { id: 'm3', pages: [], off: false },
      ],
    })
    const hours = jobRow('hours')
    expect(hours).toHaveTextContent('Mikvah hours3 places, from their websites')
    expect(hours).toHaveTextContent('1checked0to check1can’t be read0didn’t load today')
  })

  // Step 6: a job row counts a place as its page does. A difference decided
  // on the job page is checked; one with a finding waiting there is to check.
  it('a job row counts what waits on its page as to check, and what was decided there as checked', async () => {
    const differs = { at: ago(0.1), what: 'hours' as const, from: null, result: 'differs' as const, read: [], differences: ['Women’s Hours differ'], queue: 'before' as const }
    const a = watch({ id: 'a', url: 'https://a.example/', resourceId: 'm1', createdBy: 'listing pages (found)', lastCheck: differs })
    const b = watch({ id: 'b', url: 'https://b.example/', resourceId: 'm2', createdBy: 'listing pages (found)', lastCheck: { ...differs, queue: 'filed' as const } })
    const r = watch({ id: 'r', url: 'https://refuah.com/hospitals/x', resourceId: 'h1', lastCheck: { ...differs, what: 'contacts' as const, queue: 'filed' as const } })
    await renderTab([a, b, r], {
      hours: [
        { id: 'm1', pages: [{ watch: a }], off: false, findings: [] },
        { id: 'm2', pages: [{ watch: b }], off: false, findings: [{ id: 's-m2' }] },
      ],
      hospitals: [{ id: 'h1', watch: r, notOnRefuah: false, findings: [] }],
    })
    expect(jobRow('hours')).toHaveTextContent('1checked1to check')
    expect(jobRow('hospitals')).toHaveTextContent('1checked0to check')
  })

  // Oct 21: a shul's pages are on the Shul times page, and one an admin
  // stopped is listed nowhere but there.
  it('has a Shul times row', async () => {
    const read = { at: ago(0.1), what: 'times' as const, from: null, result: 'agrees' as const, read: [], differences: [], queue: null }
    const shul = watch({ id: 's', resourceId: 'shul-1', url: 'https://lms.org/', createdBy: 'listing pages (found)', lastCheck: read })
    const stopped = watch({ id: 'x', resourceId: 'shul-1', url: 'https://lms.org/events', createdBy: 'listing pages (stopped)', active: false })
    const other = watch({ id: 'k', url: 'https://keystone-k.org/list' })
    await renderTab([shul, stopped, other], { times: [{ id: 'shul-1', pages: [{ watch: shul }], off: false }] })
    const times = jobRow('times')
    expect(times).toHaveTextContent('Shul times1 shul, from their websites')
    expect(times).toHaveTextContent('1checked0to check0can’t be read')
  })

  it('a job whose counts didn’t load still opens', async () => {
    await renderTab([])
    const [dishes] = screen.getAllByTestId('job-row')
    expect(dishes).toHaveTextContent('Couldn’t load its counts.')
    expect(dishes).toHaveAttribute('href', '/philly/admin/watches/dishes')
  })

  // Step 5, Oct 21: Eruv status and Kosher certification are jobs too.
  // Oct 22: its website's hotline and email alerts wait there to be checked.
  it('has an Eruv status row', async () => {
    const site = watch({ id: 'ws', url: 'https://ne-eruv.org/', label: 'Northeast Eruv’s website', createdBy: 'eruv website' })
    await renderTab([site], {
      eruvim: [
        { ...NE, statusUrl: 'https://ne-eruv.org/status', statusCheckedAt: ago(0.1) },
        { ...NE, id: 'cc', name: 'Center City Eruv' },
      ],
    })
    const eruv = jobRow('eruv')
    expect(eruv).toHaveTextContent('Eruv status2 eruvim. Status goes live on its own; its website’s hotline and email alerts wait here')
    expect(eruv).toHaveTextContent('1checked0to check1can’t be read0didn’t load today')
  })

  it('has a Kosher certification row', async () => {
    const keystone = watch({ id: 'k', kind: 'keystone_list', url: 'https://www.keystone-k.org/establishments', label: 'Keystone-K’s list', lastFiled: 3 })
    const mekor = watch({ id: 'm', url: 'https://www.mekorhabracha.org/center-city', label: 'Mekor Habracha’s list', lastFiled: 18, pageHash: null })
    await renderTab([keystone, mekor, watch({ id: 'o', url: 'https://other.example/' })], {
      kosher: { lists: [], places: [{}, {}, {}], newPlaces: [], counts: { checked: 2, toCheck: 1, cantRead: 0, didntLoad: 1, notListed: 0 } },
    })
    const kosher = jobRow('kosher')
    expect(kosher).toHaveTextContent('Kosher certification3 food places, from Keystone-K’s and Mekor Habracha’s lists')
    expect(kosher).toHaveTextContent('2checked1to check0can’t be read1didn’t load today')
  })

  // Oct 22: Google loads no pages, so it has no "didn't load"; the slot is
  // held so its counts line up with the rows above.
  it('has a Google row, its counts in line with the others', async () => {
    await renderTab([], { google: { counts: { checked: 122, toCheck: 18, cantRead: 1, didntLoad: 0 }, places: Array.from({ length: 141 }, (_, i) => ({ id: `p${i}` })) } })
    const google = jobRow('google')
    expect(google).toHaveTextContent('Google141 listings, from Google Maps')
    expect(google).toHaveTextContent('122checked18to check1can’t be read')
    expect(within(google).getByText('didn’t load today').closest('[aria-hidden="true"]')).toHaveClass('invisible')
  })

  it('coming back to it shows what it last showed at once, while it reads again', async () => {
    await renderTab([watch({ label: 'A page' })], { dishes: [{ website: 'https://x.example', menuUrl: null, dishes: [], reading: { status: 'approved', readAt: ago(1) } }] })
    cleanup()
    vi.mocked(fetchJson).mockImplementation(() => new Promise(() => {}))
    renderWithProviders(<WatchesManager token="tok" />, { community: { slug: 'philly' } })
    expect(jobRow('dishes')).toHaveTextContent('1checked')
  })

  // Oct 25 (the user): What's tracked took the list of watches' place.
  it('has What’s tracked, and no list of watches or Add a watch', async () => {
    const kinds = [{ id: 'eruvs', name: 'Eruvs', about: '', when: '3:00 AM', count: '1 of 5 read', trouble: '4 never read', misses: [], tracked: [], nights: [] }]
    await renderTab([watch({ label: 'A page' })], { runs: { available: true, kinds } })
    expect(screen.getByRole('region', { name: 'What’s tracked' })).toHaveTextContent('Eruvs need a look')
    expect(screen.queryByTestId('watch-row')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add a watch' })).toBeNull()
  })

  it('says so when what’s tracked couldn’t be loaded, and shows the rest', async () => {
    await renderTab([])
    expect(screen.getByRole('region', { name: 'What’s tracked' })).toHaveTextContent('Couldn’t load what’s tracked')
    expect(screen.getAllByTestId('job-row').length).toBeGreaterThan(0)
  })

  // Shul newsletters (newsletter.ts): a sender the inbox hasn't seen comes
  // in unlinked, to be tied to its shul, now from the Newsletters line.
  it('links a new newsletter sender to its shul from Newsletters', async () => {
    const kinds = [
      {
        id: 'newsletters', name: 'Newsletters', about: 'Reads each shul’s newsletter as it comes in.', when: null, count: '1 newsletter', trouble: '1 to link',
        misses: [{ name: 'info@lms.org', why: 'Not linked to a shul', page: '', link: 'n' }], tracked: [{ name: 'info@lms.org', status: 'Not linked to a shul', bad: true, page: '' }], nights: [],
      },
    ]
    await renderTab([], { runs: { available: true, kinds } })
    const user = userEvent.setup()
    const tracked = screen.getByRole('region', { name: 'What’s tracked' })
    await user.click(within(tracked).getByRole('button', { name: /What’s tracked/ }))
    await user.click(within(tracked).getByRole('button', { name: /Newsletters/ }))
    const needs = within(tracked).getByRole('list', { name: 'Newsletters: needs a look' })
    const link = within(needs).getByRole('button', { name: 'Link' })
    expect(link).toBeDisabled()
    await user.type(within(needs).getByLabelText('The shul it’s from'), 'Lower Merion Synagogue')
    const reads = vi.mocked(fetchJson).mock.calls.filter(([u]) => String(u).includes('/api/admin/watches/runs')).length
    await user.click(link)
    expect(posts.map((p) => p.body)).toEqual([{ action: 'link', id: 'n', resourceId: 'shul-1' }])
    // Read again, so the line says it's linked.
    expect(vi.mocked(fetchJson).mock.calls.filter(([u]) => String(u).includes('/api/admin/watches/runs')).length).toBeGreaterThan(reads)
  })

  it('a sender that isn’t a shul is skipped from there too', async () => {
    const kinds = [{ id: 'newsletters', name: 'Newsletters', about: '', when: null, count: '1 newsletter', trouble: '1 to link', misses: [{ name: 'x@y.org', why: 'Not linked to a shul', page: '', link: 'n' }], tracked: [], nights: [] }]
    await renderTab([], { runs: { available: true, kinds } })
    const user = userEvent.setup()
    const tracked = screen.getByRole('region', { name: 'What’s tracked' })
    await user.click(within(tracked).getByRole('button', { name: /What’s tracked/ }))
    await user.click(within(tracked).getByRole('button', { name: /Newsletters/ }))
    await user.click(within(tracked).getByRole('button', { name: 'Not a shul' }))
    expect(posts.map((p) => p.body)).toEqual([{ action: 'ignore', id: 'n' }])
  })
})
