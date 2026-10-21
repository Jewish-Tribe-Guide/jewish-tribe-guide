// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { Watch } from '@/lib/watches'
import type { KosherPlace } from '@/lib/kosherJob'
import KosherJob, { type KosherListState, type KosherLoaded } from './KosherJob'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/kosher',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const watch = (over: Partial<Watch>): Watch =>
  ({ id: 'w', communityId: 'philly', kind: 'website', url: 'https://x', active: true, lastRunAt: ago(0.1), lastOkAt: ago(0.1), lastError: null, failingSince: null, lastCheck: null, ...over }) as Watch

const KEYSTONE: KosherListState = {
  list: 'keystone',
  url: 'https://keystone-k.org/establishments/',
  watch: watch({ id: 'k', kind: 'keystone_list', url: 'https://keystone-k.org/establishments/' }),
  error: null,
  entries: 78,
  updated: null,
}
const MEKOR: KosherListState = {
  list: 'mekor',
  url: 'https://www.mekorhabracha.org/center-city',
  watch: watch({ id: 'm', url: 'https://www.mekorhabracha.org/center-city' }),
  error: null,
  entries: 52,
  updated: '2026-10-12',
}

const place = (over: Partial<KosherPlace>): KosherPlace & { href: string } => ({
  id: 'p',
  name: 'Somewhere',
  category: 'restaurant',
  certs: [],
  levels: [],
  on: [],
  differences: [],
  href: '/philly/restaurant/somewhere-p',
  ...over,
})
const CHERRY = place({
  id: 'cherry',
  name: 'Cherry Grill',
  certs: ['Keystone-K'],
  levels: ['Meat'],
  on: [{ list: 'keystone', name: 'Cherry Grill', url: 'https://keystone-k.org/kosher/cherry-grill/', says: 'Meat – Glatt' }],
})
const JUDAH = place({
  id: 'judah',
  name: 'Judah Grille',
  certs: ['IKC'],
  levels: ['Meat'],
  on: [{ list: 'keystone', name: 'Judah Grille', url: 'https://keystone-k.org/kosher/judah-grille/', says: 'Meat' }],
  differences: [
    { list: 'keystone', line: 'On Keystone-K’s list; the listing doesn’t name Keystone-K', filed: 'queued' },
    { list: 'mekor', line: 'The listing says IKC; Mekor Habracha’s list doesn’t have it', filed: 'decided' },
  ],
})
const SABABA = place({
  id: 'sababa',
  name: 'Sababa',
  certs: ['OU'],
  on: [{ list: 'mekor', name: 'Sababa', url: 'https://www.mekorhabracha.org/post/sababa', says: 'Under IKC Supervision' }],
  differences: [{ list: 'mekor', line: 'Mekor Habracha says IKC; the listing says OU', filed: 'decided' }],
})
const STAR = place({ id: 'star', name: 'Star K Place', certs: ['Star-K'] })

const posts: { url: string; body: Record<string, unknown> }[] = []
async function renderPage(over: Partial<KosherLoaded> = {}) {
  let loads = 0
  const data: KosherLoaded = {
    available: true,
    lists: [KEYSTONE, MEKOR],
    counts: { checked: 1, toCheck: 1, cantRead: 0, didntLoad: 0, notListed: 1 },
    places: [CHERRY, JUDAH, SABABA, STAR],
    newPlaces: [],
    ...over,
  }
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      posts.push({ url: String(url), body: JSON.parse(String(init.body)) })
      return { ok: true }
    }
    loads += 1
    return { ok: true, ...data }
  })
  renderWithProviders(<KosherJob token="tok" />, { community: { slug: 'philly' } })
  await screen.findByTestId('kosher-counts')
  return { loads: () => loads }
}
const section = (name: string) => screen.getByRole('region', { name })

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.mocked(fetchJson).mockReset()
})

