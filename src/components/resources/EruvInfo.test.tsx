// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ForcedViewport } from '@/lib/useIsMobile'
import type { Eruv } from '@/lib/eruv'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLineFile } from '@/lib/eruvLine'
import { mockRouter } from '@/test/nextNavigationMock'
import EruvInfo from './EruvInfo'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// Fri Oct 9 2026, 3 PM in Philadelphia; candle lighting 6:12 PM.
vi.mock('@/lib/useNow', () => ({ useNow: () => Date.parse('2026-10-09T19:00:00Z') }))
// Google's map isn't in jsdom: the map is a stand-in naming what it draws,
// which eruv it picks out, and a way to point at one on it.
vi.mock('./EruvMap', () => ({
  default: ({ eruvim, highlightId, onHover }: { eruvim: { id: string; name: string }[]; highlightId?: string | null; onHover?: (id: string | null) => void }) => (
    <div>
      <p data-testid="eruv-map" data-highlight={highlightId ?? ''}>{eruvim.map((e) => e.name).join(', ')}</p>
      {onHover && eruvim.map((e) => <span key={e.id} data-testid={`map-eruv-${e.id}`} onMouseEnter={() => onHover(e.id)} onMouseLeave={() => onHover(null)} />)}
    </div>
  ),
}))
const here = vi.hoisted(() => ({ coords: null as { lat: number; lng: number } | null, accuracyM: null as number | null }))
vi.mock('@/lib/locationContext', () => ({ useOptionalLocation: () => here }))

const base: Omit<Eruv, 'id' | 'name'> = {
  covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: 'https://example.org', statusDated: false,
  status: 'up', statusWords: 'The Eruv is Up!', statusPostedOn: null, statusCheckedAt: '2026-10-09T18:55:00Z', statusErrorAt: null, statusError: null, line: null,
}
const CC_LINE = parseLineFile(readFileSync(join(__dirname, '../../lib/__fixtures__/eruv/center-city.geojson'), 'utf8'))
const ERUVIM: Eruv[] = [
  { ...base, line: CC_LINE, id: 'center-city', name: 'Center City Eruv', covers: 'Center City and South Philadelphia, including Jefferson.', website: 'https://www.centercityeruv.com/', alertsUrl: 'https://www.centercityeruv.com/' },
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
  here.coords = null
  here.accuracyM = null
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

  it('on desktop, pointing at a row picks out its eruv on the map, and pointing at an eruv picks out its row', async () => {
    const user = userEvent.setup()
    show()
    const [row] = await screen.findAllByTestId('eruv-row')
    await user.hover(row)
    expect(screen.getByTestId('eruv-map')).toHaveAttribute('data-highlight', 'center-city')
    await user.unhover(row)
    expect(screen.getByTestId('eruv-map')).toHaveAttribute('data-highlight', '')
    await user.hover(screen.getByTestId('map-eruv-center-city'))
    expect(row).toHaveAttribute('data-pointed', 'true')
  })

  describe('where you are', () => {
    it('inside: says which eruv, and whether it’s up; the rest below', async () => {
      here.coords = { lat: 39.9496, lng: -75.1718 } // Rittenhouse Square
      show()
      const card = await screen.findByTestId('eruv-yours')
      expect(card).toHaveTextContent('WHERE YOU AREInside the Center City EruvUp for this Shabbos')
      expect(screen.getByTestId('eruv-list')).toHaveTextContent('The other eruvim')
      expect(screen.getAllByTestId('eruv-row').map((r) => r.textContent)).not.toContainEqual(expect.stringContaining('Center City'))
    })

    it('near the line: at the edge, never inside', async () => {
      here.coords = { lat: 39.954408, lng: -75.1431 } // 120 m in from the line by the Delaware
      here.accuracyM = 150
      show()
      expect(await screen.findByTestId('eruv-yours')).toHaveTextContent('At the edge of the Center City EruvToo close to the line to tell which side you’re on.')
    })

    it('outside every eruv on the map: no card', async () => {
      here.coords = { lat: 39.945, lng: -75.12 } // Camden
      show()
      await screen.findAllByTestId('eruv-row')
      expect(screen.queryByTestId('eruv-yours')).not.toBeInTheDocument()
      expect(screen.getByTestId('eruv-list')).toHaveTextContent('This Shabbos')
    })

    it('its listing says so too; the map shows the eruvim with a line', async () => {
      const user = userEvent.setup()
      here.coords = { lat: 39.9496, lng: -75.1718 }
      show()
      expect(await screen.findByTestId('eruv-map')).toHaveTextContent('Center City Eruv')
      await user.click(screen.getByTestId('eruv-yours'))
      expect(within(screen.getByTestId('eruv-listing')).getByTestId('eruv-where')).toHaveTextContent('You’re inside it')
    })
  })
})
