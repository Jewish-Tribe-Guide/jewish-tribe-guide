// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { Watch } from '@/lib/watches'
import type { AdminEruv } from '@/lib/eruvStore'
import WatchesManager from './WatchesManager'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const SHUL = { id: 'shul-1', name: 'Lower Merion Synagogue', categoryLabel: 'Synagogue', reads: 'times' }
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
  { available = true, post = {} as Record<string, unknown>, eruvim = [] as AdminEruv[], dishes = null as unknown[] | null, hospitals = null as unknown[] | null } = {},
) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posts.push({ url: String(url), body })
      if (String(url).includes('/api/admin/eruvim')) {
        const eruv = eruvim.find((e) => e.id === body.id)!
        return { ok: true, eruv: { ...eruv, ...(body.edit ?? {}) } }
      }
      return { ok: true, ...post }
    }
    if (String(url).includes('/api/admin/eruvim')) return { ok: true, available: true, timezone: 'America/New_York', eruvim }
    if (String(url).includes('/api/admin/main-dishes')) {
      if (!dishes) throw new Error('down')
      return { ok: true, places: dishes }
    }
    if (String(url).includes('/api/admin/watches/hospitals')) {
      if (!hospitals) throw new Error('down')
      return { ok: true, hospitals }
    }
    return { ok: true, available, watches, listings: [SHUL, MIKVAH] }
  })
  renderWithProviders(<WatchesManager token="tok" />, { community: { slug: 'philly' } })
  await screen.findByText(/What the guide reads on its own/)
}

const names = (el: HTMLElement) => within(el).getAllByTestId('watch-name').map((n) => n.textContent)
const open = (row: HTMLElement) => userEvent.setup().click(within(row).getAllByRole('button')[0])

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.mocked(fetchJson).mockReset()
  vi.unstubAllGlobals()
})

