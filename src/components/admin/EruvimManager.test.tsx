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
  usePathname: () => '/test-community/admin/eruvim',
  useSearchParams: () => new URLSearchParams(),
}))

// The Eruvim tab (Oct 12): each eruv's own map as the guide shows it, what
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
