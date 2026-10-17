// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import type { MinyanSchedule } from '@/lib/useMinyanSchedule'
import type { ZmanimData } from '@/types'
import RightNow from './RightNow'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The phone home's Right now (the user, Oct 17), for each kind of day, with
// the clock fixed: what's open on a weekday, the candles card and Before
// candles on Friday, the card alone on Shabbos, and never the next minyan.
const NY = 'America/New_York'
const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours' }
const meatDairy: CategoryField = {
  key: 't',
  label: 'Type',
  type: 'select',
  filterable: true,
  options: ['Meat', 'Dairy', 'Parve'].map((v) => ({ value: v, label: v })),
}
const kosherType: CategoryField = {
  key: 'isKosher',
  label: 'Kosher Store',
  type: 'select',
  filterable: true,
  options: ['Kosher Store', 'Kosher Items'].map((v) => ({ value: v, label: v })),
}
const items: CategoryField = { key: 'm', label: 'Items', type: 'tags', showCountInHeader: true }
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', detailFields: [hours, meatDairy] })
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery', detailFields: [hours, kosherType, items] })
const zmanimPage = makeCategory({ id: 'prayer-shabbat-times', kind: 'zmanim', label: 'Zmanim', pluralLabel: 'Zmanim' })
const categories = [shuls, food, grocery, zmanimPage]
const everyDay = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '21:00' }]))
const listings = [
  makeListing({ id: 'hip', name: 'HipCityVeg', category: 'restaurant', hours: everyDay, t: 'Parve' }),
  makeListing({ id: 'shtetl', name: 'Shtetl', category: 'restaurant', hours: everyDay, t: 'Meat' }),
  makeListing({ id: 'hok', name: 'House of Kosher', category: 'grocery', hours: everyDay, isKosher: 'Kosher Store', m: ['Challah'] }),
  makeListing({ id: 'tj', name: 'Trader Joe’s', category: 'grocery', geo: { lat: 39.9545, lng: -75.1614 }, hours: everyDay, isKosher: 'Kosher Items', m: ['Challah', 'Wine', 'Chicken'] }),
  makeListing({ id: 'mekor', name: 'Mekor Habracha', category: 'synagogue' }),
]
const week = {
  hebrewDate: '2 Cheshvan 5787',
  dayOfWeek: 2,
  isFriday: false,
  isShabbos: false,
  parsha: 'Parashat Noach',
  dailyZmanim: [],
  shabbos: {
    candleLighting: { label: 'Friday', time: '6:01 PM', iso: '2026-10-16T18:01:00-04:00' },
    havdalah: { label: 'Saturday', time: '6:59 PM', iso: '2026-10-17T18:59:00-04:00' },
  },
} as unknown as ZmanimData

/** The clock as useMinyanSchedule gives it, at a fixed moment. Local time
 *  for the hours (the device's clock), the instant for the zmanim. */
function scheduleAt(nyIso: string): MinyanSchedule {
  const [h, m] = nyIso.slice(11, 16).split(':').map(Number)
  return { now: Date.parse(nyIso), nowMinutes: h * 60 + m, linkCategoryId: 'synagogue', shuls: [] } as unknown as MinyanSchedule
}

function show(nyIso: string | null, zmanim: ZmanimData | null) {
  return renderWithProviders(
    <RightNow
      listings={listings}
      categories={categories}
      communitySlug="test-community"
      timezone={NY}
      schedule={nyIso ? scheduleAt(nyIso) : null}
      zmanim={zmanim}
      from={{ lat: 39.9526, lng: -75.1652 }}
      items={['Challah', 'Wine', 'Chicken']}
      onOpenListing={vi.fn()}
    />,
    { content: { categories } },
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Right now', () => {
  // The hours are read off the device's clock (getOpenStatus); the tests
  // run with it at the same moment.
  const at = (nyIso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(nyIso))
  }

  it('a weekday: what’s open in the first two categories with hours, each to its page with Open now on; no minyan', () => {
    at('2026-10-13T12:30:00-04:00')
    show('2026-10-13T12:30:00-04:00', week)
    const section = screen.getByTestId('right-now')
    expect(section).toHaveAttribute('data-moment', 'weekday')
    expect(screen.getByRole('heading', { name: /Right now/ })).toHaveTextContent('Right now · Tuesday · 2 Cheshvan')
    const rows = within(section).getAllByRole('link')
    expect(rows.map((r) => [r.textContent, r.getAttribute('href')])).toEqual([
      ['Food2 open now1 meat · 1 parve', '/test-community/restaurant?openNow=1'],
      ['Grocery2 open now1 kosher store · 1 kosher items', '/test-community/grocery?openNow=1'],
    ])
    expect(section).not.toHaveTextContent(/minyan|Mincha|Candles/i)
  })

  it('late at night, with nothing open: nothing at all', () => {
    at('2026-10-13T23:30:00-04:00')
    show('2026-10-13T23:30:00-04:00', week)
    expect(screen.queryByTestId('right-now')).not.toBeInTheDocument()
  })

  it('Friday afternoon: the candles card and Before candles; nothing “open now”', () => {
    at('2026-10-16T13:30:00-04:00')
    show('2026-10-16T13:30:00-04:00', { ...week, hebrewDate: '5 Cheshvan 5787', dayOfWeek: 5, isFriday: true } as ZmanimData)
    const section = screen.getByTestId('right-now')
    expect(section).toHaveAttribute('data-moment', 'erev')
    expect(screen.getByTestId('today-candles')).toHaveTextContent('Candles 6:01 PM')
    expect(screen.getByTestId('today-before-candles')).toHaveTextContent('Trader Joe’s')
    expect(section).not.toHaveTextContent('open now')
  })

  it('Shabbos: the card alone, saying when it ends; nothing to buy, nothing open', () => {
    at('2026-10-17T11:00:00-04:00')
    show('2026-10-17T11:00:00-04:00', { ...week, hebrewDate: '6 Cheshvan 5787', dayOfWeek: 6, isShabbos: true } as ZmanimData)
    expect(screen.getByTestId('right-now')).toHaveAttribute('data-moment', 'shabbos')
    expect(screen.getByTestId('today-candles')).toHaveTextContent('Havdalah 6:59 PM')
    expect(screen.queryByTestId('today-before-candles')).not.toBeInTheDocument()
    expect(screen.getByTestId('right-now')).not.toHaveTextContent('open now')
    expect(screen.getByRole('heading', { name: /Right now/ })).toHaveTextContent('Right now · Shabbos · 6 Cheshvan')
  })

  // The tiles under it shouldn't jump down when the clock arrives.
  it('before the clock is known: a placeholder its size, not nothing', () => {
    const { container } = show(null, null)
    expect(screen.queryByTestId('right-now')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })
})
