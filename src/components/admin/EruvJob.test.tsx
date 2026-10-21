// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { AdminEruv } from '@/lib/eruvStore'
import EruvJob from './EruvJob'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/eruv',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

const NE: AdminEruv = {
  id: 'northeast', name: 'Northeast Eruv', covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false,
  status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null,
  lineUrl: null, sortOrder: 1, active: true, rawLine: null, lineReadAt: null, lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null,
  statusEmail: null, statusEmailKept: null,
}
const CC: AdminEruv = { ...NE, id: 'center-city', name: 'Center City Eruv', sortOrder: 2, website: 'https://centercityeruv.com/' }
const READ: AdminEruv = { ...NE, id: 'uc', name: 'University City Eruv', sortOrder: 3, statusUrl: 'https://pennocp.org/eruv', status: 'up', statusWords: 'The eruv is up', statusCheckedAt: ago(0.1) }

const posts: { url: string; body: Record<string, unknown> }[] = []
async function renderPage(eruvim: AdminEruv[], reply: (body: Record<string, unknown>) => Record<string, unknown> = () => ({})) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posts.push({ url: String(url), body })
      const eruv = eruvim.find((e) => e.id === body.id)!
      return { ok: true, eruv: { ...eruv, ...((body.edit as object) ?? {}) }, ...reply(body) }
    }
    return { ok: true, available: true, timezone: 'America/New_York', eruvim }
  })
  renderWithProviders(<EruvJob token="tok" />, { community: { slug: 'philly' } })
  await screen.findByTestId('eruv-counts')
}
const section = (name: string) => screen.getByRole('region', { name })
const row = (name: string) => screen.getAllByTestId('eruv-row').find((r) => r.textContent?.includes(name))!

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.mocked(fetchJson).mockReset()
})

