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
import { clearEruvStatuses } from '@/lib/useEruvStatuses'
import { PreviewSendProvider } from '@/lib/previewSend'
import { makeCategory } from '@/test/providerFixtures'
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
  default: ({ eruvim, highlightId, onHover, focusId, fullMapHref, onHide }: { eruvim: { id: string; name: string }[]; highlightId?: string | null; onHover?: (id: string | null) => void; focusId?: string | null; fullMapHref?: string; onHide?: () => void }) => (
    <div>
      {onHide && (
        <button type="button" onClick={onHide}>
          Hide map
        </button>
      )}
      <p data-testid="eruv-map" data-highlight={highlightId ?? ''} data-focus={focusId ?? ''} data-full-map={fullMapHref ?? ''}>
        {eruvim.map((e) => e.name).join(', ')}
      </p>
      {onHover && eruvim.map((e) => <span key={e.id} data-testid={`map-eruv-${e.id}`} onMouseEnter={() => onHover(e.id)} onMouseLeave={() => onHover(null)} />)}
    </div>
  ),
}))
// Whether the screen is wide enough for the map beside the list (jsdom has
// no layout to measure).
const screenSize = vi.hoisted(() => ({ wide: false }))
vi.mock('./CategoryMap', () => ({ useWide: () => screenSize.wide }))
const here = vi.hoisted(() => ({ coords: null as { lat: number; lng: number } | null }))
vi.mock('@/lib/locationContext', () => ({ useOptionalLocation: () => here }))

const base: Omit<Eruv, 'id' | 'name'> = {
  covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: 'https://example.org', statusDated: false,
  status: 'up', statusWords: 'The Eruv is Up!', statusPostedOn: null, statusCheckedAt: '2026-10-09T18:55:00Z', statusErrorAt: null, statusError: null,
}
const CC_LINE = parseLineFile(readFileSync(join(__dirname, '../../lib/__fixtures__/eruv/center-city.geojson'), 'utf8'))
const ERUVIM: Eruv[] = [
  { ...base, id: 'center-city', name: 'Center City Eruv', covers: 'Center City and South Philadelphia, including Jefferson.', website: 'https://www.centercityeruv.com/', alertsUrl: 'https://www.centercityeruv.com/' },
  { ...base, id: 'lower-merion', name: 'Lower Merion Eruv', statusDated: true, statusPostedOn: '2026-10-02', hotline: '(610) 664-5626, option 3' },
  { ...base, id: 'elkins-park', name: 'Elkins Park Eruv', statusUrl: null, status: null, statusCheckedAt: null, hotline: '(267) 415-6760' },
]
const OLD = [{ id: 'university-city', name: 'University City Eruv', area: 'Penn, Drexel', statusLink: 'https://www.pennocp.org/eruv', notes: 'Covers University City.' }]

// /api/eruv, and /api/eruv/maps: Center City's own map only. A suggestion
// posted to /api/submissions is kept, and filed.
const posted: unknown[] = []
function answer(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/submissions')) {
        posted.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ ok: true, id: 's1' }))
      }
      return new Response(JSON.stringify(String(url).startsWith('/api/eruv/maps') ? { ok: true, maps: [{ id: 'center-city', map: CC_LINE }] } : body))
    }),
  )
}
function show({ isMobile = false, itemId = null as string | null, onParamsChange = undefined as ((c: Record<string, string | null>, o?: { replace?: boolean; step?: string }) => void) | undefined } = {}) {
  return renderWithProviders(
    <ForcedViewport isMobile={isMobile}>
      <EruvInfo eruvim={OLD} onUp={() => {}} title="Eruvim" itemId={itemId} onParamsChange={onParamsChange} />
    </ForcedViewport>,
  )
}

beforeEach(() => answer({ ok: true, available: true, timezone: 'America/New_York', candles: 18 * 60 + 12, eruvim: ERUVIM }))
afterEach(() => {
  posted.length = 0
  screenSize.wide = false
  localStorage.clear()
  here.coords = null
  clearEruvStatuses()
  cleanup()
  vi.unstubAllGlobals()
})

