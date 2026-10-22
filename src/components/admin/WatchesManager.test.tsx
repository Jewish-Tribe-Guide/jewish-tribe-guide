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
  await screen.findByText(/What the guide reads on its own/)
  // The jobs' counts come in after the list's own read.
  await act(() => new Promise((r) => setTimeout(r, 0)))
}

const jobRow = (page: string) => screen.getAllByTestId('job-row').find((r) => r.getAttribute('href') === `/philly/admin/watches/${page}`)!
const names = (el: HTMLElement) => within(el).getAllByTestId('watch-name').map((n) => n.textContent)
const open = (row: HTMLElement) => userEvent.setup().click(within(row).getAllByRole('button')[0])

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.mocked(fetchJson).mockReset()
  vi.unstubAllGlobals()
  forgetWatchesTab()
})

describe('WatchesManager', () => {
  it('says plainly which watch is broken, since when and why', async () => {
    await renderTab([
      watch({ id: 'a', label: 'A page', url: 'https://a.example/' }),
      watch({ id: 'b', label: 'BZBI worship page', failingSince: ago(2), lastError: 'The page answered 403', lastOkAt: ago(3) }),
    ])
    const other = screen.getByRole('region', { name: 'Anything else' })
    expect(within(other).getByText('Working')).toBeInTheDocument()
    expect(within(other).getByText('Not working')).toBeInTheDocument()
    expect(within(other).getByText(/Not working since .*: The page answered 403/)).toBeInTheDocument()
    expect(screen.getByTestId('watch-summary')).toHaveTextContent('2 watches · 1 needs you')
  })

  // The cron itself can stop, and then nothing fails: the last result just
  // sits there looking fine. The tab must not let it.
  it('flags a watch that hasn’t run in days, even though its last run worked', async () => {
    await renderTab([watch({ lastRunAt: ago(4), lastOkAt: ago(4) })])
    expect(screen.getByText(/The daily run may have stopped/)).toBeInTheDocument()
  })

  it('names a row by the place it keeps current, and says when a plain page changed', async () => {
    await renderTab([watch({ resourceId: 'shul-1', url: 'https://lms.org/', pageChangedAt: ago(1) })])
    expect(names(screen.getByRole('region', { name: 'Anything else' }))).toEqual(['Lower Merion Synagogue'])
    expect(screen.getByRole('link', { name: 'lms.org' })).toHaveAttribute('href', 'https://lms.org/')
    expect(screen.getByText(/Changed .*: worth a look/)).toBeInTheDocument()
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
    // Their watches aren't listed below, nor counted; the menu's either
    // (Oct 22: it's on the Dishes page).
    expect(screen.queryByRole('region', { name: 'Hospital contacts' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Menu' })).toBeNull()
    expect(screen.getByTestId('watch-summary')).toHaveTextContent('0 watches')
  })

  // Oct 21: a mikvah's hours pages are on the Mikvah hours page, found from
  // its website on their own, and its "No hours online" with them.
  it('has a Mikvah hours row, and its pages aren’t listed below', async () => {
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
    expect(screen.getByTestId('watch-summary')).toHaveTextContent('1 watches')
    expect(names(screen.getByRole('region', { name: 'Shul’s times' }))).toEqual(['Lower Merion Synagogue'])
    expect(screen.queryByRole('region', { name: 'Hours' })).toBeNull()
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
  it('has a Shul times row, and its pages aren’t listed below', async () => {
    const read = { at: ago(0.1), what: 'times' as const, from: null, result: 'agrees' as const, read: [], differences: [], queue: null }
    const shul = watch({ id: 's', resourceId: 'shul-1', url: 'https://lms.org/', createdBy: 'listing pages (found)', lastCheck: read })
    const stopped = watch({ id: 'x', resourceId: 'shul-1', url: 'https://lms.org/events', createdBy: 'listing pages (stopped)', active: false })
    const other = watch({ id: 'k', url: 'https://keystone-k.org/list' })
    await renderTab([shul, stopped, other], { times: [{ id: 'shul-1', pages: [{ watch: shul }], off: false }] })
    const times = jobRow('times')
    expect(times).toHaveTextContent('Shul times1 shul, from their websites')
    expect(times).toHaveTextContent('1checked0to check0can’t be read')
    expect(screen.getByTestId('watch-summary')).toHaveTextContent('1 watches')
    expect(screen.queryByRole('region', { name: 'Shul’s times' })).toBeNull()
  })

  it('a job whose counts didn’t load still opens', async () => {
    await renderTab([])
    const [dishes] = screen.getAllByTestId('job-row')
    expect(dishes).toHaveTextContent('Couldn’t load its counts.')
    expect(dishes).toHaveAttribute('href', '/philly/admin/watches/dishes')
  })

  // Step 5, Oct 21: Eruv status and Kosher certification are jobs too.
  // Oct 22: its website's hotline and email alerts wait there to be checked.
  it('has an Eruv status row, and an eruv’s website isn’t listed below', async () => {
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
    expect(screen.queryByTestId('watch-row')).toBeNull()
    expect(screen.queryByTestId('eruv-watch-row')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Eruv status' })).toBeNull()
  })

  it('has a Kosher certification row, and the lists aren’t listed below', async () => {
    const keystone = watch({ id: 'k', kind: 'keystone_list', url: 'https://www.keystone-k.org/establishments', label: 'Keystone-K’s list', lastFiled: 3 })
    const mekor = watch({ id: 'm', url: 'https://www.mekorhabracha.org/center-city', label: 'Mekor Habracha’s list', lastFiled: 18, pageHash: null })
    await renderTab([keystone, mekor, watch({ id: 'o', url: 'https://other.example/' })], {
      kosher: { lists: [], places: [{}, {}, {}], newPlaces: [], counts: { checked: 2, toCheck: 1, cantRead: 0, didntLoad: 1, notListed: 0 } },
    })
    const kosher = jobRow('kosher')
    expect(kosher).toHaveTextContent('Kosher certification3 food places, from Keystone-K’s and Mekor Habracha’s lists')
    expect(kosher).toHaveTextContent('2checked1to check0can’t be read1didn’t load today')
    expect(screen.queryByRole('region', { name: 'Kosher list' })).toBeNull()
    expect(screen.getByTestId('watch-summary')).toHaveTextContent('1 watches')
  })

  // Oct 22: a food place's menu watch is on the Dishes page, which says
  // when its page didn't load (watchJobs.ts's menuDidntLoad). An admin's
  // own watch on a menu is still listed.
  it('lists no menu watch the daily run made', async () => {
    await renderTab([
      watch({ id: 'm', url: 'https://judah.example/menu', resourceId: 'shul-1', createdBy: 'menu links', failingSince: ago(1), lastError: '404' }),
      watch({ id: 'a', label: 'Hand-added menu', url: 'https://other.example/menu', createdBy: 'someone@example.org' }),
    ])
    expect(screen.queryByRole('region', { name: 'Menu' })).toBeNull()
    expect(names(screen.getByRole('region', { name: 'Anything else' }))).toEqual(['Hand-added menu'])
    expect(screen.getByTestId('watch-summary')).toHaveTextContent('1 watches · all working')
  })

  // Oct 19: a listing's own page is listed under what it keeps current, by
  // what its listing has.
  it('lists a shul’s own page under its times, and a mikvah’s under hours', async () => {
    await renderTab([
      watch({ id: 's', url: 'https://lms.org/davening', resourceId: 'shul-1', createdBy: 'listing pages', lastFiled: 1, pageChangedAt: ago(1) }),
      watch({ id: 'm', url: 'https://ohelrivkah.org/hours', resourceId: 'mikvah-1', createdBy: 'listing pages' }),
    ])
    const times = screen.getByRole('region', { name: 'Shul’s times' })
    expect(names(times)).toEqual(['Lower Merion Synagogue'])
    expect(times).toHaveTextContent(/Changed .*: 1 suggestion in the queue/)
    expect(names(screen.getByRole('region', { name: 'Hours' }))).toEqual(['Mikvah Ohel Rivkah'])
    await open(within(times).getByTestId('watch-row'))
    expect(screen.getByTestId('listing-page-watch')).toHaveTextContent(/not even the listing’s date/)
  })

  // Oct 20: a page the AI has never read doesn't pass for working, and
  // Check now shows what it read and whether it agrees with the listing.
  it('says a shul’s page the AI has never read is not read yet, not working', async () => {
    await renderTab([watch({ url: 'https://lms.org/davening', resourceId: 'shul-1', createdBy: 'listing pages' })])
    const row = screen.getByTestId('watch-row')
    expect(within(row).getByText('Opens · not read yet')).toBeInTheDocument()
    expect(within(row).queryByText('Working')).toBeNull()
    expect(row).toHaveTextContent(/Not read by the AI yet/)
  })

  it('Check now shows what the AI read, from where, and that it agrees with the listing', async () => {
    const checked = watch({
      id: 's', url: 'https://lms.org/davening', resourceId: 'shul-1', createdBy: 'listing pages',
      lastCheck: { at: ago(0), what: 'times', from: 'calendar', result: 'agrees', read: ['Shacharis Mon–Fri 7:00 AM', 'Mincha Sun–Thu 6:05 PM'], differences: [], queue: null },
    })
    await renderTab([watch({ id: 's', url: 'https://lms.org/davening', resourceId: 'shul-1', createdBy: 'listing pages' })], { post: { watch: checked } })
    const row = screen.getByTestId('watch-row')
    await open(row)
    await userEvent.setup().click(within(row).getByRole('button', { name: 'Check now' }))
    expect(posts.map((p) => p.body)).toEqual([{ action: 'check', id: 's' }])
    const result = await within(row).findByTestId('watch-check')
    expect(result).toHaveTextContent(/What it read from the page and its calendar/)
    expect(result).toHaveTextContent('Shacharis Mon–Fri 7:00 AM')
    expect(result).toHaveTextContent('Agrees with the listing.')
    expect(within(row).getByText('Working')).toBeInTheDocument()
    expect(row).toHaveTextContent(/Read .*: agrees with the listing/)
  })

  it('lists each difference a check found, and says it is in the queue', async () => {
    await renderTab([
      watch({
        url: 'https://lms.org/davening', resourceId: 'shul-1', createdBy: 'listing pages',
        lastCheck: { at: ago(0), what: 'times', from: 'page', result: 'differs', read: ['Shacharis Mon–Fri 6:45 AM'], differences: ['Shacharis Mon–Fri: 7:00 AM → 6:45 AM'], queue: 'filed' },
      }),
    ])
    const row = screen.getByTestId('watch-row')
    expect(row).toHaveTextContent(/Read .*: 1 difference, in the queue/)
    await open(row)
    const result = within(row).getByTestId('watch-check')
    expect(result).toHaveTextContent('Differs from the listing, in the queue:')
    expect(result).toHaveTextContent('Shacharis Mon–Fri: 7:00 AM → 6:45 AM')
  })

  it('says when a check found no times, and when the page would not open', async () => {
    await renderTab([
      watch({ id: 'a', url: 'https://lms.org/davening', resourceId: 'shul-1', createdBy: 'listing pages', lastCheck: { at: ago(0), what: 'times', from: 'page', result: 'nothing', read: [], differences: [], queue: null } }),
      watch({ id: 'b', url: 'https://lms.org/other', resourceId: 'shul-1', createdBy: 'listing pages', lastError: 'The page answered 500', failingSince: ago(0), lastCheck: { at: ago(0), what: 'times', from: null, result: 'unreadable', read: [], differences: [], queue: null } }),
    ])
    const rows = screen.getAllByTestId('watch-row')
    const nothing = rows.find((r) => r.textContent?.includes('Reads nothing'))!
    const broken = rows.find((r) => r.textContent?.includes('Not working'))!
    expect(within(nothing).getByText('Reads nothing')).toBeInTheDocument()
    expect(nothing).toHaveTextContent(/Read .*: found no times on this page/)
    await open(nothing)
    expect(within(nothing).getByTestId('watch-check')).toHaveTextContent('Found no times on this page.')
    await open(broken)
    expect(within(broken).getByTestId('watch-check')).toHaveTextContent('The page wouldn’t open.')
  })

  it('says when it read something it couldn’t compare, never that it agrees', async () => {
    const unread = ['Women’s Hours: opens 7:30 PM, closes 9:30 PM, but which days isn’t said']
    await renderTab([
      watch({
        url: 'http://lmcmikvah.org/', resourceId: 'mikvah-1', createdBy: 'listing pages',
        lastCheck: { at: ago(0), what: 'hours', from: 'page', result: 'unsure', read: ['Women’s Hours, every day: 7:30 PM–9:30 PM'], differences: [], unread, queue: null },
      }),
    ])
    const row = screen.getByTestId('watch-row')
    expect(within(row).getByText('Needs a look')).toBeInTheDocument()
    expect(row).toHaveTextContent(/Read .*: couldn’t compare it with the listing/)
    await open(row)
    const result = within(row).getByTestId('watch-check')
    expect(result).toHaveTextContent('Couldn’t compare with the listing, so nothing was filed for:')
    expect(result).toHaveTextContent(unread[0])
    expect(result).not.toHaveTextContent('Agrees')
  })

  describe('Add a watch', () => {
    it('asks what it keeps current first, then the place and where it’s read, and says what will happen', async () => {
      const created = watch({ id: 'new', url: 'https://lms.org/davening', resourceId: 'shul-1', createdBy: 'listing pages' })
      await renderTab([], { post: { watch: created } })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Add a watch' }))
      const form = screen.getByTestId('add-watch')
      // Nothing else to fill in until it knows what for. Menus are added on
      // their own, so aren't offered.
      expect(within(form).queryByLabelText(/Where does the guide read it/)).toBeNull()
      expect(within(form).queryByRole('button', { name: 'Menu' })).toBeNull()

      await user.click(within(form).getByRole('button', { name: 'Shul’s times' }))
      expect(within(form).getByRole('button', { name: 'Shul’s times' })).toHaveAttribute('aria-pressed', 'true')
      // Only places whose page has davening times are offered.
      expect([...form.querySelectorAll('#watch-add-places option')].map((o) => o.getAttribute('value'))).toEqual(['Lower Merion Synagogue'])
      await user.type(within(form).getByLabelText(/Which place/), 'Lower Merion Synagogue')
      await user.type(within(form).getByLabelText(/Where does the guide read it/), 'lms.org/davening')
      expect(within(form).getByTestId('add-watch-plan')).toHaveTextContent('Every morning the guide reads lms.org/davening, and its calendar if it has one. Times that differ from Lower Merion Synagogue’s wait on the Shul times page, beside what the listing says; a calendar is read a week at a time, and its week goes as this week’s schedule.')
      expect(within(form).getByTestId('add-watch-plan')).toHaveTextContent('the newsletter wins')
      await user.click(within(form).getByRole('button', { name: 'Start watching' }))
      expect(posts).toEqual([{ url: expect.stringContaining('/api/admin/watches'), body: { action: 'add', purpose: 'times', url: 'lms.org/davening', resourceId: 'shul-1' } }])
      expect(names(await screen.findByRole('region', { name: 'Shul’s times' }))).toEqual(['Lower Merion Synagogue'])
      expect(screen.queryByTestId('add-watch')).toBeNull()
    })

    // The user, Oct 20: "one Shul's times choice, website or email".
    it('takes a shul’s times by its newsletter’s address too, and says the newsletter is read as it comes', async () => {
      const created = watch({ id: 'nl', url: 'mailto:office@lms.org', resourceId: 'shul-1', createdBy: 'shul newsletters' })
      await renderTab([], { post: { watch: created } })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Add a watch' }))
      expect(screen.queryByRole('button', { name: /weekly times|usual times/ })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Shul’s times' }))
      await user.type(screen.getByLabelText(/Which place/), 'Lower Merion Synagogue')
      await user.type(screen.getByLabelText(/Where does the guide read it/), 'office@lms.org')
      expect(screen.getByTestId('add-watch-plan')).toHaveTextContent('Each newsletter from office@lms.org is read as it arrives')
      await user.click(screen.getByRole('button', { name: 'Start watching' }))
      expect(posts[0].body).toEqual({ action: 'add', purpose: 'times', url: 'office@lms.org', resourceId: 'shul-1' })
    })

    it('won’t take an email address for hours, which are read off a page', async () => {
      await renderTab([])
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Add a watch' }))
      await user.click(screen.getByRole('button', { name: 'Hours' }))
      await user.type(screen.getByLabelText(/Which place/), 'Mikvah Ohel Rivkah')
      await user.type(screen.getByLabelText(/Where does the guide read it/), 'office@mikvah.org')
      expect(screen.getByText(/Only a shul’s times and an eruv’s status are read from email/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Start watching' })).toBeDisabled()
    })

    // Step 5, Oct 21: each is set on its own job page.
    it('doesn’t offer an eruv’s status or a kosher list, which have pages of their own', async () => {
      await renderTab([], { eruvim: [NE] })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Add a watch' }))
      const form = screen.getByTestId('add-watch')
      expect(within(form).getByRole('button', { name: 'Hours' })).toBeInTheDocument()
      expect(within(form).queryByRole('button', { name: 'Eruv status' })).toBeNull()
      expect(within(form).queryByRole('button', { name: 'Kosher list' })).toBeNull()
    })
  })

  it('says the migration is needed, and that Keystone-K is still read, before 070', async () => {
    await renderTab([], { available: false })
    expect(screen.getByText(/needs database migration 070/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a watch' })).not.toBeInTheDocument()
  })

  // Shul newsletters (newsletter.ts): a sender the inbox hasn't seen comes
  // in unlinked, to be tied to its shul here.
  it('asks which shul a new newsletter sender is, and links it', async () => {
    const sender = watch({ id: 'n', url: 'mailto:info@lms.org', label: 'info@lms.org', createdBy: 'shul newsletters', active: false, lastRunAt: null, lastOkAt: null })
    await renderTab([sender], { post: { watch: { ...sender, resourceId: 'shul-1', active: true } } })
    const row = screen.getByTestId('watch-row')
    expect(within(row).getByText('To link')).toBeInTheDocument()
    expect(within(row).getByText(/Not linked to a shul yet/)).toBeInTheDocument()
    const user = userEvent.setup()
    const link = within(row).getByRole('button', { name: 'Link' })
    expect(link).toBeDisabled()
    await user.type(within(row).getByLabelText('The shul it’s from'), 'Lower Merion Synagogue')
    await user.click(link)
    expect(posts.map((p) => p.body)).toEqual([{ action: 'link', id: 'n', resourceId: 'shul-1' }])
    expect(await within(row).findByText('No newsletter read yet.')).toBeInTheDocument()
    expect(within(row).getByTestId('watch-name')).toHaveTextContent('Lower Merion Synagogue')
  })

  it('says when a linked newsletter last came, and that a quiet month is flagged', async () => {
    await renderTab([watch({ url: 'mailto:info@lms.org', resourceId: 'shul-1', createdBy: 'shul newsletters', lastFiled: 1, pageChangedAt: ago(3) })])
    const row = within(screen.getByRole('region', { name: 'Shul’s times' })).getByTestId('watch-row')
    expect(row).toHaveTextContent(/Newsletter .*: 1 suggestion in the queue/)
    await open(row)
    expect(screen.getByTestId('newsletter-watch')).toHaveTextContent(/emailed if none comes for a month/)
  })

  it('skips a sender that isn’t a shul', async () => {
    const sender = watch({ id: 'n', url: 'mailto:no-reply@accounts.google.com', createdBy: 'shul newsletters', active: false })
    await renderTab([sender], { post: { watch: { ...sender, createdBy: 'shul newsletters: not a shul' } } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Not a shul' }))
    expect(posts.map((p) => p.body)).toEqual([{ action: 'ignore', id: 'n' }])
    expect(await screen.findByText(/Not a shul: its emails are skipped/)).toBeInTheDocument()
  })

  // Oct 18: the list had grown to one long column of menus, hospitals and
  // newsletters. It's grouped, a long group starts closed, and a watch that
  // needs a look shows anyway, named in its group's heading.
  it('groups the watches, and a closed group still shows what’s broken', async () => {
    const menus = ['Bar Bombon', 'Goldie', 'Mama’s', 'Rita’s', 'Zevi’s'].map((name, i) => watch({ id: `m${i}`, label: `${name} menu`, url: `https://m${i}.example/menu` }))
    menus[3] = { ...menus[3], failingSince: ago(1), lastError: 'The page answered 404' }
    await renderTab([watch({ id: 's', url: 'https://lms.org/davening', resourceId: 'shul-1', createdBy: 'listing pages' }), ...menus])
    const [times, menuGroup] = screen.getAllByTestId('watch-group')
    expect(times).toHaveAccessibleName('Shul’s times')
    expect(within(times).getAllByTestId('watch-row')).toHaveLength(1)
    expect(menuGroup).toHaveAccessibleName('Anything else')
    const toggle = within(menuGroup).getByRole('button', { name: /Anything else.*5.*1 not working.*Show all 5/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(names(menuGroup)).toEqual(['Rita’s menu'])
    await userEvent.setup().click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Broken first, then by name.
    expect(names(menuGroup)).toEqual(['Rita’s menu', 'Bar Bombon menu', 'Goldie menu', 'Mama’s menu', 'Zevi’s menu'])
  })

  it('keeps a newsletter sender in view after it’s linked, even in a closed group', async () => {
    const linked = ['a', 'b', 'c', 'd', 'e'].map((x) => watch({ id: x, url: `mailto:${x}@shul.org`, resourceId: 'shul-1', createdBy: 'shul newsletters' }))
    const sender = watch({ id: 'n', url: 'mailto:info@lms.org', label: 'New sender', createdBy: 'shul newsletters', active: false, lastRunAt: null, lastOkAt: null })
    await renderTab([...linked, sender], { post: { watch: { ...sender, resourceId: 'shul-1', active: true } } })
    const group = screen.getByRole('region', { name: 'Shul’s times' })
    expect(within(group).getByRole('button', { name: /6.*1 to link.*Show all 6/ })).toBeInTheDocument()
    const row = within(group).getByTestId('watch-row')
    const user = userEvent.setup()
    await user.type(within(row).getByLabelText('The shul it’s from'), 'Lower Merion Synagogue')
    await user.click(within(row).getByRole('button', { name: 'Link' }))
    expect(await within(row).findByText('No newsletter read yet.')).toBeInTheDocument()
    expect(within(group).getAllByTestId('watch-row')).toEqual([row])
    expect(within(group).queryByText(/to link/)).toBeNull()
  })

  // Oct 22: the tab seemed to reload every visit, waiting on its slowest
  // job before showing anything. The list shows once its own read is back,
  // each job's counts as theirs are.
  it('shows the list without waiting on every job, and says which are still loading', async () => {
    vi.mocked(fetchJson).mockImplementation(async (url) => {
      if (String(url).includes('/api/admin/main-dishes')) return new Promise(() => {})
      if (String(url).includes('/api/admin/watches/')) throw new Error('down')
      return { ok: true, available: true, watches: [watch({ label: 'A page' })], listings: [] }
    })
    renderWithProviders(<WatchesManager token="tok" />, { community: { slug: 'philly' } })
    expect(await screen.findByTestId('watch-summary')).toHaveTextContent('1 watches')
    expect(jobRow('dishes')).toHaveTextContent('Loading…')
    expect(jobRow('hospitals')).toHaveTextContent('Couldn’t load its counts.')
  })

  it('coming back to it shows what it last showed at once, while it reads again', async () => {
    await renderTab([watch({ label: 'A page' })], { dishes: [{ website: 'https://x.example', menuUrl: null, dishes: [], reading: { status: 'approved', readAt: ago(1) } }] })
    cleanup()
    vi.mocked(fetchJson).mockImplementation(() => new Promise(() => {}))
    renderWithProviders(<WatchesManager token="tok" />, { community: { slug: 'philly' } })
    expect(screen.queryByText('Loading watches…')).toBeNull()
    expect(names(screen.getByRole('region', { name: 'Anything else' }))).toEqual(['A page'])
    expect(jobRow('dishes')).toHaveTextContent('1checked')
  })
})
