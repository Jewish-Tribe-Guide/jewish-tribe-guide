// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ForcedViewport } from '@/lib/useIsMobile'
import { fetchJson } from '@/lib/fetchJson'
import type { AdminEruv } from '@/lib/eruvStore'
import type { EruvFinding, EruvJobLoaded } from '@/lib/eruvJob'
import type { Watch } from '@/lib/watches'
import EruvJob, { eruvSay } from './EruvJob'
import { day } from './JobPage'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/eruv',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString()
const READ = ago(2)
const today = () => day(new Date().toISOString())

const BASE: AdminEruv = {
  id: 'x', name: 'x', covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false,
  status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null,
  lineUrl: null, sortOrder: 1, active: true, rawLine: null, lineReadAt: null, lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null,
  statusEmail: null, statusEmailKept: null,
}
const up = { status: 'up' as const, statusWords: 'The eruv is up', statusCheckedAt: READ }
// Board 1: its website has a new hotline; its status page is its website.
const LOWER_MERION: AdminEruv = {
  ...BASE, id: 'lower-merion', name: 'Lower Merion Eruv', covers: 'Bala Cynwyd', website: 'https://lowermerioneruv.org/', hotline: '(610) 664-5626, option 3',
  statusUrl: 'https://lowermerioneruv.org/', ...up, lineUrl: 'https://www.google.com/maps/d/kml?mid=lm', lineReadAt: READ,
}
// Board 3: no status source.
const NORTHEAST: AdminEruv = { ...BASE, id: 'northeast', name: 'Northeast Eruv', website: 'https://neeruv.org/' }
// Board 4: its map didn't load.
const UNIVERSITY: AdminEruv = { ...BASE, id: 'uc', name: 'University City Eruv', website: 'https://pennocp.org/', statusUrl: 'https://pennocp.org/eruv', ...up, lineUrl: 'https://maps/uc.kml', lineError: 'The map answered 404' }
// Checked: up, and an email eruv that has sent nothing yet.
const CENTER_CITY: AdminEruv = { ...BASE, id: 'center-city', name: 'Center City Eruv', statusUrl: 'https://centercityeruv.com/status', ...up }
const ELKINS: AdminEruv = { ...BASE, id: 'elkins', name: 'Elkins Park Eruv', statusEmail: 'eruv@yiep.org', statusEmailed: true }

const watch = (id: string, url: string, over: Partial<Watch> = {}): Watch =>
  ({ id, communityId: 'philly', kind: 'website', url, active: true, lastRunAt: READ, lastOkAt: READ, lastError: null, failingSince: null, lastCheck: null, createdBy: 'eruv website', ...over }) as Watch
const FINDING: EruvFinding = { id: 's-lm', eruvId: 'lower-merion', at: READ, hotline: '(610) 555-0199', alertsUrl: null }

const posts: { url: string; method: string; body: Record<string, unknown> }[] = []
async function renderPage(over: Partial<EruvJobLoaded> = {}, reply: (body: Record<string, unknown>) => Record<string, unknown> = () => ({}), mobile = false) {
  const data: EruvJobLoaded = {
    available: true,
    timezone: 'America/New_York',
    eruvim: [LOWER_MERION, NORTHEAST, UNIVERSITY, CENTER_CITY, ELKINS],
    findings: [FINDING],
    watches: [watch('w-lm', 'https://lowermerioneruv.org/'), watch('w-ne', 'https://neeruv.org/'), watch('w-uc', 'https://pennocp.org/')],
    ...over,
  }
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body))
      posts.push({ url: String(url), method: init.method, body })
      if (String(url).startsWith('/api/admin/watches?')) {
        const w = data.watches.find((x) => x.id === body.id)!
        return { ok: true, watch: { ...w, active: body.action === 'pause' ? false : body.action === 'resume' ? true : w.active } }
      }
      if (String(url).startsWith('/api/admin/eruvim')) {
        const e = data.eruvim.find((x) => x.id === body.id)!
        return { ok: true, eruv: { ...e, ...((body.edit as object) ?? {}) }, ...reply(body) }
      }
      return { ok: true }
    }
    return { ok: true, ...data }
  })
  renderWithProviders(
    <ForcedViewport isMobile={mobile}>
      <EruvJob token="tok" />
    </ForcedViewport>,
    { community: { slug: 'philly' } },
  )
  await screen.findByTestId('job-counts')
}
const user = () => userEvent.setup()
const rows = () => screen.getAllByTestId('job-row')
const rowOf = (name: string) => rows().find((r) => within(r).queryAllByText(name).length) as HTMLElement
const pill = (name: string) => within(rowOf(name)).getByTestId('job-status').textContent
/** On the tab showing. */
const shown = (name: string) => screen.queryAllByTestId('job-row').some((r) => within(r).queryAllByText(name).length > 0)
const open = (name: string) => user().click(within(rowOf(name)).getAllByRole('button')[0])
const tab = (name: string) => user().click(screen.getByRole('tab', { name: new RegExp(`^${name} \\d+$`) }))
const placeOf = (name: string) => screen.getByRole('region', { name })
const boxList = (name: string) =>
  within(placeOf(name))
    .getAllByRole('region')
    .map((b) => `${b.getAttribute('aria-label')} | ${within(b).queryByTestId('box-pill')?.textContent ?? ''} | ${within(b).getAllByRole('button')[0].getAttribute('aria-expanded')}`)
