// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { NightKindView } from '@/lib/nightKinds'
import AddWatchPage from './AddWatchPage'
import JobPage from './JobPage'
import { forgetWatchJobs } from './useWatchJobs'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/job/times',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const lastNight = new Date(Date.now() - 3_600_000).toISOString()
const view = (over: Partial<NightKindView>): NightKindView => ({ id: 'times', name: 'Shul times', about: '', when: '3:00 AM', count: '15 of 16 read', trouble: null, misses: [], tracked: [], nights: [], fixes: [], lastAt: lastNight, schedule: 'Runs every night at 3:00 AM', ...over })
const TIMES = view({ tracked: ['Kesher', 'Mekor'].map((name) => ({ name, status: 'Read', bad: false, page: `place/${name}` })) })
const KOSHER = view({ id: 'kosher', tracked: [
  { name: 'Keystone-K’s list', status: 'Read Nov 27', bad: false, page: '', watch: { id: 'k', active: true, url: 'https://keystone-k.org/list' } },
  { name: 'KCL’s list', status: 'Read Nov 27', bad: false, page: '', watch: { id: 'kcl', active: true, url: 'https://www.kcl.org/list' } },
] })
const shul = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, name, href: '', website: null, pages: [], off: false, offSince: null, reason: null, fields: [], ...over })
const page = { watch: { active: true }, source: 'https://x.org' }
const email = { active: true, pageChangedAt: lastNight }
const SHULS = [
  shul('leyv', 'Leyv Ha-Ir', { reason: 'No website on Google.' }),
  shul('kesher', 'Kesher Israel', { pages: [page], reason: 'Its website wouldn’t open: 503' }),
  shul('mekor', 'Mekor Habracha', { pages: [page], newsletters: [email] }),
  ...['A', 'B', 'C', 'D', 'E', 'F'].map((n) => shul(n, `Shul ${n}`, { pages: [page] })),
]

const posts: Record<string, unknown>[] = []
function serve(kinds: NightKindView[], off: string[] = [], more: (url: string) => unknown = () => undefined) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)))
      return { ok: true }
    }
    const got = more(String(url))
    if (got) return got
    if (String(url).includes('/api/admin/watches/runs')) return { available: true, kinds, off }
    if (String(url).includes('/api/admin/watches/hours') && String(url).includes('job=times')) return { name: 'Shul times', places: SHULS }
    if (String(url).includes('/api/admin/categories')) return { categories: [{ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] }] }
    if (String(url).includes('/api/admin/listings')) return { places: SHULS.map((p) => ({ id: p.id, name: p.name, category: 'synagogue', status: 'approved' })) }
    throw new Error('down')
  })
}
const show = (id: string) => renderWithProviders(<JobPage token="tok" id={id} />, { community: { slug: 'philly' } })

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.mocked(fetchJson).mockReset()
  vi.mocked(mockRouter.push).mockClear?.()
  forgetWatchJobs()
})

