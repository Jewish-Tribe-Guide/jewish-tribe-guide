// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import type { HomeSection } from '@/lib/homeSections'
import type { MinyanSchedule } from '@/lib/useMinyanSchedule'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import BrowseAll from './BrowseAll'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/browse',
  useSearchParams: () => new URLSearchParams(),
}))

// The Browse tab: every category in the admin's groups, each with its count
// and the line its own page leads with.
const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours' }
const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', detailFields: [hours], groupBy: { kind: 'open' } })
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery' })
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
const eruv = makeCategory({ id: 'eruv-information', kind: 'eruv', label: 'Eruv', pluralLabel: 'Eruv Information', icon: '🧵' })
const categories = [food, grocery, shuls, eruv]
const sections = [
  { id: 's1', kind: 'section', title: 'Food and Hospitality', sortOrder: 0, cardIds: ['grocery', 'restaurant'], width: 'full' },
  { id: 's2', kind: 'section', title: 'Jewish Institutions', sortOrder: 1, cardIds: ['synagogue', 'eruv'], width: 'full' },
] as HomeSection[]
const everyDay = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '21:00' }]))
const listings = [
  makeListing({ id: 'hip', name: 'HipCityVeg', category: 'restaurant', hours: everyDay }),
  makeListing({ id: 'late', name: 'Late Place', category: 'restaurant', hours: { tue: { open: '18:00', close: '23:00' } } }),
  makeListing({ id: 'tj', name: 'Trader Joe’s', category: 'grocery' }),
  makeListing({ id: 'mikveh', name: 'Mikveh Israel', category: 'synagogue' }),
]
const centre = { lat: 39.9526, lng: -75.1652 }

/** Tuesday Oct 6, 12:30 PM in the visitor's own clock (see getOpenStatus),
 *  with Mikveh Israel's Mincha at 2. */
function tuesday(): MinyanSchedule {
  return {
    now: new Date(2026, 9, 6, 12, 30).getTime(),
    nowMinutes: 12 * 60 + 30,
    todayKey: 'tue',
    tomorrowKey: 'wed',
    todayDayKeys: ['tue'],
    tomorrowDayKeys: ['wed'],
    season: null,
    anchors: {},
    linkCategoryId: 'synagogue',
    shuls: [{ id: 'mikveh', name: 'Mikveh Israel', geo: undefined, minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '2:00pm' }] }],
  } as unknown as MinyanSchedule
}

function show(feedbackEnabled = true) {
  renderWithProviders(<BrowseAll communitySlug="philly" listings={listings} schedule={tuesday()} zmanim={null} timezone="America/New_York" coords={null} center={centre} />, {
    content: { categories, homeSections: sections, settings: { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled } },
  })
}

afterEach(() => cleanup())

describe('the Browse tab', () => {
  it('every category in the admin’s groups and order, each to its page', () => {
    show()
    const groups = [...document.querySelectorAll('[data-testid^="browse-group-"]')].map((g) => g.getAttribute('data-testid'))
    expect(groups).toEqual(['browse-group-Food and Hospitality', 'browse-group-Jewish Institutions'])
    const links = within(screen.getByTestId('browse-group-Food and Hospitality')).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/philly/grocery', '/philly/restaurant'])
  })

  it('a count, and the line the category’s own page leads with; nothing where it has none', () => {
    show()
    const [groceryRow, foodRow] = within(screen.getByTestId('browse-group-Food and Hospitality')).getAllByRole('link')
    expect(foodRow).toHaveTextContent(/^Food1 open now2$/)
    expect(groceryRow).toHaveTextContent(/^Grocery1$/)
    const [shulRow, eruvRow] = within(screen.getByTestId('browse-group-Jewish Institutions')).getAllByRole('link')
    expect(shulRow).toHaveTextContent('Next: Mincha 2 PM · Mikveh Israel')
    expect(eruvRow).toHaveTextContent(/^Eruv Information$/)
  })

  it('the Eruv page’s card has its line glyph, not the emoji', () => {
    show()
    const eruvRow = within(screen.getByTestId('browse-group-Jewish Institutions')).getAllByRole('link')[1]
    const icon = eruvRow.firstElementChild!
    expect(icon.querySelector('svg')).not.toBeNull()
    expect(icon).not.toHaveTextContent('🧵')
  })

  it('then Feedback, About and Privacy; Feedback only when it’s on', () => {
    show()
    const nav = screen.getByRole('navigation', { name: 'About the guide' })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Feedback', '/philly/feedback'],
      ['About', '/philly/about'],
      ['Privacy', '/philly/privacy'],
    ])
    cleanup()
    show(false)
    expect(within(screen.getByRole('navigation', { name: 'About the guide' })).queryByRole('link', { name: 'Feedback' })).not.toBeInTheDocument()
  })
})
