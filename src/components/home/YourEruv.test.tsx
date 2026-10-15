// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { parseLineFile } from '@/lib/eruvLine'
import { clearEruvStatuses } from '@/lib/useEruvStatuses'
import YourEruv from './YourEruv'

const here = vi.hoisted(() => ({ coords: null as { lat: number; lng: number } | null }))
vi.mock('@/lib/locationContext', () => ({ useOptionalLocation: () => here }))

const NOW = Date.parse('2026-10-09T19:00:00Z') // Fri 3 PM
const map = (f: string) => parseLineFile(readFileSync(join(__dirname, '../../lib/__fixtures__/eruv', f), 'utf8'))
const eruv = (id: string, name: string, status: 'up' | 'down') => ({ id, name, statusUrl: 'https://example.org/', statusDated: false, status, statusWords: 'x', statusPostedOn: null, statusCheckedAt: '2026-10-09T18:55:00Z', statusErrorAt: null, statusError: null })
// /api/eruv, and /api/eruv/maps.
let mapsVersion: string | undefined
const fetchMock = vi.fn(async (url: string) =>
  new Response(
    JSON.stringify(
      String(url).startsWith('/api/eruv/maps')
        ? { ok: true, maps: [{ id: 'center-city', map: map('center-city.geojson') }, { id: 'university-city', map: map('university-city.kml') }] }
        : { ok: true, available: true, timezone: 'America/New_York', candles: 18 * 60 + 12, mapsVersion, eruvim: [eruv('center-city', 'Center City Eruv', 'up'), eruv('university-city', 'University City Eruv', 'down')] },
    ),
  ),
)

beforeEach(() => {
  clearEruvStatuses()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  here.coords = null
  mapsVersion = undefined
  cleanup()
  vi.unstubAllGlobals()
  fetchMock.mockClear()
})

const show = () => renderWithProviders(<YourEruv communitySlug="philly" href="/philly/eruv" now={NOW} />)

describe('YourEruv', () => {
  // Oct 15: it opens that eruv on the Eruv page, not the list.
  it('the nearest eruv: its name, whether it’s up, when the guide checked; opens that eruv on the Eruv page', async () => {
    here.coords = { lat: 39.9496, lng: -75.1718 } // Rittenhouse Square
    show()
    const card = await screen.findByTestId('today-eruv')
    expect(card).toHaveTextContent('NEAREST ERUVCenter City EruvUp for this ShabbosChecked 2:55 PM · every 15 minutes until candle lighting')
    expect(card).toHaveAttribute('href', '/philly/eruv?item=center-city')
    // Never whether they're in it (Oct 12).
    expect(card).not.toHaveTextContent(/inside|your eruv/i)
  })

  it('whichever eruv is nearest, with its own status', async () => {
    here.coords = { lat: 39.956, lng: -75.2 } // Powelton, in University City
    show()
    expect(await screen.findByTestId('today-eruv')).toHaveTextContent('University City EruvDown this Shabbos')
  })

  it('no location: nothing, and nothing fetched', async () => {
    show()
    await Promise.resolve()
    expect(screen.queryByTestId('today-eruv')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no eruv within reach: nothing', async () => {
    here.coords = { lat: 39.93, lng: -75.0 } // Cherry Hill
    show()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('today-eruv')).not.toBeInTheDocument()
  })

  // Oct 15: a colour changed in the admin was still the old one, since the
  // maps were kept at the CDN for an hour under the same address.
  it('asks for the maps under the version /api/eruv gives, so an admin’s change isn’t an hour behind', async () => {
    here.coords = { lat: 39.9496, lng: -75.1718 }
    mapsVersion = 'abc123'
    show()
    await screen.findByTestId('today-eruv')
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain('/api/eruv/maps?community=philly&v=abc123')
  })

  it('and without one, the maps as before', async () => {
    here.coords = { lat: 39.9496, lng: -75.1718 }
    show()
    await screen.findByTestId('today-eruv')
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain('/api/eruv/maps?community=philly')
  })
})
