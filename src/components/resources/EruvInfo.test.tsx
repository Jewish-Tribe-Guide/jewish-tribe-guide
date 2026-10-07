// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ForcedViewport } from '@/lib/useIsMobile'
import type { Eruv } from '@/lib/eruv'
import { mockRouter } from '@/test/nextNavigationMock'
import EruvInfo from './EruvInfo'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// Fri Oct 9 2026, 3 PM in Philadelphia; candle lighting 6:12 PM.
vi.mock('@/lib/useNow', () => ({ useNow: () => Date.parse('2026-10-09T19:00:00Z') }))

const base: Omit<Eruv, 'id' | 'name'> = {
  covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: 'https://example.org', statusDated: false,
  status: 'up', statusWords: 'The Eruv is Up!', statusPostedOn: null, statusCheckedAt: '2026-10-09T18:55:00Z', statusErrorAt: null, statusError: null, line: null,
}
const ERUVIM: Eruv[] = [
  { ...base, id: 'center-city', name: 'Center City Eruv', covers: 'Center City and South Philadelphia, including Jefferson.', website: 'https://www.centercityeruv.com/', alertsUrl: 'https://www.centercityeruv.com/' },
  { ...base, id: 'lower-merion', name: 'Lower Merion Eruv', statusDated: true, statusPostedOn: '2026-10-02', hotline: '(610) 664-5626, option 3' },
  { ...base, id: 'elkins-park', name: 'Elkins Park Eruv', statusUrl: null, status: null, statusCheckedAt: null, hotline: '(267) 415-6760' },
]
const OLD = [{ id: 'university-city', name: 'University City Eruv', area: 'Penn, Drexel', statusLink: 'https://www.pennocp.org/eruv', notes: 'Covers University City.' }]

function answer(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))))
}
function show() {
  return renderWithProviders(
    <ForcedViewport isMobile={false}>
      <EruvInfo eruvim={OLD} onUp={() => {}} title="Eruvim" />
    </ForcedViewport>,
  )
}

beforeEach(() => answer({ ok: true, available: true, timezone: 'America/New_York', candles: 18 * 60 + 12, eruvim: ERUVIM }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('EruvInfo', () => {
  it('each eruv: whether it’s up, and when the guide checked; nothing else', async () => {
    show()
    const rows = await screen.findAllByTestId('eruv-row')
    expect(rows.map((r) => r.textContent)).toEqual([
      'Center City EruvUp for this ShabbosChecked 2:55 PM · every 15 minutes until candle lighting',
      'Lower Merion EruvNot posted yet this weekChecked 2:55 PM · every 15 minutes until candle lighting',
      'Elkins Park EruvNo status online',
    ])
    expect(screen.getByTestId('eruv-list')).toHaveTextContent('This Shabbos')
    expect(screen.queryByText(/Check status/)).not.toBeInTheDocument()
  })

  it('a row opens the eruv’s listing: where it goes, its site and alerts, its hotline', async () => {
    const user = userEvent.setup()
    show()
    await user.click((await screen.findAllByTestId('eruv-row'))[0])
    const listing = screen.getByTestId('eruv-listing')
    expect(within(listing).getByText('Where it goes')).toBeInTheDocument()
    expect(within(listing).getByText('Center City and South Philadelphia, including Jefferson.')).toBeInTheDocument()
    expect(within(listing).getByRole('link', { name: 'centercityeruv.com' })).toHaveAttribute('href', 'https://www.centercityeruv.com/')
    expect(within(listing).getByRole('link', { name: 'Email alerts from the eruv' })).toBeInTheDocument()
  })

  it('a hotline dials its digits', async () => {
    const user = userEvent.setup()
    show()
    await user.click((await screen.findAllByTestId('eruv-row'))[2])
    expect(within(screen.getByTestId('eruv-listing')).getByRole('link', { name: '(267) 415-6760' })).toHaveAttribute('href', 'tel:2674156760')
  })

  it('without the eruv table, the old list and its links', async () => {
    answer({ ok: true, available: false, eruvim: [] })
    show()
    expect(await screen.findByRole('link', { name: /Check status/ })).toHaveAttribute('href', 'https://www.pennocp.org/eruv')
    expect(screen.queryByTestId('eruv-row')).not.toBeInTheDocument()
  })
})
