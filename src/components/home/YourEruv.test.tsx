// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { parseLineFile } from '@/lib/eruvLine'
import { clearEruvStatuses } from '@/lib/useEruvStatuses'
import YourEruv from './YourEruv'

const here = vi.hoisted(() => ({ coords: null as { lat: number; lng: number } | null, accuracyM: null as number | null }))
vi.mock('@/lib/locationContext', () => ({ useOptionalLocation: () => here }))

const NOW = Date.parse('2026-10-09T19:00:00Z') // Fri 3 PM
const line = parseLineFile(readFileSync(join(__dirname, '../../lib/__fixtures__/eruv/center-city.geojson'), 'utf8'))
const fetchMock = vi.fn(async () =>
  new Response(JSON.stringify({ ok: true, available: true, timezone: 'America/New_York', candles: 18 * 60 + 12, eruvim: [{ id: 'center-city', name: 'Center City Eruv', statusUrl: 'https://www.centercityeruv.com/', statusDated: false, status: 'up', statusWords: 'x', statusPostedOn: null, statusCheckedAt: '2026-10-09T18:55:00Z', statusErrorAt: null, statusError: null, line }] })),
)

beforeEach(() => {
  clearEruvStatuses()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  here.coords = null
  cleanup()
  vi.unstubAllGlobals()
  fetchMock.mockClear()
})

const show = () => renderWithProviders(<YourEruv communitySlug="philly" href="/philly/eruv" now={NOW} />)

describe('YourEruv', () => {
  it('inside an eruv: its name, whether it’s up, when the guide checked; opens the Eruv page', async () => {
    here.coords = { lat: 39.9496, lng: -75.1718 }
    show()
    const card = await screen.findByTestId('today-eruv')
    expect(card).toHaveTextContent('YOUR ERUVCenter City EruvUp for this ShabbosChecked 2:55 PM · every 15 minutes until candle lighting')
    expect(card).toHaveAttribute('href', '/philly/eruv')
  })

  it('no location: nothing, and nothing fetched', async () => {
    show()
    await Promise.resolve()
    expect(screen.queryByTestId('today-eruv')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('outside every mapped eruv: nothing', async () => {
    here.coords = { lat: 39.945, lng: -75.12 }
    show()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('today-eruv')).not.toBeInTheDocument()
  })
})
