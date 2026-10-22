// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { AdminEruv } from '@/lib/eruvStore'
import EruvimManager from './EruvimManager'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/admin/categories/cat:eruv',
  useSearchParams: () => new URLSearchParams(),
}))

// The eruvim, on the Eruv row (Oct 12): each eruv's own map as the guide shows it, what
// to leave out of it, its markers hidden or not, and a warning when a part
// left out is no longer in its map. No line waits for a yes.

const NE: AdminEruv = {
  id: 'northeast', name: 'Northeast Eruv', covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false,
  status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null,
  lineUrl: 'https://www.google.com/maps/d/viewer?mid=abc', sortOrder: 4, active: true,
  rawLine: {
    lines: [{ name: 'Boundary', points: [[40.05, -75.07], [40.07, -75.07], [40.07, -75.04], [40.05, -75.07]], color: '#ccffff', fill: { color: '#ccffff', opacity: 0.47 } }],
    marks: [{ name: 'Congregation Ahavas Torah', at: [40.068, -75.065], color: '#0288d1' }],
  },
  lineReadAt: '2026-10-12T11:00:00Z', lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null,
  statusEmail: null, statusEmailKept: null,
}

const posts: unknown[] = []
function serve(eruvim: AdminEruv[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        posts.push(body)
        return new Response(JSON.stringify({ ok: true, eruv: { ...eruvim[0], ...body.edit } }))
      }
      return new Response(JSON.stringify({ ok: true, available: true, timezone: 'America/New_York', eruvim }))
    }),
  )
}
afterEach(() => {
  posts.length = 0
  cleanup()
  vi.unstubAllGlobals()
})

