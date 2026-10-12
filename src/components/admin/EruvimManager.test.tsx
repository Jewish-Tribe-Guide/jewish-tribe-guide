// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
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
  lineReadAt: '2026-10-12T11:00:00Z', lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [],
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
})
