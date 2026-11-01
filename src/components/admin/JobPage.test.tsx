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

const view = (over: Partial<NightKindView>): NightKindView => ({ id: 'times', name: 'Minyan times', about: '', when: '3:00 AM', count: '15 of 16 read', trouble: null, misses: [], tracked: [], nights: [], fixes: [], lastAt: '2026-10-31T07:00:00Z', schedule: 'Runs every night at 3:00 AM', ...over })
const TIMES = view({
  misses: [{ name: 'Lower Merion Synagogue', why: 'Page didn’t open, 3 nights', page: 'place/l' }],
  tracked: ['Bnai Abraham', 'Kesher Israel', 'Mekor Habracha'].map((name) => ({ name, status: 'Read', bad: false, page: `place/${name}` })),
  nights: [{ date: 'Oct 30', result: '15 of 16 read', tone: 'bad' }, { date: 'Oct 27', result: '16 of 16 read', tone: 'good' }],
})

const posts: Record<string, unknown>[] = []
function serve(kinds: NightKindView[], off: string[] = []) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)))
      return { ok: true }
    }
    if (String(url).includes('/api/admin/watches/runs')) return { available: true, kinds, off }
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

describe('a job, opened', () => {
  it('says how last night went and when it runs', async () => {
    serve([TIMES])
    show('times')
    expect(await screen.findByText('Last night: 15 of 16 read')).toBeInTheDocument()
    expect(screen.getByText('Runs every night at 3:00 AM')).toBeInTheDocument()
  })

  it('Eruvs says what it doesn’t read at night (EruvJob6)', async () => {
    serve([view({ id: 'eruvs', name: 'Eruvs', schedule: 'Maps, hotlines and alerts, every night at 3:00 AM', scheduleMore: 'Status, when someone looks' })])
    show('eruvs')
    expect(await screen.findByText('Maps, hotlines and alerts, every night at 3:00 AM')).toBeInTheDocument()
    expect(screen.getByText('Status, when someone looks')).toBeInTheDocument()
  })

  it('links what it didn’t read to the place, and marks each night with a check or an X', async () => {
    serve([TIMES])
    show('times')
    const missed = await screen.findByRole('region', { name: 'Not read last night' })
    expect(within(missed).getByRole('link')).toHaveAttribute('href', '/philly/admin/watches/place/l?from=job/times')
    const nights = screen.getByRole('region', { name: 'Last 14 nights' })
    expect(within(nights).getByRole('img', { name: '15 of 16 read' })).toBeInTheDocument()
    expect(within(nights).getByRole('img', { name: '16 of 16 read' })).toBeInTheDocument()
  })

  it('shows two of what it tracks until asked for them all', async () => {
    serve([TIMES])
    show('times')
    const all = await screen.findByRole('region', { name: 'All 3 tracked' })
    expect(within(all).queryByText('Mekor Habracha')).toBeNull()
    await userEvent.click(within(all).getByRole('button', { name: 'Show all 3' }))
    expect(within(all).getByText('Mekor Habracha')).toBeInTheDocument()
  })

  // The Eruvs job's button opened the kind page, which listed them all; an
  // eruv with no website is on no watch, so only this reaches it now.
  it('Eruvs lists every eruv, with or without a website, each opening on its own', async () => {
    const kinds = [view({ id: 'eruvs', name: 'Eruvs', tracked: [{ name: 'Lower Merion', status: 'Read', bad: false, page: 'place/lm' }] })]
    vi.mocked(fetchJson).mockImplementation(async (url) => {
      if (String(url).includes('/api/admin/watches/runs')) return { available: true, kinds, off: [] }
      if (String(url).includes('/api/admin/watches/eruv')) return { available: true, timezone: 'America/New_York', eruvim: [{ id: 'lm', name: 'Lower Merion' }, { id: 'ne', name: 'Northeast' }], findings: [], watches: [] }
      if (String(url).includes('/api/admin/categories')) return { categories: [{ id: 'eruv-information', kind: 'eruv', pluralLabel: 'Eruv Information' }] }
      if (String(url).includes('/api/admin/listings')) return { places: [] }
      throw new Error('down')
    })
    show('eruvs')
    expect(await screen.findByRole('link', { name: /Northeast/ })).toHaveAttribute('href', '/philly/admin/watches/place/ne?from=job/eruvs')
    expect(screen.getByRole('link', { name: /Lower Merion/ })).toHaveAttribute('href', '/philly/admin/watches/place/lm?from=job/eruvs')
    // Eruvs are added in their category's editor; a bare id opens the list.
    expect(screen.getByRole('link', { name: '+ Add an eruv' })).toHaveAttribute('href', '/philly/admin/categories/cat:eruv-information')
  })

  it('a job not yet set up says its step, and adds from its header', async () => {
    serve([])
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
    expect(screen.getByText('Turn off Minyan times? 3 places won’t be checked.')).toBeInTheDocument()
    expect(posts).toEqual([])
    await u.click(screen.getByRole('button', { name: 'Leave it on' }))
    await u.click(screen.getByRole('button', { name: 'Turn off this job' }))
    await u.click(screen.getByRole('button', { name: 'Turn it off' }))
    expect(posts).toEqual([{ action: 'job-off', kind: 'times' }])
    expect(mockRouter.push).toHaveBeenCalledWith('/philly/admin/watches')
  })

  it('one already off has no Turn off', async () => {
    serve([TIMES], ['times'])
    show('times')
    await screen.findByText('Last night: 15 of 16 read')
    expect(screen.queryByRole('button', { name: 'Turn off this job' })).toBeNull()
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