describe('EruvJob', () => {
  it('puts each eruv where its source leaves it, with what it reads from', async () => {
    const failing = { ...READ, id: 'lm', name: 'Lower Merion Eruv', statusErrorAt: ago(0), statusError: 'The page answered 500' }
    await renderPage([NE, READ, failing])
    expect(screen.getByTestId('eruv-counts')).toHaveTextContent('1 read · 1 can’t be read · 1 didn’t load')
    expect(within(section('Can’t be read')).getByTestId('eruv-row')).toHaveTextContent('No source: the site shows no status for it.')
    expect(within(section('Didn’t load')).getByTestId('eruv-row')).toHaveTextContent('Its page didn’t load: The page answered 500.')
    expect(within(section('Read')).getByTestId('eruv-row')).toHaveTextContent('Read from its status page, pennocp.org/eruv')
    expect(screen.getByRole('link', { name: '‹ Watches' })).toHaveAttribute('href', '/philly/admin/watches')
  })

  // Moved from the Watches tab, where it was "Add a watch" (Oct 19).
  it('gives an eruv with no source its status emails, the other source emptied', async () => {
    await renderPage([NE])
    const user = userEvent.setup()
    const r = row('Northeast Eruv')
    // Opened already: nothing to read until it has a source.
    await user.type(within(r).getByLabelText(/Its status page, or the address its emails come from/), 'JCOR-NE-Philadelphia@groups.io')
    await user.click(within(r).getByRole('button', { name: 'Save' }))
    expect(posts.map((p) => p.body)).toEqual([{ id: 'northeast', action: 'save', edit: { statusEmail: 'JCOR-NE-Philadelphia@groups.io', statusUrl: '' } }])
    expect(await within(r).findByText('Read from its emails, from JCOR-NE-Philadelphia@groups.io')).toBeInTheDocument()
  })

  it('gives it a status page and reads it at once', async () => {
    await renderPage([NE])
    const user = userEvent.setup()
    const r = row('Northeast Eruv')
    await user.type(within(r).getByLabelText(/Its status page/), 'https://ne-eruv.org/status')
    await user.click(within(r).getByRole('checkbox', { name: /dates each week’s post/ }))
    await user.click(within(r).getByRole('button', { name: 'Save and read' }))
    expect(posts.map((p) => p.body)).toEqual([
      { id: 'northeast', action: 'save', edit: { statusUrl: 'https://ne-eruv.org/status', statusEmail: '', statusDated: true } },
      { id: 'northeast', action: 'check' },
    ])
  })

  it('won’t take what isn’t a web page or an email address', async () => {
    await renderPage([NE])
    await userEvent.setup().type(within(row('Northeast Eruv')).getByLabelText(/Its status page/), 'ftp://ne-eruv.org/status')
    expect(within(row('Northeast Eruv')).getByText('Give a web address, or an email address.')).toBeInTheDocument()
    expect(within(row('Northeast Eruv')).getByRole('button', { name: /Save/ })).toBeDisabled()
  })

  // Step 5, Oct 21: "An eruv is found from its website". Offered, never set
  // on its own: a status goes live.
  it('finds pages on its website that say it’s up or down, and reads from the one the admin picks', async () => {
    const found = { url: 'https://centercityeruv.com/', link: null, status: 'up', words: 'The eruv is currently up.' }
    await renderPage([CC], (body) => (body.action === 'find' ? { found: [found], error: null } : {}))
    const user = userEvent.setup()
    const r = row('Center City Eruv')
    await user.click(within(r).getByRole('button', { name: 'Find it on its website' }))
    const offered = await within(r).findByTestId('eruv-found')
    expect(offered).toHaveTextContent('Its home page, centercityeruv.com, says it’s up')
    expect(offered).toHaveTextContent('“The eruv is currently up.”')
    expect(posts.map((p) => p.body)).toEqual([{ id: 'center-city', action: 'find' }])
    await user.click(within(offered).getByRole('button', { name: 'Read its status from here' }))
    expect(posts.map((p) => p.body).slice(1)).toEqual([
      { id: 'center-city', action: 'save', edit: { statusUrl: 'https://centercityeruv.com/', statusEmail: '', statusDated: false } },
      { id: 'center-city', action: 'check' },
    ])
  })

  it('says when its website has no such page, or didn’t open', async () => {
    await renderPage([CC, { ...CC, id: 'ep', name: 'Elkins Park Eruv', website: 'https://yiep.org/eruv' }], (body) =>
      body.id === 'ep' ? { found: [], error: 'Its website, https://yiep.org/eruv, wouldn’t open: it says the page isn’t there (404)' } : { found: [], error: null },
    )
    const user = userEvent.setup()
    await user.click(within(row('Center City Eruv')).getByRole('button', { name: 'Find it on its website' }))
    expect(await within(row('Center City Eruv')).findByText(/No page on centercityeruv.com says whether it’s up/)).toBeInTheDocument()
    await user.click(within(row('Elkins Park Eruv')).getByRole('button', { name: 'Find it on its website' }))
    expect(await within(row('Elkins Park Eruv')).findByText('Its website, https://yiep.org/eruv, wouldn’t open: it says the page isn’t there (404).')).toBeInTheDocument()
  })

  it('an eruv with no website isn’t offered a search', async () => {
    await renderPage([NE])
    expect(within(row('Northeast Eruv')).queryByRole('button', { name: 'Find it on its website' })).toBeNull()
  })

  it('an email it couldn’t read is shown on its row, and the admin says what it says', async () => {
    const kept = { messageId: 'g1', subject: 'Eruv update', sentAt: '2026-10-09T17:30:00Z', text: 'The eruv is up. The eruv is down on Castor.', words: 'The eruv is up' }
    await renderPage([{ ...NE, statusEmail: 'jcor-ne-philadelphia@groups.io', statusEmailKept: kept }])
    const r = within(section('Can’t be read')).getByTestId('eruv-row')
    const box = within(r).getByTestId('eruv-kept-email')
    expect(box).toHaveTextContent('Their email says both up and down: “Eruv update”, Oct 9')
    await userEvent.setup().click(within(box).getByRole('button', { name: 'It says down' }))
    expect(posts.map((p) => p.body)).toEqual([{ id: 'northeast', action: 'email-says', says: 'down' }])
  })

  it('“Stop reading” empties both sources, once the admin says so on the page', async () => {
    await renderPage([READ])
    const user = userEvent.setup()
    const r = row('University City Eruv')
    await user.click(within(r).getAllByRole('button')[0])
    expect(r).toHaveTextContent('Read from: “The eruv is up”')
    await user.click(within(r).getByRole('button', { name: 'Stop reading' }))
    expect(posts).toEqual([])
    expect(r).toHaveTextContent(/Stop reading University City Eruv’s status\?/)
    await user.click(within(r).getAllByRole('button', { name: 'Stop reading' })[0])
    expect(posts.map((p) => p.body)).toEqual([{ id: 'uc', action: 'save', edit: { statusUrl: '', statusEmail: '' } }])
    // It stays where it was until the page reloads.
    expect(await within(r).findByText('No source: the site shows no status for it.')).toBeInTheDocument()
    expect(within(section('Read')).getByTestId('eruv-row')).toBe(r)
  })
})
