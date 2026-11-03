// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
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
  } = {},
) {
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
  vi.unstubAllGlobals()
  forgetWatchesTab()
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
    expect(within(lists).getByRole('link', { name: /Keystone-K and Mekor Habracha/ })).toHaveTextContent('Kosher certification ·')
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

  it('what needs fixing is listed, and its job gets an X', async () => {
    const fix = { name: 'Lower Merion Synagogue', why: 'Page didn’t open, 3 nights', page: 'place/l' }
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ id: 'times', name: 'Minyan times', tracked: [{ name: 'x', status: '', bad: false, page: '' }], fixes: [fix] })] } })
    expect(screen.getByTestId('watches-sentence')).toHaveTextContent('1 thing needs fixing. The rest is fine.')
    const box = screen.getByRole('region', { name: 'Needs fixing' })
    expect(within(box).getByRole('link')).toHaveTextContent('Lower Merion SynagoguePage didn’t open, 3 nights')
    expect(within(box).getByRole('link')).toHaveAttribute('href', '/philly/admin/watches/place/l')
    expect(within(row(/^Minyan times/)).getByRole('img', { name: 'Something wrong' })).toBeInTheDocument()
  })

  // Look again (Nov 3): its own row, how many it has to try and when it
  // last ran; a run that failed needs fixing like any job's.
  it('Look again: its row, and a failed run needs fixing', async () => {
    const items = [{ kind: 'google', id: 'g', name: 'The Kosher Grill', why: 'Never looked for', note: null, lastTry: null, found: null, stopped: null }, { kind: 'menu', id: 'm', name: 'Stopped One', why: 'x', note: null, lastTry: null, found: null, stopped: ago(1) }]
    const run = { id: 'r', job: 'look-again', startedAt: ago(0.3), finishedAt: ago(0.29), ok: true, summary: 'Tried 1 again', warning: null, error: null }
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] }, lookAgain: { available: true, items, leftOut: 0, runs: [run] } })
    const look = within(screen.getByRole('region', { name: 'Look again' })).getByRole('link')
    expect(look).toHaveAttribute('href', '/philly/admin/watches/job/look-again')
    expect(look).toHaveTextContent('1 to try · Last night')
    expect(within(look).getByRole('img', { name: 'Good' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Needs fixing' })).toBeNull()
    cleanup()
    forgetWatchesTab()
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] }, lookAgain: { available: true, items, leftOut: 0, runs: [{ ...run, ok: false, error: 'boom' }] } })
    expect(within(screen.getByRole('region', { name: 'Needs fixing' })).getByRole('link')).toHaveTextContent('Look againLast run failed')
  })

  it('Look again before its table: says it isn’t set up', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] }, lookAgain: { available: false, items: [], leftOut: 0, runs: [] } })
    expect(within(screen.getByRole('region', { name: 'Look again' })).getByRole('link')).toHaveTextContent('Not set up')
  })

  it('a job turned off leaves the list, and + Add a watch offers it', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: ['google'], kinds: [view({ tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] } })
    expect(screen.queryByRole('link', { name: /^Google/ })).toBeNull()
    expect(row('+ Add a watch')).toHaveAttribute('href', '/philly/admin/watches/add')
  })

  it('newsletters open their own page', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ id: 'newsletters', name: 'Newsletters', tracked: [{ name: 'x', status: '', bad: false, page: '' }] })] } })
    expect(row(/^Newsletters/)).toHaveAttribute('href', '/philly/admin/watches/newsletters')
  })

  it('counts the places with something no job checks, and opens them on Places', async () => {
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
    expect(within(screen.getByRole('region', { name: 'Not checked' })).getByRole('link')).toHaveTextContent('1 place')
    expect(row('1 place')).toHaveAttribute('href', '/philly/admin/places?checked=not-watched')
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
