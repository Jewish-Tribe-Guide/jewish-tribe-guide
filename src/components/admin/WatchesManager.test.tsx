// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { resetTodo } from '@/lib/useTodo'
import type { Watch } from '@/lib/watches'
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

type Post = { url: string; body: Record<string, unknown> }
const posts: Post[] = []

async function renderTab(
  watches: Watch[],
  {
    available = true,
    post = {} as Record<string, unknown>,
    eruvim = null as unknown[] | null,
    kosher = null as Record<string, unknown> | null,
    dishes = null as unknown[] | null,
    hospitals = null as unknown[] | null,
    hours = null as unknown[] | null,
    times = null as unknown[] | null,
    google = null as Record<string, unknown> | null,
    runs = null as Record<string, unknown> | null,
    categories = null as unknown[] | null,
    places = null as unknown[] | null,
    sites = null as unknown[] | null,
    links = null as unknown[] | null,
    lookAgain = null as Record<string, unknown> | null,
    /** Google's places as To do reads them, for its broken checks. */
    todoGoogle = [] as unknown[],
  } = {},
) {
  // To do's own reads, for the broken checks it counts (useTodo).
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ url: String(url), status: 200 }) as Response))
  vi.mocked(parseOkJson).mockImplementation(async (res) => {
    const url = String((res as Response).url)
    if (url.includes('/api/admin/watches/google')) return { places: todoGoogle }
    if (url.includes('/api/admin/responses')) return { responses: [] }
    if (url.includes('/api/admin/setup')) return { setup: null }
    return { submissions: [] }
  })
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posts.push({ url: String(url), body })
      return { ok: true, ...post }
    }
    if (String(url).includes('/api/admin/watches/look-again')) {
      if (!lookAgain) throw new Error('down')
      return { ok: true, ...lookAgain }
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
    if (String(url).includes('/api/admin/listings')) {
      if (!places) throw new Error('down')
      return { ok: true, places }
    }
    if (String(url).includes('/api/admin/watches/sites')) {
      if (!sites) throw new Error('down')
      return { ok: true, places: sites }
    }
    if (String(url).includes('/api/admin/watches/links')) {
      if (!links) throw new Error('down')
      return { ok: true, links }
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
  // The jobs' counts come in after the tab's own read.
  await act(() => new Promise((r) => setTimeout(r, 0)))
}

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.mocked(fetchJson).mockReset()
  vi.mocked(parseOkJson).mockReset()
  vi.unstubAllGlobals()
  forgetWatchesTab()
  resetTodo()
})

const view = (over: Record<string, unknown>) => ({ id: 'google', name: 'Google', about: '', when: '2:00 AM', count: '', trouble: null, misses: [], tracked: [], nights: [], fixes: [], lastAt: ago(0.3), schedule: 'Runs every night at 2:00 AM', ...over })
const shulCategory = { id: 'synagogue', label: 'Shul', pluralLabel: 'Shuls', kind: 'listing', hasAddress: true, detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] }
const row = (name: RegExp | string) => screen.getByRole('link', { name })

