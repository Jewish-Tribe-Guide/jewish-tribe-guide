// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { ListingsProvider } from '@/lib/listingsContext'
import type { HomeSection } from '@/lib/homeSections'
import type { Eruv } from '@/lib/eruv'
import { clearEruvStatuses } from '@/lib/useEruvStatuses'
import { PinnedBlock } from './PinnedPlaces'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// Pins as pinned.ts stores them, in the order they were pinned.
const PINS_KEY = 'jpc:pinned-listings'
const pin = (...ids: [string, string][]) => localStorage.setItem(PINS_KEY, JSON.stringify(ids.map(([id, categoryId]) => ({ id, categoryId }))))

const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery' })
const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food' })
const hospital = makeCategory({ id: 'hospital', label: 'Hospital', pluralLabel: 'Hospitals' })
const eruvPage = makeCategory({ id: 'eruv-information', kind: 'eruv', label: 'Eruv Information', pluralLabel: 'Eruvim' })
const categories = [hospital, grocery, food, eruvPage]
// The admin's order: Food, then Grocery; Hospitals in no section.
const sections = [{ id: 's1', kind: 'section', title: 'Food and Hospitality', sortOrder: 0, cardIds: ['restaurant', 'grocery'], width: 'full' }] as HomeSection[]
const centre = { lat: 0, lng: 0 }
const place = (id: string, category: string, lat: number | null) => makeListing({ id, name: id, category, geo: lat === null ? undefined : { lat, lng: 0 } })
const listings = [place('Far Grocery', 'grocery', 0.02), place('Near Grocery', 'grocery', 0.001), place('Lunch Spot', 'restaurant', 0.005), place('Jefferson', 'hospital', null), place('Gone', 'grocery', 0.001)]

function show(ui: React.ReactElement) {
  return renderWithProviders(<ListingsProvider listings={listings.filter((l) => l.id !== 'Gone')}>{ui}</ListingsProvider>, { content: { categories, homeSections: sections } })
}

const centerCity: Eruv = {
  id: 'center-city', name: 'Center City Eruv', covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: 'https://example.org', statusDated: false,
  status: 'down', statusWords: 'The Eruv is Down', statusPostedOn: null, statusCheckedAt: '2026-10-09T18:55:00Z', statusErrorAt: null, statusError: null,
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  clearEruvStatuses()
  vi.unstubAllGlobals()
})

describe('Pinned on the Today home', () => {
  it('nothing until something is pinned', () => {
    show(<PinnedBlock communitySlug="philly" from={centre} now={null} />)
    expect(screen.queryByTestId('today-pinned')).not.toBeInTheDocument()
  })

  it('the three pinned last, newest first, and All N once there are more', () => {
    pin(['Far Grocery', 'grocery'], ['Lunch Spot', 'restaurant'], ['Jefferson', 'hospital'], ['Near Grocery', 'grocery'])
    show(<PinnedBlock communitySlug="philly" from={centre} now={null} />)
    const block = screen.getByTestId('today-pinned')
    expect(block.textContent).toMatch(/Near Grocery.*Jefferson.*Lunch Spot/)
    expect(block).not.toHaveTextContent('Far Grocery')
    expect(within(block).getByRole('link', { name: 'All 4 ›' })).toHaveAttribute('href', '/philly/you')
  })

  it('three or fewer: they’re all there, no All link; a pin whose listing is gone is skipped', () => {
    pin(['Lunch Spot', 'restaurant'], ['Gone', 'grocery'])
    show(<PinnedBlock communitySlug="philly" from={centre} now={null} />)
    expect(screen.getByTestId('today-pinned')).toHaveTextContent('Lunch Spot')
    expect(screen.getByTestId('today-pinned')).not.toHaveTextContent('Gone')
    expect(screen.queryByRole('link', { name: /^All/ })).not.toBeInTheDocument()
  })

  // Oct 15: a saved eruv, with whether it's up.
  it('a saved eruv: whether it’s up, opening it on the Eruv page', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: true, available: true, timezone: 'America/New_York', candles: 18 * 60 + 12, eruvim: [centerCity] })))
    pin(['Lunch Spot', 'restaurant'], ['center-city', 'eruv-information'])
    show(<PinnedBlock communitySlug="philly" from={centre} now={Date.parse('2026-10-09T19:00:00Z')} />)
    const block = await screen.findByTestId('today-pinned')
    const rows = within(block).getAllByRole('link')
    expect(rows.map((a) => a.textContent)).toEqual(['CCCenter City EruvEruv · Down this Shabbos', expect.stringContaining('Lunch Spot')])
    expect(rows[0]).toHaveAttribute('href', '/philly/eruv?item=center-city')
    expect(within(rows[0]).getByText('Down this Shabbos')).toHaveClass('text-red-700')
  })
})
