// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  await screen.findByRole('region', { name: 'What’s tracked' })
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

  it('coming back to it shows what it last showed at once, while it reads again', async () => {
    await renderTab([], { categories: [{ id: 'restaurant', pluralLabel: 'Food', kind: 'listing', hasAddress: true }], google: { counts: { checked: 1, toCheck: 0, cantRead: 0, didntLoad: 0 }, places: [{ id: 'a', name: 'a', street: null, address: null, category: 'restaurant', categoryLabel: 'Food', href: '/philly/restaurant/a', matched: true, section: 'checked', fields: [{ field: 'name', label: 'Name', value: 'x', by: { kind: 'google' } }], readAt: ago(0.5), failedAt: null, notOnGoogle: null, closure: null, compare: null }] } })
    cleanup()
    vi.mocked(fetchJson).mockImplementation(() => new Promise(() => {}))
    renderWithProviders(<WatchesManager token="tok" />, { community: { slug: 'philly' } })
    expect(screen.getAllByTestId('kind-row').map((r) => r.getAttribute('href'))).toEqual(['/philly/admin/watches/kind/restaurant'])
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
    expect(screen.getByRole('region', { name: 'What the watches keep current' })).toBeInTheDocument()
  })

  // Regression: a job that couldn't be loaded left its findings out of every
  // count, and the rows looked complete.
  it('names the jobs that couldn’t be loaded, under counts that leave them out', async () => {
    await renderTab([], {
      categories: [{ id: 'mikvah', pluralLabel: 'Mikvah', kind: 'listing', hasAddress: true }],
      google: { counts: { checked: 1, toCheck: 0, cantRead: 0, didntLoad: 0 }, places: [{ id: 'm', name: 'm', street: null, address: null, category: 'mikvah', categoryLabel: 'Mikvah', href: '/philly/mikvah/m', matched: true, section: 'checked', fields: [], readAt: ago(0.5), failedAt: null, notOnGoogle: null, closure: null, compare: null }] },
      hours: [],
      times: [],
    })
    const note = screen.getByTestId('jobs-not-loaded')
    expect(note).toHaveTextContent('Not loaded: Dishes')
    expect(note).not.toHaveTextContent('Mikvah hours')
    expect(note).not.toHaveTextContent('Shul times')
  })

  // Oct 26: a kosher list is stopped, or read again, from What's tracked,
  // as its job page did.
  it('stops a kosher list from What’s tracked, and reads a stopped one again', async () => {
    const kinds = [
      {
        id: 'lists', name: 'Kosher lists', about: '', when: '2:00 AM', count: '2 of 2 read', trouble: null, misses: [], nights: [],
        tracked: [
          { name: 'Keystone-K’s list', status: 'Read last night', bad: false, page: '', watch: { id: 'k', active: true } },
          { name: 'Mekor Habracha’s list', status: 'Stopped', bad: false, page: '', watch: { id: 'm', active: false } },
        ],
      },
    ]
    await renderTab([], { runs: { available: true, kinds } })
    const user = userEvent.setup()
    const tracked = screen.getByRole('region', { name: 'What’s tracked' })
    await user.click(within(tracked).getByRole('button', { name: /What’s tracked/ }))
    await user.click(within(tracked).getByRole('button', { name: /Kosher lists/ }))
    await user.click(within(tracked).getByRole('button', { name: /All 2 tracked/ }))
    await user.click(within(tracked).getByRole('button', { name: 'Stop' }))
    await user.click(within(tracked).getByRole('button', { name: 'Read again' }))
    expect(posts.map((p) => p.body)).toEqual([{ action: 'pause', id: 'k' }, { action: 'resume', id: 'm' }])
  })
})