describe('KosherJob', () => {
  it('puts each food place where the lists leave it, what needs the admin first', async () => {
    await renderPage()
    expect(screen.getByTestId('kosher-counts')).toHaveTextContent('1 checked · 1 to check · 1 on neither list')
    const toCheck = within(section('To check')).getAllByTestId('kosher-place')
    expect(toCheck).toHaveLength(1)
    expect(toCheck[0]).toHaveTextContent('Judah Grille')
    expect(toCheck[0]).toHaveTextContent('The listing says IKC · Meat')
    expect(toCheck[0]).toHaveTextContent('On Keystone-K’s list; the listing doesn’t name Keystone-K · in the moderation queue')
    // What was decided before isn't asked again beside it.
    expect(toCheck[0]).not.toHaveTextContent('Mekor Habracha’s list doesn’t have it')
    // The rest start closed.
    expect(screen.queryByText('Cherry Grill')).toBeNull()
    expect(screen.queryByText('Sababa')).toBeNull()
    expect(screen.queryByText('Star K Place')).toBeNull()
    expect(screen.getByRole('link', { name: '‹ Watches' })).toHaveAttribute('href', '/philly/admin/watches')
  })

  it('opened, a place says what each list says, in its words, and links to the queue and the listing', async () => {
    await renderPage()
    const row = within(section('To check')).getByTestId('kosher-place')
    await userEvent.setup().click(within(row).getAllByRole('button')[0])
    expect(row).toHaveTextContent('Keystone-K says: “Meat”')
    expect(within(row).getByRole('link', { name: 'Keystone-K' })).toHaveAttribute('href', 'https://keystone-k.org/kosher/judah-grille/')
    expect(within(row).getByRole('link', { name: 'Approve or reject it in the moderation queue' })).toHaveAttribute('href', '/philly/admin')
    expect(within(row).getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', '/philly/restaurant/somewhere-p')
  })

  it('a difference not filed yet says tomorrow morning’s read files it', async () => {
    await renderPage({ places: [{ ...JUDAH, differences: [{ ...JUDAH.differences[0], filed: 'next' }] }] })
    const row = within(section('To check')).getByTestId('kosher-place')
    expect(row).toHaveTextContent('· filed with tomorrow morning’s read')
    await userEvent.setup().click(within(row).getAllByRole('button')[0])
    expect(within(row).queryByRole('link', { name: /moderation queue/ })).toBeNull()
  })

  it('a place a list agrees with, or one decided before, is in its own closed section', async () => {
    await renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Checked/ }))
    expect(screen.getByText('Cherry Grill').closest('li')).toHaveTextContent('Keystone-K agrees')
    await user.click(screen.getByRole('button', { name: /Decided before/ }))
    expect(screen.getByText('Sababa').closest('li')).toHaveTextContent('Mekor Habracha says IKC; the listing says OU · decided in the queue before')
  })

  it('a place only a list has says which list, and whether it waits in the queue', async () => {
    await renderPage({
      newPlaces: [
        {
          name: 'Shug Sisters',
          address: '1 Main St',
          on: [
            { list: 'keystone', name: 'Shug Sisters', url: 'https://keystone-k.org/kosher/shug/', says: 'Dairy' },
            { list: 'mekor', name: 'Shug Sisters', url: 'https://www.mekorhabracha.org/post/shug-sisters', says: 'Under Keystone-K' },
          ],
          archived: null,
          filed: 'queued',
        },
        { name: 'Old Deli', address: '', on: [{ list: 'mekor', name: 'Old Deli', url: 'https://www.mekorhabracha.org/post/old-deli', says: '' }], archived: 'Old Deli', filed: 'next' },
      ],
    })
    const [shug, deli] = within(section('On a list, not in the guide')).getAllByTestId('kosher-new')
    expect(shug).toHaveTextContent('On Keystone-K’s list: “Dairy”')
    expect(shug).toHaveTextContent('On Mekor Habracha’s list: “Under Keystone-K”')
    expect(within(shug).getByRole('link', { name: 'Approve or reject it in the moderation queue' })).toBeInTheDocument()
    expect(deli).toHaveTextContent('The guide has it archived, as “Old Deli”.')
    expect(deli).toHaveTextContent('Filed with tomorrow morning’s read, unless Google says it has closed.')
  })

  // Moved from the Watches tab's rows (Oct 20): a list says what its
  // morning read compared.
  it('says each list’s size now and what its morning read compared and filed', async () => {
    const lastCheck = { at: ago(0), what: 'list' as const, from: 'page' as const, result: 'differs' as const, read: [], differences: [], queue: 'filed' as const, list: { listed: 78, matching: 74, differences: 4, filed: 3 } }
    await renderPage({ lists: [{ ...KEYSTONE, watch: { ...KEYSTONE.watch!, lastCheck } }, MEKOR] })
    const [keystone, mekor] = screen.getAllByTestId('kosher-list')
    expect(keystone).toHaveTextContent('Keystone-K’s list78 places on it now.')
    expect(keystone).toHaveTextContent(/Read .*: 78 on the list, 74 match the guide, 4 differ: 3 new suggestions in the queue, 1 filed before/)
    expect(mekor).toHaveTextContent('52 places on it now, updated Oct 12.')
  })

  it('a list that didn’t load says why, and the count says so', async () => {
    await renderPage({ lists: [{ ...KEYSTONE, error: 'Keystone-K’s list answered 503', entries: null }, MEKOR], counts: { checked: 0, toCheck: 0, cantRead: 0, didntLoad: 1, notListed: 0 } })
    expect(screen.getAllByTestId('kosher-list')[0]).toHaveTextContent('Didn’t load just now: Keystone-K’s list answered 503')
    expect(screen.getByTestId('kosher-counts')).toHaveTextContent('1 list didn’t load')
  })

  it('Check now reads a list and the page loads again; a list not read is offered', async () => {
    const page = await renderPage({ lists: [KEYSTONE, { ...MEKOR, watch: null, entries: null }] })
    const user = userEvent.setup()
    const [keystone, mekor] = screen.getAllByTestId('kosher-list')
    expect(mekor).toHaveTextContent('Not read for this guide.')
    await user.click(within(keystone).getByRole('button', { name: 'Check now' }))
    expect(posts.map((p) => p.body)).toEqual([{ action: 'check', id: 'k' }])
    expect(posts[0].url).toContain('/api/admin/watches')
    expect(page.loads()).toBe(2)
    await user.click(within(screen.getAllByTestId('kosher-list')[1]).getByRole('button', { name: 'Read it every morning' }))
    expect(posts[1].body).toEqual({ action: 'add', purpose: 'kosher', url: 'https://www.mekorhabracha.org/center-city' })
  })

  it('a paused list can be resumed, and isn’t checked', async () => {
    await renderPage({ lists: [{ ...KEYSTONE, watch: { ...KEYSTONE.watch!, active: false }, entries: null }, MEKOR] })
    const keystone = screen.getAllByTestId('kosher-list')[0]
    expect(keystone).toHaveTextContent('Paused: not read.')
    expect(within(keystone).queryByRole('button', { name: 'Check now' })).toBeNull()
    await userEvent.setup().click(within(keystone).getByRole('button', { name: 'Resume' }))
    expect(posts[0].body).toEqual({ action: 'resume', id: 'k' })
  })
})