describe('EruvInfo', () => {
  it('each eruv: whether it’s up, and when the guide checked; nothing else', async () => {
    show()
    const rows = await screen.findAllByTestId('eruv-row')
    // One box of rows: the name, whether it's up.
    expect(rows.map((r) => r.textContent)).toEqual([
      'Center City EruvUp for this ShabbosChecked 2:55 PM · every 15 minutes until candle lighting',
      'Lower Merion EruvNot posted yet this weekChecked 2:55 PM · every 15 minutes until candle lighting',
      'Elkins Park EruvNo status online',
    ])
    // Headed as a category's list is: what it is, and how many.
    expect(screen.getByTestId('list-heading')).toHaveTextContent('This Shabbos · 3 eruvim')
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

  // Oct 15: "Can't save eruv listings." Saved as the Eruv page's place,
  // so You and Today find it among the eruvim.
  it('Save on an eruv’s listing saves it, marked on its picture as any saved place is', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ForcedViewport isMobile={false}>
        <EruvInfo eruvim={OLD} onUp={() => {}} title="Eruvim" />
      </ForcedViewport>,
      { content: { categories: [makeCategory({ id: 'eruv', kind: 'eruv', pluralLabel: 'Eruvim' })] } },
    )
    await user.click((await screen.findAllByTestId('eruv-row'))[0])
    const listing = screen.getByTestId('eruv-listing')
    expect(within(listing).queryByTestId('saved-badge')).not.toBeInTheDocument()
    await user.click(within(listing).getByRole('button', { name: 'Save Center City Eruv' }))
    expect(JSON.parse(localStorage.getItem('jpc:pinned-listings')!)).toEqual([{ id: 'center-city', categoryId: 'eruv' }])
    expect(within(listing).getByTestId('saved-badge')).toBeInTheDocument()
    expect(screen.getByTestId('undo-toast')).toHaveTextContent('Saved to You')
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

  it('the eruvim’s own maps, with an eruv that has one', async () => {
    show()
    expect(await screen.findByTestId('eruv-map')).toHaveTextContent('Center City Eruv')
    expect(screen.getByTestId('eruv-map')).not.toHaveTextContent('Lower Merion')
  })

  it('never says whether someone is inside an eruv: they see their dot on its map (Oct 12)', async () => {
    const user = userEvent.setup()
    here.coords = { lat: 39.9496, lng: -75.1718 } // Rittenhouse Square, in Center City
    show()
    const rows = await screen.findAllByTestId('eruv-row')
    expect(rows).toHaveLength(3)
    expect(screen.getByTestId('eruv-list')).toHaveTextContent('This Shabbos')
    expect(screen.queryByText(/inside/i)).not.toBeInTheDocument()
    await user.click(rows[0])
    expect(within(screen.getByTestId('eruv-listing')).queryByText(/inside|edge/i)).not.toBeInTheDocument()
  })

  describe('an eruv opens as any listing opens (Oct 13)', () => {
    it('on desktop, in the list’s column, the map beside it on that eruv, and the address names it', async () => {
      const user = userEvent.setup()
      const onParamsChange = vi.fn()
      show({ onParamsChange })
      await user.click((await screen.findAllByTestId('eruv-row'))[0])
      const column = screen.getByTestId('eruv-column')
      expect(within(column).getByText('Center City Eruv')).toBeInTheDocument()
      expect(screen.getByTestId('eruv-list')).not.toBeVisible()
      expect(screen.getByTestId('eruv-map')).toHaveAttribute('data-focus', 'center-city')
      expect(screen.getByTestId('eruv-map')).toHaveAttribute('data-highlight', 'center-city')
      // A step Back undoes.
      expect(onParamsChange).toHaveBeenLastCalledWith({ item: 'center-city' }, { step: 'eruv' })
    })

    it('‹ › step through the eruvim in the list’s order, and ‹ Eruvim goes back to the list', async () => {
      const user = userEvent.setup()
      const onParamsChange = vi.fn()
      show({ onParamsChange })
      await user.click((await screen.findAllByTestId('eruv-row'))[0])
      expect(screen.getByTestId('listing-column-bar')).toHaveTextContent('1 of 3')
      await user.click(screen.getByRole('button', { name: 'Next listing' }))
      expect(within(screen.getByTestId('eruv-column')).getByText('Lower Merion Eruv')).toBeInTheDocument()
      expect(screen.getByTestId('eruv-map')).toHaveAttribute('data-focus', 'lower-merion')
      expect(onParamsChange).toHaveBeenLastCalledWith({ item: 'lower-merion' }, { replace: true })
      await user.click(screen.getByRole('button', { name: 'Eruvim' }))
      expect(screen.queryByTestId('eruv-column')).not.toBeInTheDocument()
      expect(screen.getByTestId('eruv-list')).toBeVisible()
      expect(screen.getByTestId('eruv-map')).toHaveAttribute('data-focus', '')
    })

    it('a link to an eruv (?item=) opens it', async () => {
      show({ itemId: 'lower-merion' })
      expect(within(await screen.findByTestId('eruv-column')).getByText('Lower Merion Eruv')).toBeInTheDocument()
      expect(await screen.findByTestId('eruv-map')).toHaveAttribute('data-focus', 'lower-merion')
    })

    it('on a phone, in a sheet, the map above it on that eruv', async () => {
      const user = userEvent.setup()
      show({ isMobile: true })
      await user.click((await screen.findAllByTestId('eruv-row'))[1])
      expect(screen.queryByTestId('eruv-column')).not.toBeInTheDocument()
      expect(within(screen.getByTestId('eruv-listing')).getByText('Lower Merion Eruv')).toBeInTheDocument()
      expect(screen.getByTestId('eruv-map')).toHaveAttribute('data-focus', 'lower-merion')
    })

    it('Full map opens the Map tab on the eruvim alone, the open one open there', async () => {
      const user = userEvent.setup()
      show()
      expect(await screen.findByTestId('eruv-map')).toHaveAttribute('data-full-map', '/test-community/map?eruv=1')
      await user.click((await screen.findAllByTestId('eruv-row'))[0])
      expect(screen.getByTestId('eruv-map')).toHaveAttribute('data-full-map', '/test-community/map?eruv=1&place=eruv%3Acenter-city')
    })
  })

  describe('Edit listing (Oct 13): its four things, open together', () => {
    it('the eruv’s fields filled in as they are; Send counts the changes and files them; then Sent', async () => {
      const user = userEvent.setup()
      show()
      await user.click((await screen.findAllByTestId('eruv-row'))[1])
      await user.click(screen.getByRole('button', { name: 'Edit listing' }))
      const form = await screen.findByTestId('eruv-suggest')
      // On a computer the editor's own ‹ is the way back: no ‹ 2 of 3 › bar.
      expect(screen.queryByTestId('listing-column-bar')).not.toBeInTheDocument()
      // Every field open at once, nothing to open first.
      expect(within(form).getByLabelText('Hotline')).toHaveValue('(610) 664-5626, option 3')
      expect(within(form).getByLabelText('Website')).toHaveValue('')
      expect(within(form).queryByLabelText(/email \(optional\)/i)).not.toBeInTheDocument()
      expect(within(form).getByRole('button', { name: 'No changes yet' })).toBeDisabled()

      const hotline = within(form).getByLabelText('Hotline')
      await user.clear(hotline)
      await user.type(hotline, '(610) 555-0100')
      expect(within(form).getByRole('button', { name: 'Send 1 change' })).toBeEnabled()
      await user.type(within(form).getByLabelText('Website'), 'lowermerioneruv.org')
      await user.click(within(form).getByRole('button', { name: 'Send 2 changes' }))

      expect(await screen.findByTestId('editor-sent')).toHaveTextContent('An admin checks it')
      expect(posted).toEqual([
        expect.objectContaining({
          operation: 'update',
          targetType: 'eruv',
          targetId: 'lower-merion',
          payload: { covers: '', website: 'lowermerioneruv.org', hotline: '(610) 555-0100', alertsUrl: '' },
        }),
      ])
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(await screen.findByTestId('eruv-listing')).toBeInTheDocument()
      expect(screen.getByTestId('listing-column-bar')).toBeInTheDocument()
    })

    // The admin's category Preview promises nothing done in it is filed
    // (previewSend.tsx); the eruv's edit came after that, and filed for real.
    it('in the admin’s Preview, Send shows Sent and files nothing', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <PreviewSendProvider listing={() => {}}>
          <ForcedViewport isMobile={false}>
            <EruvInfo eruvim={OLD} onUp={() => {}} title="Eruvim" />
          </ForcedViewport>
        </PreviewSendProvider>,
      )
      await user.click((await screen.findAllByTestId('eruv-row'))[1])
      await user.click(screen.getByRole('button', { name: 'Edit listing' }))
      const form = await screen.findByTestId('eruv-suggest')
      await user.type(within(form).getByLabelText('Website'), 'lowermerioneruv.org')
      await user.click(within(form).getByRole('button', { name: 'Send 1 change' }))
      expect(await screen.findByTestId('editor-sent')).toBeInTheDocument()
      expect(posted).toEqual([])
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(await screen.findByTestId('eruv-listing')).toBeInTheDocument()
    })

    it('‹ goes back to the listing, sending nothing', async () => {
      const user = userEvent.setup()
      show()
      await user.click((await screen.findAllByTestId('eruv-row'))[0])
      await user.click(screen.getByRole('button', { name: 'Edit listing' }))
      await screen.findByTestId('eruv-suggest')
      await user.click(screen.getByRole('button', { name: /back/i }))
      expect(await screen.findByTestId('eruv-listing')).toBeInTheDocument()
      expect(posted).toEqual([])
    })
  })

  describe('laid out as a category page (Oct 13)', () => {
    it('on a wide screen the map is beside the list, and Hide map gives the list the width, Show map brings it back', async () => {
      const user = userEvent.setup()
      screenSize.wide = true
      show()
      await user.click(await screen.findByRole('button', { name: 'Hide map' }))
      expect(screen.queryByTestId('eruv-map')).not.toBeInTheDocument()
      await user.click(within(screen.getByTestId('list-heading')).getByRole('button', { name: /Show map/ }))
      expect(await screen.findByTestId('eruv-map')).toBeInTheDocument()
    })

    it('narrower, the map is above the list, with nothing to hide it', async () => {
      show()
      expect(await screen.findByTestId('eruv-map')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Hide map' })).not.toBeInTheDocument()
    })
  })
})