describe('WatchesManager', () => {
  it('lists its jobs under the source they read (WatchesInPlaces10)', async () => {
    const ran = { lastAt: '2026-10-31T07:00:00Z', tracked: [{ name: 'x', status: '', bad: false, page: '' }] }
    const kinds = ['google', 'times', 'newsletters', 'kosher', 'hospitals', 'links'].map((id) => view({ id, name: id, ...ran }))
    const categories = [shulCategory, { id: 'restaurant', label: 'Food', pluralLabel: 'Food', kind: 'listing', hasAddress: true, detailFields: [] }, { id: 'hospital', label: 'Hospital', pluralLabel: 'Hospitals', kind: 'listing', hasAddress: true, detailFields: [] }]
    await renderTab([], { categories, runs: { available: true, off: [], kinds } })
    expect(screen.getByRole('link', { name: /Places/ })).toHaveAttribute('href', '/philly/admin/places')
    expect(within(screen.getByRole('region', { name: 'Websites' })).getByRole('link', { name: /times/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Email' })).getByRole('link', { name: /newsletters/ })).toBeInTheDocument()
    const lists = screen.getByRole('region', { name: 'Outside lists' })
    expect(within(lists).getByRole('link', { name: /Keystone-K, Mekor Habracha and KCL/ })).toHaveTextContent('Kosher certification ·')
    expect(within(lists).getByRole('link', { name: /Refuah/ })).toHaveTextContent('Hospitals ·')
    expect(within(screen.getByRole('region', { name: 'Link check' })).getByRole('link', { name: /links/ })).toBeInTheDocument()
  })

  it('before any job has run, explains itself; jobs say Not run yet', async () => {
    await renderTab([], { categories: [shulCategory], runs: { available: true, off: [], kinds: [view({ count: 'Not run yet', lastAt: null, tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] } })
    expect(screen.getByTestId('watches-sentence')).toHaveTextContent('Watches read the web each night and bring you what changed.')
    expect(within(screen.getByRole('region', { name: 'Google' })).getByRole('link', { name: /Google/ })).toHaveTextContent('Not run yet')
    expect(within(screen.getByRole('region', { name: 'Needs one step' })).getByRole('link', { name: /Minyan times/ })).toHaveTextContent('Add each shul’s times page')
  })

  it('all fine: a check on the sentence and on each job, and nothing to fix', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] } })
    expect(screen.getByTestId('watches-sentence')).toHaveTextContent('All fine. Nothing to fix.')
    expect(screen.queryByRole('region', { name: 'Needs fixing' })).toBeNull()
    const job = row(/Google/)
    expect(job).toHaveTextContent('Last night')
    expect(job).toHaveAttribute('href', '/philly/admin/watches/job/google')
    expect(within(job).getByRole('img', { name: 'Good' })).toBeInTheDocument()
  })

  // The user, Nov 4: "Do we need needs fixing or is that for to do?" A
  // place's broken check is To do's: counted as To do counts it, and the
  // sentence opens To do on them. Only a whole job failing is listed here.
  it('counts To do’s broken checks, and opens To do on them', async () => {
    const fix = { name: 'Lower Merion Synagogue', why: 'Page didn’t open, 3 nights', page: 'place/l' }
    const google = [{ id: 'shul-1', name: 'Mekor Habracha', category: 'synagogue', matched: false, notOnGoogle: null }, { id: 'shul-2', name: 'Kesher Israel', category: 'synagogue', matched: false, notOnGoogle: null }]
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ id: 'times', name: 'Minyan times', tracked: [{ name: 'x', status: '', bad: false, page: '' }], fixes: [fix] })] }, todoGoogle: google })
    const sentence = await screen.findByRole('link', { name: '2 things need fixing. The rest is fine.' })
    expect(sentence).toHaveAttribute('href', '/philly/admin?show=broken')
    expect(screen.queryByRole('region', { name: 'Needs fixing' })).toBeNull()
    expect(within(row(/^Minyan times/)).getByRole('img', { name: 'Something wrong' })).toBeInTheDocument()
  })

  it('a whole job failing is listed, with To do’s broken checks as one row', async () => {
    const whole = { name: 'Minyan times', why: 'Last run failed', page: 'job/times', whole: true }
    const google = [{ id: 'shul-1', name: 'Mekor Habracha', category: 'synagogue', matched: false, notOnGoogle: null }]
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ id: 'times', name: 'Minyan times', tracked: [{ name: 'x', status: '', bad: false, page: '' }], fixes: [whole] })] }, todoGoogle: google })
    await screen.findByRole('link', { name: /^Broken checks/ })
    expect(screen.getByTestId('watches-sentence')).toHaveTextContent('2 things need fixing. The rest is fine.')
    const box = within(screen.getByRole('region', { name: 'Needs fixing' }))
    expect(box.getAllByRole('link').map((l) => l.textContent)).toEqual(['Minyan timesLast run failed', 'Broken checks1 place'])
    expect(box.getByRole('link', { name: /^Broken checks/ })).toHaveAttribute('href', '/philly/admin?show=broken')
  })

  // Real bug, Nov 4: Menus showed a check the morning a menu didn't load.
  // One night isn't a fix yet, but it isn't fine either.
  it('a job with trouble last night says it, with no check', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ id: 'menus', name: 'Menus', count: '20 of 21 read', trouble: '1 didn’t load', tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] } })
    const job = row(/^Menus/)
    expect(job).toHaveTextContent('1 didn’t load')
    expect(within(job).queryByRole('img', { name: 'Good' })).toBeNull()
  })

  // Look again (Nov 3): its own row, how many it has to try and when it
  // last ran; a run that failed needs fixing like any job's.
  it('Look again: its row, and a failed run needs fixing', async () => {
    const items = [{ kind: 'google', id: 'g', name: 'The Kosher Grill', why: 'Never looked for', note: null, lastTry: null, found: null, stopped: null }, { kind: 'menu', id: 'm', name: 'Stopped One', why: 'x', note: null, lastTry: null, found: null, stopped: ago(1) }]
    const run = { id: 'r', job: 'look-again', startedAt: ago(0.3), finishedAt: ago(0.29), ok: true, summary: 'Tried 1 again', warning: null, error: null }
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] }, lookAgain: { available: true, items, leftOut: [], runs: [run] } })
    const look = within(screen.getByRole('region', { name: 'Look again' })).getByRole('link')
    expect(look).toHaveAttribute('href', '/philly/admin/watches/job/look-again')
    expect(look).toHaveTextContent('1 to try · Last night')
    expect(within(look).getByRole('img', { name: 'Good' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Needs fixing' })).toBeNull()
    cleanup()
    forgetWatchesTab()
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] }, lookAgain: { available: true, items, leftOut: [], runs: [{ ...run, ok: false, error: 'boom' }] } })
    expect(within(screen.getByRole('region', { name: 'Needs fixing' })).getByRole('link')).toHaveTextContent('Look againLast run failed')
  })

  // Elkins Park, Nov 4: a try whose website didn't open read as all fine.
  it('Look again with a failed try says so, with no check', async () => {
    const run = { id: 'r', job: 'look-again', startedAt: ago(0.3), finishedAt: ago(0.29), ok: true, summary: 'Tried 1 again', warning: '1 try stopped with an error', error: null }
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] }, lookAgain: { available: true, items: [], leftOut: [], runs: [run] } })
    const look = within(screen.getByRole('region', { name: 'Look again' })).getByRole('link')
    expect(look).toHaveTextContent('1 try stopped with an error')
    expect(within(look).queryByRole('img', { name: 'Good' })).toBeNull()
  })

  it('Look again before its table: says it isn’t set up', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] }, lookAgain: { available: false, items: [], leftOut: [], runs: [] } })
    expect(within(screen.getByRole('region', { name: 'Look again' })).getByRole('link')).toHaveTextContent('Not set up')
  })

  it('a job turned off leaves the list, and + Add a watch offers it', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: ['google'], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] } })
    expect(screen.queryByRole('link', { name: /^Google/ })).toBeNull()
    expect(screen.getByRole('link', { name: '+ Add a watch' })).toHaveAttribute('href', '/philly/admin/watches/add')
  })

  // The user, Nov 4: "Should add a watch be a button at the top?" It's at
  // the top right, as the job pages have theirs, and there with nothing
  // turned off too (it used to show only then).
  it('+ Add a watch is a button at the top, always', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] } })
    const add = screen.getByRole('link', { name: '+ Add a watch' })
    expect(add).toHaveAttribute('href', '/philly/admin/watches/add')
    expect(add.compareDocumentPosition(screen.getByTestId('watches-sentence')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('newsletters open their own page', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ id: 'newsletters', name: 'Newsletters', tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] } })
    expect(row(/^Newsletters/)).toHaveAttribute('href', '/philly/admin/watches/newsletters')
  })

  // The user, Nov 4: "Don't need not checked in watches now": it's on
  // Places (Checked by), where a place is.
  it('has no Not checked box: that’s on Places', async () => {
    const approved = (id: string, listing: Record<string, unknown>) => ({ id, name: id, category: 'synagogue', status: 'approved', hasAddress: true, changedAt: ago(1), listing: { id, ...listing } })
    await renderTab([], {
      categories: [shulCategory],
      runs: { available: true, off: [], kinds: [] },
      places: [approved('read', {}), approved('unread', {}), { ...approved('gone', {}), status: 'archived' }],
      times: [{ id: 'read', pages: [{ watch: watch({}), source: '' }] }],
      google: { counts: {}, places: [] },
      hours: [],
      eruvim: [],
      kosher: { places: [] },
      dishes: [],
      hospitals: [],
      sites: [],
      links: [],
    })
    await screen.findByTestId('watches-sentence')
    expect(screen.queryByRole('region', { name: 'Not checked' })).toBeNull()
    expect(screen.queryByRole('link', { name: /1 place/ })).toBeNull()
  })

  it('says so when the jobs couldn’t be loaded', async () => {
    await renderTab([], { categories: [] })
    expect(screen.getByText('Couldn’t load the watches.')).toBeInTheDocument()
  })

  // Regression: a job that couldn't be loaded left its places out of every
  // count, and the page looked complete.
  it('names the jobs that couldn’t be loaded', async () => {
    await renderTab([], { categories: [], hours: [], times: [], runs: { available: true, off: [], kinds: [] } })
    const note = screen.getByTestId('jobs-not-loaded')
    expect(note).toHaveTextContent('Dishes')
    expect(note).not.toHaveTextContent('Mikvah hours')
  })

  it('coming back to it shows what it last showed at once, while it reads again', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] } })
    cleanup()
    vi.mocked(fetchJson).mockImplementation(() => new Promise(() => {}))
    renderWithProviders(<WatchesManager token="tok" />, { community: { slug: 'philly' } })
    expect(row(/Google/)).toBeInTheDocument()
  })
})
