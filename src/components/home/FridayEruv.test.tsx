// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { parseLineFile } from '@/lib/eruvLine'
import { clearEruvStatuses } from '@/lib/useEruvStatuses'
import FridayEruv from './FridayEruv'

// The eruv line on the Friday card (the user, Oct 17): everyone counted for
// someone who hasn't said where they are, the nearest by name for someone
// who has, one that's down named first.
const here = vi.hoisted(() => ({ coords: null as { lat: number; lng: number } | null }))
vi.mock('@/lib/locationContext', () => ({ useOptionalLocation: () => here }))

const NOW = Date.parse('2026-10-16T17:30:00Z') // Fri 1:30 PM in Philadelphia
const map = (f: string) => parseLineFile(readFileSync(join(__dirname, '../../lib/__fixtures__/eruv', f), 'utf8'))
const eruv = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  hotline: null,
  statusUrl: 'https://example.org/',
  statusDated: false,
  status: 'up',
  statusWords: 'Up',
  statusPostedOn: null,
  statusCheckedAt: '2026-10-16T17:25:00Z',
  statusErrorAt: null,
  statusError: null,
  ...over,
})
const phoneOnly = (id: string, name: string) => eruv(id, name, { statusUrl: null, status: null, statusCheckedAt: null, hotline: '(215) 333-ERUV' })
const PHILLY = [eruv('center-city', 'Center City Eruv'), eruv('university-city', 'University City Eruv'), eruv('lower-merion', 'Lower Merion Eruv'), phoneOnly('northeast', 'Northeast Eruv'), phoneOnly('elkins-park', 'Elkins Park Eruv')]

let eruvim: unknown[] = PHILLY
let available = true
const fetchMock = vi.fn(async (url: string) =>
  new Response(
    JSON.stringify(
      String(url).startsWith('/api/eruv/maps')
        ? { ok: true, maps: [{ id: 'center-city', map: map('center-city.geojson') }, { id: 'university-city', map: map('university-city.kml') }] }
        : available
          ? { ok: true, available: true, timezone: 'America/New_York', candles: Date.parse('2026-10-16T22:01:00Z'), eruvim }
          : { ok: true, available: false, eruvim: [] },
    ),
  ),
)

beforeEach(() => {
  clearEruvStatuses()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  here.coords = null
  eruvim = PHILLY
  available = true
  cleanup()
  vi.unstubAllGlobals()
  fetchMock.mockClear()
})

const show = () => renderWithProviders(<FridayEruv communitySlug="philly" href="/philly/eruv" now={NOW} />)

describe('the eruv on the Friday card', () => {
  it('no location: every eruv counted, on one line, to the Eruv page', async () => {
    show()
    const line = await screen.findByTestId('today-eruv')
    expect(line).toHaveTextContent(/^Eruvim3 up2 by phone$/)
    expect(line).toHaveAttribute('href', '/philly/eruv')
  })

  it('one that’s down is named first, the rest counted under it', async () => {
    eruvim = [eruv('center-city', 'Center City Eruv'), eruv('lower-merion', 'Lower Merion Eruv', { status: 'down' }), phoneOnly('northeast', 'Northeast Eruv')]
    show()
    expect(await screen.findByTestId('today-eruv')).toHaveTextContent(/^Lower Merion Eruv is down1 up1 by phone$/)
  })

  it('with a location: the nearest eruv by name, when it was checked; opens that eruv', async () => {
    here.coords = { lat: 39.9496, lng: -75.1718 } // Rittenhouse Square
    show()
    const line = await screen.findByTestId('today-eruv')
    expect(line).toHaveTextContent(/^Center City EruvUp for this ShabbosChecked 1:25 PM$/)
    expect(line).toHaveAttribute('href', '/philly/eruv?item=center-city')
  })

  it('the nearest has only a hotline: its number, not a status', async () => {
    eruvim = [phoneOnly('center-city', 'Center City Eruv')]
    here.coords = { lat: 39.9496, lng: -75.1718 }
    show()
    expect(await screen.findByTestId('today-eruv')).toHaveTextContent(/^Center City EruvNo status onlineHotline \(215\) 333-ERUV$/)
  })

  it('a community with one eruv: that eruv, by name, with no location needed', async () => {
    eruvim = [eruv('center-city', 'Center City Eruv')]
    show()
    expect(await screen.findByTestId('today-eruv')).toHaveTextContent(/^Center City EruvUp for this Shabbos/)
  })

  it('statuses that can’t be had: still the way to the Eruv page', async () => {
    available = false
    show()
    const line = await screen.findByTestId('today-eruv')
    expect(line).toHaveTextContent(/^Eruvim$/)
    expect(line).toHaveAttribute('href', '/philly/eruv')
  })
})
