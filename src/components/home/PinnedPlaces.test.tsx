// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { ListingsProvider } from '@/lib/listingsContext'
import type { HomeSection } from '@/lib/homeSections'
import { PinnedBlock, PinnedList } from './PinnedPlaces'

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
const categories = [hospital, grocery, food]
// The admin's order: Food, then Grocery; Hospitals in no section.
const sections = [{ id: 's1', kind: 'section', title: 'Food and Hospitality', sortOrder: 0, cardIds: ['restaurant', 'grocery'], width: 'full' }] as HomeSection[]
const centre = { lat: 0, lng: 0 }
const place = (id: string, category: string, lat: number | null) => makeListing({ id, name: id, category, geo: lat === null ? undefined : { lat, lng: 0 } })
const listings = [place('Far Grocery', 'grocery', 0.02), place('Near Grocery', 'grocery', 0.001), place('Lunch Spot', 'restaurant', 0.005), place('Jefferson', 'hospital', null), place('Gone', 'grocery', 0.001)]

function show(ui: React.ReactElement) {
  return renderWithProviders(<ListingsProvider listings={listings.filter((l) => l.id !== 'Gone')}>{ui}</ListingsProvider>, { content: { categories, homeSections: sections } })
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

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
    expect(within(block).getByRole('link', { name: 'All 4 ›' })).toHaveAttribute('href', '/philly/pinned')
  })

  it('three or fewer: they’re all there, no All link; a pin whose listing is gone is skipped', () => {
    pin(['Lunch Spot', 'restaurant'], ['Gone', 'grocery'])
    show(<PinnedBlock communitySlug="philly" from={centre} now={null} />)
    expect(screen.getByTestId('today-pinned')).toHaveTextContent('Lunch Spot')
    expect(screen.getByTestId('today-pinned')).not.toHaveTextContent('Gone')
    expect(screen.queryByRole('link', { name: /^All/ })).not.toBeInTheDocument()
  })
})

describe('the Pinned page', () => {
  it('every pin, grouped in the admin’s order, nearest first in each', () => {
    pin(['Far Grocery', 'grocery'], ['Jefferson', 'hospital'], ['Near Grocery', 'grocery'], ['Lunch Spot', 'restaurant'])
    show(<PinnedList communitySlug="philly" from={centre} now={null} />)
    const groups = [...document.querySelectorAll('[data-testid^="pinned-group-"]')].map((g) => g.getAttribute('data-testid'))
    expect(groups).toEqual(['pinned-group-restaurant', 'pinned-group-grocery', 'pinned-group-hospital'])
    const names = within(screen.getByTestId('pinned-group-grocery'))
      .getAllByRole('link')
      .map((a) => a.textContent)
    expect(names[0]).toMatch(/^Near Grocery/)
    expect(names[1]).toMatch(/^Far Grocery/)
    expect(screen.getByText('4 places, saved', { exact: false })).toBeInTheDocument()
  })

  it('a place with no address says why it isn’t on the map; See them on the map shows the pins', () => {
    pin(['Jefferson', 'hospital'], ['Lunch Spot', 'restaurant'])
    show(<PinnedList communitySlug="philly" from={centre} now={null} />)
    expect(screen.getByTestId('pinned-group-hospital')).toHaveTextContent('No address in the guide yet, so it isn’t on the map')
    expect(screen.getByRole('link', { name: 'See them on the map' })).toHaveAttribute('href', '/philly/map?pinned=1')
  })

  it('Unpin takes it off the page', () => {
    pin(['Lunch Spot', 'restaurant'], ['Near Grocery', 'grocery'])
    show(<PinnedList communitySlug="philly" from={centre} now={null} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Unpin Lunch Spot' }).at(-1)!)
    expect(screen.queryByTestId('pinned-group-restaurant')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(PINS_KEY)!)).toEqual([{ id: 'Near Grocery', categoryId: 'grocery' }])
  })

  it('nothing pinned: how to pin', () => {
    show(<PinnedList communitySlug="philly" from={centre} now={null} />)
    expect(screen.getByTestId('pinned-page')).toHaveTextContent('Nothing pinned yet. Pin a place from its listing')
    expect(screen.queryByRole('link', { name: 'See them on the map' })).not.toBeInTheDocument()
  })
})