describe('a job on Watches, opened (boards L2b, L2f)', () => {
  it('is its name, the Watching card with its line, and From, plain rows: what it reads, not links (Nov 28)', async () => {
    serve([TIMES])
    show('times')
    expect(await screen.findByRole('heading', { name: 'Minyan times' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Minyan times on' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('watching-line')).toHaveTextContent('From each shul’s website or newsletter.')
    // Running well, it says nothing more.
    expect(screen.queryByTestId('watching-state')).toBeNull()
    const from = screen.getByRole('region', { name: 'From' })
    expect(within(from).getAllByTestId('job-source').map((r) => r.textContent)).toEqual(['Website', 'Newsletter'])
    expect(within(from).queryByRole('link')).toBeNull()
    expect(within(from).queryByRole('button')).toBeNull()
    // The places it covers are Places' Watch filter now.
    expect(screen.queryByRole('region', { name: /Nothing to read|Read ·/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Turn off|\+ Add a shul/ })).toBeNull()
  })

  it('a job that didn’t run says so on its card', async () => {
    serve([view({ fixes: [{ name: 'Minyan times', page: '', why: 'Didn’t run since Nov 20', whole: true }], tracked: TIMES.tracked })])
    show('times')
    expect(await screen.findByTestId('watching-state')).toHaveTextContent('Didn’t run since Nov 20')
  })

  it('one with nothing read and no run yet says when it runs, and keeps its line (L2f)', async () => {
    serve([view({ lastAt: null, tracked: [] })])
    show('times')
    expect(await screen.findByTestId('watching-state')).toHaveTextContent(/^Runs once the first shul has a website or newsletter$/)
    expect(screen.getByTestId('watching-line')).toHaveTextContent('From each shul’s website or newsletter.')
  })

  it('the switch turns off both its jobs at once, nothing asked, and From stays', async () => {
    // Last read: the later of its two jobs.
    serve([{ ...TIMES, lastAt: '2026-11-26T12:00:00Z' }, view({ id: 'newsletters', lastAt: '2026-11-27T12:00:00Z' })])
    show('times')
    const u = userEvent.setup()
    await u.click(await screen.findByRole('switch', { name: 'Minyan times on' }))
    expect(posts).toEqual([{ action: 'job-off', kind: 'times' }, { action: 'job-off', kind: 'newsletters' }])
    expect(mockRouter.push).not.toHaveBeenCalled()
    expect(screen.getByRole('switch', { name: 'Minyan times on' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('watching-state')).toHaveTextContent(/^Off · last read Nov 27$/)
    expect(screen.getByRole('region', { name: 'From' })).toBeInTheDocument()
  })

  it('one already off turns back on from the same switch', async () => {
    serve([TIMES], ['times', 'newsletters'])
    show('times')
    const sw = await screen.findByRole('switch', { name: 'Minyan times on' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    expect(posts).toEqual([{ action: 'job-on', kind: 'times' }, { action: 'job-on', kind: 'newsletters' }])
  })

  it('a job’s other half opens the job it’s part of', async () => {
    serve([TIMES])
    show('newsletters')
    expect(await screen.findByRole('heading', { name: 'Minyan times' })).toBeInTheDocument()
    cleanup()
    forgetWatchJobs()
    serve([view({ id: 'google' })])
    show('sites')
    expect(await screen.findByRole('heading', { name: 'Basic information' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'From' })).getAllByTestId('job-source').map((a) => a.textContent)).toEqual(['Google', 'Its own website'])
  })

  it('Kosher certification: each list with its site and last read, Edit and Remove at its end, and Add (L2h)', async () => {
    serve([KOSHER])
    show('kosher')
    const rows = await screen.findAllByTestId('kosher-list')
    expect(rows.map((r) => r.textContent)).toEqual(['KCL’s listkcl.org · Read Nov 27', 'Keystone-K’s listkeystone-k.org · Read Nov 27'])
    expect(screen.getByTestId('watching-line')).toHaveTextContent('From each kosher agency’s list, every night.')
    // No Read now: the job reads every list each night.
    expect(screen.queryByRole('button', { name: /Read now/ })).toBeNull()
    expect(within(rows[0]).getByRole('button', { name: 'Edit KCL’s list' })).toHaveAttribute('data-action', 'edit')
    // A phone's swipe (Edit and Remove circles) needs a real browser: jsdom has no layout to swipe.
  })

  it('Edit reads the new address at once, in place of the old', async () => {
    serve([KOSHER])
    show('kosher')
    const u = userEvent.setup()
    await u.click((await screen.findAllByRole('button', { name: 'Edit KCL’s list' }))[0])
    const field = screen.getByTestId('kosher-list-field')
    expect(field).toHaveValue('https://www.kcl.org/list')
    await u.clear(field)
    await u.type(field, 'https://kcl.org/places')
    await u.click(screen.getByRole('button', { name: 'Done' }))
    expect(posts).toEqual([{ action: 'add', url: 'https://kcl.org/places', purpose: 'kosher' }, { action: 'remove', id: 'kcl' }])
  })

  it('Remove asks nothing, and Undo puts it back', async () => {
    serve([KOSHER])
    show('kosher')
    const u = userEvent.setup()
    await u.click((await screen.findAllByRole('button', { name: 'Remove KCL’s list' }))[0])
    expect(posts).toEqual([{ action: 'remove', id: 'kcl' }])
    expect(await screen.findByText(/removed$/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Undo' }))
    expect(posts.at(-1)).toEqual({ action: 'add', url: 'https://www.kcl.org/list', purpose: 'kosher' })
  })

  it('+ Add a kosher list reads the address given', async () => {
    serve([view({ id: 'kosher', lastAt: null, tracked: [] })])
    show('kosher')
    const u = userEvent.setup()
    expect(await screen.findByTestId('watching-state')).toHaveTextContent('Runs when a kosher list is added')
    await u.click(screen.getByRole('button', { name: 'Add a kosher list' }))
    await u.type(screen.getByTestId('kosher-list-field'), 'https://star-k.org/list')
    await u.click(screen.getByRole('button', { name: 'Add it' }))
    expect(posts).toEqual([{ action: 'add', url: 'https://star-k.org/list', purpose: 'kosher' }])
  })

  it('every job says what it reads under From', async () => {
    serve([view({ id: 'eruvs', name: 'Eruvs', tracked: [{ name: 'Lower Merion', status: 'Read', bad: false, page: 'place/lm' }] })])
    show('eruvs')
    expect(await screen.findByRole('heading', { name: 'Eruv status' })).toBeInTheDocument()
    expect(screen.getByTestId('watching-line')).toHaveTextContent('From the eruv’s website and emails.')
    expect(within(screen.getByRole('region', { name: 'From' })).getAllByTestId('job-source').map((r) => r.textContent)).toEqual(['Website', 'Email'])
    for (const [id, from] of [['menus', ['Website']], ['hours', ['Website']], ['hospitals', ['Refuah']]] as const) {
      cleanup()
      forgetWatchJobs()
      serve([view({ id })])
      show(id)
      await screen.findByTestId('watching-line')
      expect(within(screen.getByRole('region', { name: 'From' })).getAllByTestId('job-source').map((r) => r.textContent), id).toEqual(from)
    }
    cleanup()
    forgetWatchJobs()
    // Broken links opens any link on a listing, not only websites.
    serve([view({ id: 'links' })])
    show('links')
    await screen.findByTestId('watching-line')
    expect(within(screen.getByRole('region', { name: 'From' })).getAllByTestId('job-source').map((r) => r.textContent)).toEqual(['Links on each listing'])
  })
})

describe('Add a watch', () => {
  it('turns a job back on, and opens Other pages', async () => {
    serve([], ['google'])
    renderWithProviders(<AddWatchPage token="tok" />, { community: { slug: 'philly' } })
    expect((await screen.findByRole('link', { name: /Other pages/ })).getAttribute('href')).toBe('/philly/admin/watches/job/other')
    await userEvent.click(screen.getByRole('button', { name: /Google/ }))
    expect(posts).toEqual([{ action: 'job-on', kind: 'google' }])
  })
})