describe('WatchesManager', () => {
  it('says plainly which watch is broken, since when and why', async () => {
    await renderTab([
      watch({ id: 'k', kind: 'keystone_list', url: 'https://www.keystone-k.org/establishments', label: 'Keystone-K’s list', lastFiled: 3 }),
      watch({ id: 'b', label: 'BZBI worship page', failingSince: ago(2), lastError: 'The page answered 403', lastOkAt: ago(3) }),
    ])
    const keystone = screen.getByRole('region', { name: 'Kosher list' })
    expect(within(keystone).getByText('Working')).toBeInTheDocument()
    expect(within(keystone).getByText(/Read .*: 3 suggestions in the queue/)).toBeInTheDocument()
    const other = screen.getByRole('region', { name: 'Anything else' })
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
      dishes: [place('approved'), place('approved'), place('proposed'), place('failed'), place(null)],
      hospitals: [
        { id: 'h1', watch: refuah, notOnRefuah: false },
        { id: 'h2', watch: empty, notOnRefuah: false },
        { id: 'h3', watch: null, notOnRefuah: false },
      ],
    })
    const [dishes, hospitals] = screen.getAllByTestId('job-row')
    expect(dishes).toHaveAttribute('href', '/philly/admin/watches/dishes')
    expect(dishes).toHaveTextContent('5 food places, from their menus')
    expect(dishes).toHaveTextContent('2checked1to check1can’t be read1didn’t load today')
    expect(hospitals).toHaveAttribute('href', '/philly/admin/watches/hospitals')
    expect(hospitals).toHaveTextContent('3 hospitals, from Refuah · 1 with nothing there yet')
    expect(hospitals).toHaveTextContent('1checked0to check1can’t be read0didn’t load today')
    // Their watches aren't listed below, nor counted.
    expect(screen.queryByRole('region', { name: 'Hospital contacts' })).toBeNull()
    expect(screen.getByTestId('watch-summary')).toHaveTextContent('1 watches')
  })

  it('a job whose counts didn’t load still opens', async () => {
    await renderTab([])
    const [dishes] = screen.getAllByTestId('job-row')
    expect(dishes).toHaveTextContent('Couldn’t load its counts.')
    expect(dishes).toHaveAttribute('href', '/philly/admin/watches/dishes')
  })

  it('says Mekor Habracha’s list is compared with the guide, IKC above all', async () => {
    await renderTab([watch({ url: 'https://www.mekorhabracha.org/center-city', label: 'Mekor Habracha’s list', lastFiled: 18, pageHash: null })])
    const row = screen.getByTestId('watch-row')
    expect(row).toHaveTextContent(/18 suggestions in the queue/)
    await open(row)
    expect(screen.getByTestId('mekor-watch')).toHaveTextContent(/Compared with the guide every morning.*IKC above all/)
  })

  // Oct 17: a food place's menu watch, made by the daily run, says what it
  // does and how to stop it (taking it off only brings it back tomorrow).
  it('says a menu watch is the run’s own, that the AI reads only a change, and to pause it to stop it', async () => {
    await renderTab([watch({ url: 'https://judah.example/menu', resourceId: 'shul-1', createdBy: 'menu links', lastFiled: 1, pageChangedAt: ago(1) })])
    const group = screen.getByRole('region', { name: 'Menu' })
    expect(group).toHaveTextContent('Added on their own for each place whose menu is known: its menu link, or the page the reader found it on.')
    expect(group).toHaveTextContent(/Changed .*: new dishes on the Main dishes tab/)
    await open(within(group).getByTestId('watch-row'))
    const line = screen.getByTestId('menu-watch')
    expect(line).toHaveTextContent(/When the menu changes, the AI reads it/)
    expect(line).toHaveTextContent(/pause it to stop it/)
    // Oct 21: and that a page that stops opening sends it looking.
    expect(line).toHaveTextContent(/If the page stops opening, its website is searched again/)
    expect(screen.queryByText(/worth a look/)).toBeNull()
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

  it('says what a list run compared: how many listed, how many match, what it filed', async () => {
    const differences = [
      'Shtetl: No longer on the list',
      'Bagel Bar: Hechsher: Keystone-K → Keystone-K (dairy)',
      'Sababa Falafel: On the list, not in the guide',
      'Kosher Korner: On the list, not in the guide (filed before)',
    ]
    await renderTab([
      watch({
        kind: 'keystone_list', url: 'https://www.keystone-k.org/establishments', label: 'Keystone-K’s list', lastFiled: 4,
        lastCheck: { at: ago(0), what: 'list', from: 'page', result: 'differs', read: [], differences, queue: 'filed', list: { listed: 78, matching: 74, differences: 4, filed: 3 } },
      }),
    ])
    const row = screen.getByTestId('watch-row')
    expect(row).toHaveTextContent(/Read .*: 78 on the list, 74 match the guide, 4 differ: 3 new suggestions in the queue, 1 filed before/)
    // Opened, it names them: no Check now needed to see which.
    await open(row)
    const result = within(row).getByTestId('watch-check')
    expect(result).toHaveTextContent('Where the list differs from the guide')
    for (const line of differences) expect(result).toHaveTextContent(line)
  })

  it('opens a list that differs on nothing to no empty box', async () => {
    await renderTab([
      watch({
        kind: 'keystone_list', url: 'https://www.keystone-k.org/establishments', label: 'Keystone-K’s list', lastFiled: 0,
        lastCheck: { at: ago(0), what: 'list', from: null, result: 'agrees', read: [], differences: [], queue: null, list: { listed: 78, matching: 78, differences: 0, filed: 0 } },
      }),
    ])
    const row = screen.getByTestId('watch-row')
    expect(row).toHaveTextContent(/Read .*: 78 on the list, 78 match the guide, nothing differs/)
    await open(row)
    expect(within(row).queryByTestId('watch-check')).toBeNull()
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
      expect(within(form).getByTestId('add-watch-plan')).toHaveTextContent('Every morning the guide reads lms.org/davening, and its calendar if it has one. Times that differ from Lower Merion Synagogue’s go to the moderation queue, with the page beside them; a calendar is read a week at a time, and its week goes as this week’s schedule.')
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

    it('needs no place for a kosher list', async () => {
      await renderTab([], { post: { watch: watch({ id: 'k', kind: 'keystone_list', url: 'https://www.keystone-k.org/establishments' }) } })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Add a watch' }))
      await user.click(screen.getByRole('button', { name: 'Kosher list' }))
      expect(screen.queryByLabelText(/Which place/)).toBeNull()
      await user.type(screen.getByLabelText(/Where does the guide read it/), 'keystone-k.org/establishments')
      expect(screen.getByTestId('add-watch-plan')).toHaveTextContent(/compared with the guide, place by place/)
      await user.click(screen.getByRole('button', { name: 'Start watching' }))
      expect(posts[0].body).toEqual({ action: 'add', purpose: 'kosher', url: 'keystone-k.org/establishments', resourceId: null })
    })

    // Oct 19: an eruv's status source is set here now, on the eruv itself.
    it('sets an eruv’s status emails on the eruv, the other source emptied', async () => {
      await renderTab([], { eruvim: [NE] })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Add a watch' }))
      await user.click(within(screen.getByTestId('add-watch')).getByRole('button', { name: 'Eruv status' }))
      await user.selectOptions(screen.getByLabelText(/Which eruv/), 'northeast')
      await user.type(screen.getByLabelText(/Where does the guide read it/), 'JCOR-NE-Philadelphia@groups.io')
      await user.click(screen.getByRole('button', { name: 'Start watching' }))
      expect(posts.map((p) => p.body)).toEqual([{ id: 'northeast', action: 'save', edit: { statusEmail: 'JCOR-NE-Philadelphia@groups.io', statusUrl: '' } }])
      const row = await screen.findByTestId('eruv-watch-row')
      expect(row).toHaveTextContent('JCOR-NE-Philadelphia@groups.io')
      expect(within(row).getByText('Working')).toBeInTheDocument()
    })

    it('sets an eruv’s status page and reads it at once', async () => {
      await renderTab([], { eruvim: [NE] })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Add a watch' }))
      await user.click(within(screen.getByTestId('add-watch')).getByRole('button', { name: 'Eruv status' }))
      await user.selectOptions(screen.getByLabelText(/Which eruv/), 'northeast')
      await user.type(screen.getByLabelText(/Where does the guide read it/), 'https://ne-eruv.org/status')
      await user.click(screen.getByRole('checkbox', { name: /dates each week’s post/ }))
      await user.click(screen.getByRole('button', { name: 'Start watching' }))
      expect(posts.map((p) => p.body)).toEqual([
        { id: 'northeast', action: 'save', edit: { statusUrl: 'https://ne-eruv.org/status', statusEmail: '', statusDated: true } },
        { id: 'northeast', action: 'check' },
      ])
    })
  })

  describe('Eruv status', () => {
    it('an eruv with no source says so, and “Add its source” starts the form on it', async () => {
      await renderTab([], { eruvim: [NE] })
      const row = screen.getByTestId('eruv-watch-row')
      expect(within(row).getByText('No source')).toBeInTheDocument()
      expect(screen.getByTestId('watch-summary')).toHaveTextContent('1 watches · 1 needs you')
      await userEvent.setup().click(within(row).getByRole('button', { name: 'Add its source' }))
      const form = screen.getByTestId('add-watch')
      expect(within(form).getByRole('button', { name: 'Eruv status' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(form).getByLabelText(/Which eruv/)).toHaveValue('northeast')
    })

    it('an email it couldn’t read is shown on its row, and the admin says what it says', async () => {
      const kept = { messageId: 'g1', subject: 'Eruv update', sentAt: '2026-10-09T17:30:00Z', text: 'The eruv is up. The eruv is down on Castor.', words: 'The eruv is up' }
      await renderTab([], { eruvim: [{ ...NE, statusEmail: 'jcor-ne-philadelphia@groups.io', statusEmailKept: kept }] })
      const row = screen.getByTestId('eruv-watch-row')
      expect(within(row).getByText('Email to read')).toBeInTheDocument()
      const box = within(row).getByTestId('eruv-kept-email')
      expect(box).toHaveTextContent('Their email says both up and down: “Eruv update”, Oct 9')
      await userEvent.setup().click(within(box).getByRole('button', { name: 'It says down' }))
      expect(posts.map((p) => p.body)).toEqual([{ id: 'northeast', action: 'email-says', says: 'down' }])
    })

    it('a page it can’t read says why', async () => {
      await renderTab([], { eruvim: [{ ...NE, statusUrl: 'https://ne-eruv.org/status', statusErrorAt: ago(0.1), statusError: 'The page answered 500' }] })
      const row = screen.getByTestId('eruv-watch-row')
      expect(within(row).getByText('Not working')).toBeInTheDocument()
      expect(row).toHaveTextContent('Last read failed: The page answered 500')
    })

    it('“Stop reading” empties both sources, once the admin says so', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      await renderTab([], { eruvim: [{ ...NE, statusUrl: 'https://ne-eruv.org/status', statusCheckedAt: ago(0.1) }] })
      const row = screen.getByTestId('eruv-watch-row')
      await open(row)
      await userEvent.setup().click(within(row).getByRole('button', { name: 'Stop reading' }))
      expect(posts.map((p) => p.body)).toEqual([{ id: 'northeast', action: 'save', edit: { statusUrl: '', statusEmail: '' } }])
      expect(await within(row).findByText('No source')).toBeInTheDocument()
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
    const menus = ['Bar Bombon', 'Goldie', 'Mama’s', 'Rita’s', 'Zevi’s'].map((name, i) =>
      watch({ id: `m${i}`, label: `${name} menu`, url: `https://m${i}.example/menu`, createdBy: 'menu links' }),
    )
    menus[3] = { ...menus[3], failingSince: ago(1), lastError: 'The page answered 404' }
    await renderTab([watch({ id: 'k', kind: 'keystone_list', url: 'https://www.keystone-k.org/establishments', label: 'Keystone-K’s list' }), ...menus])
    const [kosher, menuGroup] = screen.getAllByTestId('watch-group')
    expect(kosher).toHaveAccessibleName('Kosher list')
    expect(within(kosher).getAllByTestId('watch-row')).toHaveLength(1)
    expect(menuGroup).toHaveAccessibleName('Menu')
    const toggle = within(menuGroup).getByRole('button', { name: /Menu.*5.*1 not working.*Show all 5/ })
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
})