describe('EruvimManager', () => {
  it('its map as the guide shows it, and no line waiting for a yes', async () => {
    serve([NE])
    renderWithProviders(<EruvimManager token="t" />)
    const card = await screen.findByTestId('admin-eruv')
    expect(within(card).getByTestId('eruv-map-preview')).toHaveTextContent('As the guide shows it')
    expect(within(card).queryByRole('button', { name: /Use this line/ })).not.toBeInTheDocument()
  })

  it('hiding its markers is saved with the rest', async () => {
    const user = userEvent.setup()
    serve([NE])
    renderWithProviders(<EruvimManager token="t" />)
    const card = await screen.findByTestId('admin-eruv')
    await user.click(within(card).getByRole('checkbox', { name: /Hide its markers/ }))
    await user.click(within(card).getByRole('button', { name: 'Save' }))
    expect(posts).toEqual([expect.objectContaining({ action: 'save', id: 'northeast', edit: expect.objectContaining({ lineHidePoints: true }) })])
  })

  it('no markers to hide, no switch for them', async () => {
    serve([{ ...NE, rawLine: { lines: NE.rawLine!.lines } }])
    renderWithProviders(<EruvimManager token="t" />)
    const card = await screen.findByTestId('admin-eruv')
    expect(within(card).queryByRole('checkbox', { name: /Hide its markers/ })).not.toBeInTheDocument()
  })

  it('a part left out that its map no longer has says so', async () => {
    serve([{ ...NE, lineLeaveOut: ['Old border'], lineMissing: ['Old border'] }])
    renderWithProviders(<EruvimManager token="t" />)
    expect(await screen.findByTestId('eruv-line-missing')).toHaveTextContent('Left out, but no longer in its map: “Old border”')
  })

  // Oct 15: Northeast's own line is #ccffff, pale enough to vanish on the
  // map. The admin picks a colour for its line; the line still comes from
  // its map.
  const strokes = (card: HTMLElement) => [...within(card).getByTestId('eruv-map-preview').querySelectorAll('polyline')].map((l) => l.getAttribute('stroke'))

  const shading = (card: HTMLElement) => within(card).getByTestId('eruv-map-preview').querySelector('polygon')?.getAttribute('fill-opacity')

  it('its line in its own colour until one is picked', async () => {
    serve([NE])
    renderWithProviders(<EruvimManager token="t" />)
    const card = await screen.findByTestId('admin-eruv')
    expect(within(card).getByLabelText('Line colour')).toHaveValue('#ccffff')
    expect(within(card).getByText('its own, from its map')).toBeInTheDocument()
    expect(strokes(card)).toEqual(['#ccffff'])
    expect(shading(card)).toBe('0.47')
  })

  it('a colour picked shows in the preview and is saved', async () => {
    const user = userEvent.setup()
    serve([NE])
    renderWithProviders(<EruvimManager token="t" />)
    const card = await screen.findByTestId('admin-eruv')
    fireEvent.change(within(card).getByLabelText('Line colour'), { target: { value: '#1d4ed8' } })
    expect(strokes(card)).toEqual(['#1d4ed8'])
    // And its pale shading no longer shows under it.
    expect(shading(card)).toBe('0')
    await user.click(within(card).getByRole('button', { name: 'Save' }))
    expect(posts).toEqual([expect.objectContaining({ action: 'save', id: 'northeast', edit: expect.objectContaining({ lineColor: '#1d4ed8' }) })])
  })

  // Oct 19: an eruv's status source moved to the Watches tab. Here it only
  // says where its status is read from, and links there to change it.
  it('says where its status is read from, and sends the admin to the Watches tab to change it', async () => {
    serve([{ ...NE, statusEmail: 'jcor-ne-philadelphia@groups.io' }])
    renderWithProviders(<EruvimManager token="t" />, { community: { slug: 'philly' } })
    const line = await screen.findByTestId('eruv-status-source')
    expect(line).toHaveTextContent('Status read from emails from jcor-ne-philadelphia@groups.io.')
    expect(within(line).getByRole('link', { name: 'Change it on the Watches tab' })).toHaveAttribute('href', '/philly/admin/watches')
    // No status fields of its own any more.
    expect(screen.queryByLabelText(/Status emails from/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Status page/)).not.toBeInTheDocument()
  })

  it('an eruv with no status source says so, and where to add one', async () => {
    serve([NE])
    renderWithProviders(<EruvimManager token="t" />, { community: { slug: 'philly' } })
    const line = await screen.findByTestId('eruv-status-source')
    expect(line).toHaveTextContent('No status source.')
    expect(within(line).getByRole('link', { name: 'Add one on the Watches tab' })).toBeInTheDocument()
  })

  it('an email it couldn’t read is pointed to, not read, here', async () => {
    const kept = { messageId: 'g1', subject: 'Eruv update', sentAt: '2026-10-09T17:30:00Z', text: 'The eruv is up.', words: 'The eruv is up' }
    serve([{ ...NE, statusEmail: 'jcor-ne-philadelphia@groups.io', statusEmailKept: kept }])
    renderWithProviders(<EruvimManager token="t" />, { community: { slug: 'philly' } })
    expect(await screen.findByTestId('eruv-status-source')).toHaveTextContent('An email from it waits for you there.')
    expect(screen.queryByTestId('eruv-kept-email')).not.toBeInTheDocument()
  })

  it('“Use its own” puts its own colour back', async () => {
    const user = userEvent.setup()
    serve([{ ...NE, lineColor: '#1d4ed8' }])
    renderWithProviders(<EruvimManager token="t" />)
    const card = await screen.findByTestId('admin-eruv')
    expect(strokes(card)).toEqual(['#1d4ed8'])
    expect(shading(card)).toBe('0')
    await user.click(within(card).getByRole('button', { name: 'Use its own' }))
    expect(strokes(card)).toEqual(['#ccffff'])
    expect(shading(card)).toBe('0.47')
    expect(within(card).getByLabelText('Line colour')).toHaveValue('#ccffff')
    await user.click(within(card).getByRole('button', { name: 'Save' }))
    expect(posts).toEqual([expect.objectContaining({ edit: expect.objectContaining({ lineColor: null }) })])
  })
})
