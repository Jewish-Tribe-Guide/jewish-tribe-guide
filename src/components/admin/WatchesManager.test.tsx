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
    /** The community email (GET /api/admin/community-email). */
    own = { email: 'guide@gmail.com', canSave: true, checkedAt: ago(0.01), lastEmailAt: null } as Record<string, unknown>,
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
    if (String(url).includes('/api/admin/community-email')) return { ok: true, ...own }
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

const read = [{ name: 'x', status: '', bad: false, page: '' }]

// Boards W1 and W2 (Nov 25): what's kept current, one row each, with where
// it's read from and when; nothing else.
describe('WatchesManager', () => {
  it('one list, Kept current: each row with where it’s read from and when, opening its job (W1)', async () => {
    const kinds = [
      view({ id: 'google', tracked: [...read, ...read] }),
      view({ id: 'times', name: 'Minyan times', tracked: [{ name: 'Mekor', status: '', bad: false, page: '' }] }),
      view({ id: 'kosher', tracked: [{ name: 'Keystone-K', status: '', bad: false, page: '' }, { name: 'KCL', status: '', bad: false, page: '' }] }),
      view({ id: 'links', lastAt: ago(40), tracked: read, fixes: [{ name: 'Links', why: 'Didn’t run since Oct 15', page: 'job/links', whole: true }] }),
    ]
    await renderTab([], { categories: [shulCategory], runs: { available: true, off: [], kinds } })
    expect(screen.getByRole('link', { name: /‹ Places/ })).toHaveAttribute('href', '/philly/admin/places')
    const box = within(screen.getByRole('region', { name: 'Kept current' }))
    expect(box.getByRole('link', { name: /^Open or closed/ })).toHaveTextContent('Open or closedGoogle · 2 placesLast night')
    expect(box.getByRole('link', { name: /^Hours, phone and website/ })).toHaveAttribute('href', '/philly/admin/watches/job/google')
    expect(box.getByRole('link', { name: /^Minyan times/ })).toHaveTextContent('1 shul’s websites')
    expect(box.getByRole('link', { name: /^Minyan times/ })).toHaveAttribute('href', '/philly/admin/watches/job/times')
    expect(box.getByRole('link', { name: /^Kosher certification/ })).toHaveTextContent('Keystone-K and KCL')
    expect(box.getByRole('link', { name: /^Links/ })).toHaveTextContent('Didn’t run since Oct 15')
  })

  it('the To do card opens To do', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: read })] } })
    expect(screen.getByRole('link', { name: /What they found waits on To do/ })).toHaveAttribute('href', '/philly/admin')
  })

  // The user, Nov 25: "a box waiting to explode".
  it('none of what it used to have: the sentence, Needs fixing, Add a watch, How watches work, Look again, Needs one step', async () => {
    const whole = { name: 'Minyan times', why: 'Last run failed', page: 'job/times', whole: true }
    const run = { id: 'r', job: 'look-again', startedAt: ago(0.3), finishedAt: ago(0.29), ok: false, summary: '', warning: null, error: 'boom' }
    await renderTab([], {
      categories: [shulCategory],
      runs: { available: true, off: [], kinds: [view({ tracked: read }), view({ id: 'times', name: 'Minyan times', tracked: read, fixes: [whole] })] },
      lookAgain: { available: true, items: [], leftOut: [], runs: [run] },
    })
    expect(screen.queryByTestId('watches-sentence')).toBeNull()
    for (const gone of ['Needs fixing', 'Look again', 'Needs one step', 'Google', 'Websites', 'Email']) expect(screen.queryByRole('region', { name: gone })).toBeNull()
    expect(screen.queryByRole('link', { name: '+ Add a watch' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'How watches work' })).toBeNull()
    // A job failing says so on its own row.
    expect(screen.getByRole('link', { name: /^Minyan times/ })).toHaveTextContent('Last run failed')
  })

  it('a new community: every row, greyed, with what it has none of, and the community email first (W2)', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [] }, own: { email: null, canSave: true, checkedAt: null, lastEmailAt: null } })
    const card = await screen.findByRole('link', { name: /The community email/ })
    expect(card).toHaveTextContent('Needed for the shuls’ and eruvs’ emails')
    expect(card).toHaveAttribute('href', '/philly/admin/team/email')
    const rows = within(screen.getByRole('region', { name: 'Kept current' })).getAllByRole('link')
    expect(rows).toHaveLength(10)
    expect(screen.getByRole('link', { name: /^Minyan times/ })).toHaveTextContent('No shuls yet')
    expect(screen.queryByRole('link', { name: /What they found/ })).toBeNull()
  })

  it('no community email card once it’s set up', async () => {
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: read })] } })
    await screen.findByRole('link', { name: /What they found/ })
    expect(screen.queryByRole('link', { name: /The community email/ })).toBeNull()
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
    await renderTab([], { categories: [], runs: { available: true, off: [], kinds: [view({ tracked: read })] } })
    cleanup()
    vi.mocked(fetchJson).mockImplementation(() => new Promise(() => {}))
    renderWithProviders(<WatchesManager token="tok" />, { community: { slug: 'philly' } })
    expect(row(/Open or closed/)).toBeInTheDocument()
  })
})
