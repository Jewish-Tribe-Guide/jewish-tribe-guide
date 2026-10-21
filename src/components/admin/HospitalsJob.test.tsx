// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { Watch, WatchCheck } from '@/lib/watches'
import HospitalsJob, { type Hospital } from './HospitalsJob'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/hospitals',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const check = (result: WatchCheck['result'], over: Partial<WatchCheck> = {}): WatchCheck => ({ at: ago(0.1), what: 'contacts', from: null, result, read: [], differences: [], queue: null, ...over })
const watch = (over: Partial<Watch>): Watch =>
  ({ id: 'w', communityId: 'philly', kind: 'website', url: 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5', active: true, lastRunAt: ago(0.1), lastOkAt: ago(0.1), lastError: null, failingSince: null, lastCheck: null, ...over }) as Watch
const hospital = (over: Partial<Hospital>): Hospital => ({
  id: 'h',
  name: 'Hospital',
  href: '/philly/hospital/hospital-h',
  watch: null,
  notOnRefuah: false,
  source: 'match',
  line: 'Matched to Refuah’s Hospital, 1 Main St · same spot on the map',
  refuah: null,
  nearby: [],
  pending: 0,
  ...over,
})

const HUP = hospital({ id: 'hup', name: 'Hospital of the University of Pennsylvania', watch: watch({ id: 'w-hup', lastCheck: check('agrees', { read: ['12 contacts on Refuah'] }) }) })
const CHOP = hospital({ id: 'chop', name: 'Children’s Hospital of Philadelphia', pending: 1, watch: watch({ id: 'w-chop', lastCheck: check('differs', { differences: ['Liaisons: Bikur Cholim’s phone is 215-555-0100 on Refuah'], queue: 'filed' }) }) })
const PA = hospital({ id: 'pa', name: 'Pennsylvania Hospital', watch: watch({ id: 'w-pa', lastCheck: check('nothing') }) })
const SHRINERS = hospital({
  id: 'shriners',
  name: 'Shriners Children’s Philadelphia',
  source: null,
  line: 'Not found on Refuah. The nearest hospital on Refuah is 1.4 mi away, too far to be this one.',
  nearby: [{ id: 'jx7a', name: 'Temple University Hospital', street: '3401 N Broad St', url: 'https://refuah.com/hospitals/jx7a', miles: 1.4 }],
})

const posts: { url: string; body: Record<string, unknown> }[] = []
async function renderPage(hospitals: Hospital[], post: (body: Record<string, unknown>) => Record<string, unknown> = () => ({})) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posts.push({ url: String(url), body })
      return { ok: true, ...post(body) }
    }
    return { ok: true, available: true, refuahError: null, hospitals }
  })
  renderWithProviders(<HospitalsJob token="tok" />, { community: { slug: 'philly' } })
  await screen.findByTestId('hospital-counts')
}
const region = (name: RegExp) => screen.getByRole('region', { name })
const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement
const open = (name: string) => userEvent.setup().click(within(rowOf(name)).getAllByRole('button')[0])

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.resetAllMocks()
})

describe('HospitalsJob', () => {
  it('groups the hospitals by what their last read found, with the counts the Watches row shows', async () => {
    await renderPage([HUP, CHOP, PA, SHRINERS])
    expect(screen.getByTestId('hospital-counts').textContent).toBe('1 checked · 1 to check · 1 nothing on Refuah yet · 1 can’t be read')
    expect(within(region(/^Checked/)).getByText(HUP.name)).toBeInTheDocument()
    expect(within(region(/^Checked/)).getByText(/Read .*: 12 contacts on Refuah, all on the listing\./)).toBeInTheDocument()
    expect(within(region(/^To check/)).getByText(/1 difference from the listing, in the moderation queue\./)).toBeInTheDocument()
    expect(within(region(/^Can’t be read/)).getByText(/too far to be this one/)).toBeInTheDocument()
    // Nothing on Refuah yet is quiet: closed until asked.
    expect(screen.queryByText(PA.name)).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show Nothing on Refuah yet' }))
    await open(PA.name)
    expect(screen.getByRole('link', { name: 'Fill it in yourself' })).toHaveAttribute('href', PA.href)
    expect(screen.getByRole('link', { name: '‹ Watches' })).toHaveAttribute('href', '/philly/admin/watches')
  })

  it('a difference says what it is and where to settle it', async () => {
    await renderPage([CHOP])
    await open(CHOP.name)
    expect(screen.getByText(/Bikur Cholim’s phone is 215-555-0100 on Refuah/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Approve or reject it in the moderation queue' })).toHaveAttribute('href', '/philly/admin')
  })

  it('one not found: pick a nearby Refuah hospital, or say it isn’t on Refuah', async () => {
    await renderPage([SHRINERS])
    await open(SHRINERS.name)
    await userEvent.setup().click(screen.getByRole('button', { name: /Temple University Hospital, 3401 N Broad St/ }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/hospitals?community=philly', body: { resourceId: 'shriners', action: 'choose', url: 'https://refuah.com/hospitals/jx7a' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Not on Refuah' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'shriners', action: 'off' })
  })

  it('a match can be checked now, given a different Refuah hospital, or turned off and back on', async () => {
    const found = check('differs', { differences: ['Main: the phone is 215-555-0199 on Refuah'], queue: 'filed' })
    await renderPage([HUP], (body) => (body.action === 'check' ? { watch: { ...HUP.watch, lastCheck: found } } : body.action === 'off' ? { watch: { ...HUP.watch, active: false }, notOnRefuah: false } : {}))
    await open(HUP.name)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Check now' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches?community=philly', body: { resourceId: 'hup', action: 'check', id: 'w-hup' } })
    // It stays where it was, saying what the read found.
    expect(within(region(/^Checked/)).getByText(/1 difference from the listing, in the moderation queue\./)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose a different Refuah hospital' }))
    await userEvent.setup().type(screen.getByPlaceholderText('refuah.com/hospitals/…'), 'refuah.com/hospitals/jx7other')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save and read' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'hup', action: 'choose', url: 'refuah.com/hospitals/jx7other' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Turn off' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'hup', action: 'off' })
    expect(within(region(/^Checked/)).getByText('Turned off: not read.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn back on' })).toBeInTheDocument()
  })

  it('one turned off is in Off, saying why, with Turn back on', async () => {
    await renderPage([hospital({ id: 'x', name: 'Off Hospital', watch: watch({ active: false }) }), hospital({ id: 'y', name: 'Not Listed', source: null, notOnRefuah: true })])
    expect(screen.getByTestId('hospital-counts').textContent).toContain('2 off')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show Off' }))
    expect(within(rowOf('Off Hospital')).getByText('Turned off: not read.')).toBeInTheDocument()
    expect(within(rowOf('Not Listed')).getByText('Said not to be on Refuah.')).toBeInTheDocument()
    await open('Not Listed')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Turn back on' }))
    expect(posts.at(-1)!.body).toEqual({ resourceId: 'y', action: 'on' })
  })
})