const box = (name: string, label: string) => within(placeOf(name)).getByRole('region', { name: label })
const marked = (b: HTMLElement) => within(b).getAllByTestId('box-row').map((r) => `${r.dataset.mark}: ${r.textContent}`)
const sources = (b: HTMLElement) => within(b).getAllByTestId('job-source').map((s) => s.textContent)

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.resetAllMocks()
})

describe('Eruv status', () => {
  it('says how many have an update from their website; three tabs; each row’s pill says why it’s there', async () => {
    await renderPage()
    expect(screen.getByTestId('job-counts').textContent).toBe('1 eruv has an update from its website.')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['To check 1', 'Can’t be read 2', 'Checked 2'])
    expect(rows().map((r) => within(r).getAllByRole('button')[0].textContent)).toEqual(['Lower Merion Eruv1 update›'])
    await tab('Can’t be read')
    expect([pill('Northeast Eruv'), pill('University City Eruv')]).toEqual(['No status', 'Map didn’t load'])
    await tab('Checked')
    expect([pill('Center City Eruv'), pill('Elkins Park Eruv')]).toEqual(['Up', 'No word yet'])
    expect(screen.getByRole('link', { name: '‹ Watches' })).toHaveAttribute('href', '/philly/admin/watches')
    expect([eruvSay(0), eruvSay(2)]).toEqual(['No eruv has an update from its website.', '2 eruvim have an update from their websites.'])
  })

  it('opened from To check: Details with what it was, Status as visitors see it, Map, then Reads', async () => {
    await renderPage()
    await open('Lower Merion Eruv')
    expect(boxList('Lower Merion Eruv')).toEqual(['Details | 1 change | true', 'Status | Up | true', 'Map | Live | false', 'Reads | 2 pages | true'])
    const details = box('Lower Merion Eruv', 'Details')
    expect(marked(details)).toEqual(['same: Where it goesBala Cynwyd', 'same: Websitelowermerioneruv.org', 'changed: Hotline(610) 555-0199(610) 664-5626, option 3'])
    expect(within(details).getAllByRole('button').slice(1).map((b) => b.textContent)).toEqual(['Use this', 'Edit', 'Keep the listing'])
    expect(within(details).getByTestId('box-source').textContent).toBe(`From its website · read ${day(READ)}`)
    const status = box('Lower Merion Eruv', 'Status')
    expect(within(status).queryByRole('button', { name: 'Use this' })).toBeNull()
    expect(within(status).getByTestId('box-source').textContent).toMatch(/^From its status page · read .+ · on the site at once$/)
    // The status page is its website: one line for both.
    expect(sources(box('Lower Merion Eruv', 'Reads'))).toEqual([
      expect.stringMatching(/^lowermerioneruv\.orgStatus page · Status, Detailsread /),
      `google.com/maps/d/kml?mid=lmMapread ${day(READ)}`,
    ])
  })

  it('on a phone, Reads starts shut on To check', async () => {
    await renderPage({}, undefined, true)
    await open('Lower Merion Eruv')
    expect(boxList('Lower Merion Eruv')).toEqual(['Details | 1 change | true', 'Status | Up | true', 'Map | Live | false', 'Reads | 2 pages | false'])
  })

  it('Use this takes only the rows it changes; Keep the listing rejects it; either says so where it was', async () => {
    const second = { ...LOWER_MERION, id: 'narberth', name: 'Narberth Eruv' }
    await renderPage({ eruvim: [LOWER_MERION, second], findings: [FINDING, { ...FINDING, id: 's-n', eruvId: 'narberth' }] })
    await open('Lower Merion Eruv')
    await user().click(within(box('Lower Merion Eruv', 'Details')).getByRole('button', { name: 'Use this' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-lm?community=philly', method: 'PATCH', body: { status: 'approved', only: ['hotline'] } })
    // Nothing left to decide: straight to Checked (the user, Oct 22).
    expect(shown('Lower Merion Eruv')).toBe(false)
    await open('Narberth Eruv')
    await user().click(within(box('Narberth Eruv', 'Details')).getByRole('button', { name: 'Keep the listing' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-n?community=philly', method: 'PATCH', body: { status: 'rejected' } })
    expect(shown('Narberth Eruv')).toBe(false)
    expect(screen.getByTestId('job-counts').textContent).toBe('No eruv has an update from its website.')
    await tab('Checked')
    expect(pill('Narberth Eruv')).toBe(`Kept ${today()}`)
    expect(pill('Lower Merion Eruv')).toBe(`Used ${today()}`)
    await open('Lower Merion Eruv')
    expect(within(box('Lower Merion Eruv', 'Details')).getByTestId('box-pill').textContent).toBe(`Used ${today()}`)
    expect(within(box('Lower Merion Eruv', 'Details')).queryByRole('button', { name: 'Use this' })).toBeNull()
  })

  it('Edit: the eruv’s own form, filled with its website’s, saved to the listing', async () => {
    await renderPage()
    await open('Lower Merion Eruv')
    await user().click(within(box('Lower Merion Eruv', 'Details')).getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const hotline = within(dialog).getByDisplayValue('(610) 555-0199')
    await user().clear(hotline)
    await user().type(hotline, '(610) 555-0199, option 2')
    await user().click(within(dialog).getByRole('button', { name: 'Save to the listing' }))
    expect(posts.at(-1)).toEqual({
      url: '/api/admin/submissions/s-lm?community=philly',
      method: 'PATCH',
      body: { status: 'approved', payload: { covers: 'Bala Cynwyd', website: 'https://lowermerioneruv.org/', hotline: '(610) 555-0199, option 2', alertsUrl: '' } },
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(shown('Lower Merion Eruv')).toBe(false))
    await tab('Checked')
    expect(pill('Lower Merion Eruv')).toBe(`Used ${today()}`)
  })

  it('Reads: × asks first, then stops reading; its switch pauses its website', async () => {
    await renderPage()
    await tab('Can’t be read')
    await open('University City Eruv')
    expect(boxList('University City Eruv')).toEqual(['Status | Up | false', 'Details | Same | false', 'Map | Didn’t load | false', 'Reads | 3 pages | true'])
    const reads = box('University City Eruv', 'Reads')
    expect(sources(reads)).toEqual([
      expect.stringMatching(/^pennocp\.org\/eruvStatus pageread /),
      'maps/uc.kmlMapdidn’t load',
      `pennocp.orgWebsite · Detailsread ${day(READ)}`,
    ])
    await user().click(within(reads).getByRole('button', { name: 'Stop reading maps/uc.kml' }))
    expect(posts).toEqual([])
    expect(reads).toHaveTextContent('Stop reading University City Eruv’s map?')
    await user().click(within(reads).getByRole('button', { name: 'Stop reading' }))
    expect(posts.map((p) => p.body)).toEqual([{ id: 'uc', action: 'save', edit: { lineUrl: '' } }])
    // No map that didn't load now: to Checked.
    expect(shown('University City Eruv')).toBe(false)
    await tab('Checked')
    await open('University City Eruv')
    const now = box('University City Eruv', 'Reads')
    await user().click(within(now).getAllByRole('button')[0])
    await user().click(within(now).getByRole('switch'))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches?community=philly', method: 'POST', body: { action: 'pause', id: 'w-uc' } })
    expect(within(now).getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('no status: Find its status page, and read from the one the admin picks', async () => {
    const found = { url: 'https://neeruv.org/status', link: 'Status', status: 'up', words: 'The eruv is up.' }
    await renderPage({}, (body) => (body.action === 'find' ? { found: [found], error: null } : {}))
    await tab('Can’t be read')
    await open('Northeast Eruv')
    expect(boxList('Northeast Eruv')).toEqual(['Status | No source | false', 'Details | Same | false', 'Map | None | false', 'Reads | 1 page | true'])
    const reads = box('Northeast Eruv', 'Reads')
    expect(within(reads).getAllByRole('button').slice(2).map((b) => b.textContent)).toEqual(['Find its status page', 'Add a page', 'Add its emails', 'Read them now'])
    await user().click(within(reads).getByRole('button', { name: 'Find its status page' }))
    const offered = await within(reads).findByTestId('eruv-found')
    expect(offered).toHaveTextContent('Its “Status” page, neeruv.org/status, says it’s up')
    await user().click(within(offered).getByRole('button', { name: 'Read its status from here' }))
    expect(posts.map((p) => p.body)).toEqual([
      { id: 'northeast', action: 'find' },
      { id: 'northeast', action: 'save', edit: { statusUrl: 'https://neeruv.org/status', statusEmail: '', statusDated: false } },
      { id: 'northeast', action: 'check' },
    ])
  })

  it('Read them now reads its status, its map and its website', async () => {
    await renderPage()
    await open('Lower Merion Eruv')
    await user().click(within(box('Lower Merion Eruv', 'Reads')).getByRole('button', { name: 'Read them now' }))
    expect(posts.map((p) => [p.url, p.body])).toEqual([
      ['/api/admin/eruvim?community=philly', { id: 'lower-merion', action: 'check' }],
      ['/api/admin/watches?community=philly', { action: 'check', id: 'w-lm' }],
    ])
  })

  it('an eruv with no website still stops reading its status', async () => {
    await renderPage()
    await tab('Checked')
    await open('Center City Eruv')
    const reads = box('Center City Eruv', 'Reads')
    await user().click(within(reads).getAllByRole('button')[0])
    await user().click(within(reads).getByRole('button', { name: 'Stop reading centercityeruv.com/status' }))
    await user().click(within(reads).getByRole('button', { name: 'Stop reading' }))
    expect(posts.map((p) => p.body)).toEqual([{ id: 'center-city', action: 'save', edit: { statusUrl: '', statusEmail: '' } }])
  })
})
