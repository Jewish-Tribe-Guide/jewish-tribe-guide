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
    if (String(url).includes('/api/admin/categories')) return { categories: [] }
    if (String(url).includes('/api/admin/listings')) return { places: [] }
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

describe('a Watches row, opened (board W4)', () => {
  it('is titled as its Watches row, and says when it last read', async () => {
    serve([TIMES])
    show('times')
    expect(await screen.findByRole('heading', { name: 'Minyan times' })).toBeInTheDocument()
    expect(screen.getByText('Read every night · last night')).toBeInTheDocument()
  })

  it('a job that didn’t run says so instead', async () => {
    serve([view({ fixes: [{ name: 'Minyan times', page: '', why: 'Didn’t run since Nov 20', whole: true }], tracked: TIMES.tracked })])
    show('times')
    expect(await screen.findByText('Didn’t run since Nov 20')).toBeInTheDocument()
  })

  it('lists the shuls with nothing to read, and why, each opening the place', async () => {
    serve([TIMES])
    show('times')
    const missing = await screen.findByRole('region', { name: 'Nothing to read · 2' })
    expect(within(missing).getByRole('link', { name: /Leyv Ha-Ir/ })).toHaveAttribute('href', '/philly/admin/watches/place/leyv?from=job/times')
    expect(within(missing).getByText('No website')).toBeInTheDocument()
    expect(within(missing).getByText('Its website wouldn’t open: 503')).toBeInTheDocument()
  })

  it('lists what’s read, from where, six until asked for all', async () => {
    serve([TIMES])
    show('times')
    const read = await screen.findByRole('region', { name: 'Read · 7' })
    expect(within(read).getByRole('link', { name: /Mekor Habracha/ })).toHaveTextContent('Website and emails')
    expect(within(read).queryByText('Shul F')).toBeNull()
    await userEvent.click(within(read).getByRole('button', { name: 'Show all 7' }))
    expect(within(read).getByText('Shul F')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Last 14 nights' })).toBeNull()
  })

  it('Eruv up or down lists every eruv, one with no source under Nothing to read', async () => {
    const kinds = [view({ id: 'eruvs', name: 'Eruvs', tracked: [{ name: 'Lower Merion', status: 'Read', bad: false, page: 'place/lm' }] })]
    serve(kinds, [], (url) => {
      if (url.includes('/api/admin/watches/eruv')) return { available: true, timezone: 'America/New_York', eruvim: [{ id: 'lm', name: 'Lower Merion', statusUrl: 'https://lm.org', statusEmail: null, statusErrorAt: null }, { id: 'ne', name: 'Northeast', statusUrl: null, statusEmail: null, statusErrorAt: null }], findings: [], watches: [] }
      if (url.includes('/api/admin/categories')) return { categories: [{ id: 'eruv-information', kind: 'eruv', pluralLabel: 'Eruv Information' }] }
    })
    show('eruvs')
    expect(await screen.findByRole('heading', { name: 'Eruv up or down' })).toBeInTheDocument()
    const missing = await screen.findByRole('region', { name: 'Nothing to read · 1' })
    expect(within(missing).getByRole('link', { name: /Northeast/ })).toHaveAttribute('href', '/philly/admin/watches/place/ne?from=job/eruvs')
    expect(within(screen.getByRole('region', { name: 'Read · 1' })).getByRole('link', { name: /Lower Merion/ })).toHaveTextContent('Status page')
    // Eruvs are added in Places, like any place (Nov 9).
    expect(screen.getByRole('link', { name: '+ Add an eruv' })).toHaveAttribute('href', '/philly/admin/places?add=eruv-information')
  })

  it('a job not yet set up says its step, and adds from its header', async () => {
    serve([], [], (url) => (url.includes('/api/admin/watches/hours') ? { name: 'Shul times', places: [] } : undefined))
    show('times')
    expect(await screen.findByText('Add each shul’s times page')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '+ Add a shul' }))
    expect(screen.getByLabelText('Which shul')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add it' })).toBeDisabled()
  })

  it('stops a kosher list and reads a stopped one again', async () => {
    serve([view({ id: 'kosher', name: 'Kosher certification', tracked: [{ name: 'Keystone-K’s list', status: 'Read', bad: false, page: '', watch: { id: 'k', active: true } }, { name: 'Mekor’s list', status: 'Stopped', bad: false, page: '', watch: { id: 'm', active: false } }] })])
    show('kosher')
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Stop' }))
    await u.click(await screen.findByRole('button', { name: 'Read again' }))
    expect(posts).toEqual([{ action: 'pause', id: 'k' }, { action: 'resume', id: 'm' }])
  })

  it('turning it off says what it costs first, and can be left on', async () => {
    serve([TIMES])
    show('times')
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Turn off this job' }))
    expect(screen.getByText('Turn off Minyan times? 2 places won’t be checked.')).toBeInTheDocument()
    expect(posts).toEqual([])
    await u.click(screen.getByRole('button', { name: 'Leave it on' }))
    await u.click(screen.getByRole('button', { name: 'Turn off this job' }))
    await u.click(screen.getByRole('button', { name: 'Turn it off' }))
    expect(posts).toEqual([{ action: 'job-off', kind: 'times' }])
    expect(mockRouter.push).toHaveBeenCalledWith('/philly/admin/watches')
  })

  it('one already off says so, and turns back on from here', async () => {
    serve([TIMES], ['times'])
    show('times')
    expect(await screen.findByText('Turned off')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn off this job' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Turn it back on' }))
    expect(posts).toEqual([{ action: 'job-on', kind: 'times' }])
    expect(mockRouter.push).toHaveBeenCalledWith('/philly/admin/watches')
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
