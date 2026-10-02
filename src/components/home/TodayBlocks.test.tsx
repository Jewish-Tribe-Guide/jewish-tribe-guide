// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import type { AskResult } from '@/lib/askSearch'
import type { MinyanSchedule } from '@/lib/useMinyanSchedule'
import type { ZmanimData } from '@/types'
import TodayBlocks from './TodayBlocks'
import type { CardDef } from './sections'
import type { TodayBlockId } from '@/lib/siteSettings'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The Today home's blocks for each kind of day, with the clock fixed: what
// shows, in what order, and what doesn't. Real-looking data from the guide:
// Trader Joe's with all three items, two shuls, a vegan lunch spot.
const NY = 'America/New_York'
const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours' }
const items: CategoryField = { key: 'm', label: 'Items', type: 'tags', showCountInHeader: true }
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery', detailFields: [hours, items] })
const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', detailFields: [hours] })
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
const zmanimPage = makeCategory({ id: 'zmanim', kind: 'zmanim', label: 'Zmanim', pluralLabel: 'Zmanim' })
const categories = [grocery, food, shuls, zmanimPage]
const everyDay = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '21:00' }]))
const centre = { lat: 39.9526, lng: -75.1652 }
const tj = makeListing({ id: 'tj', name: 'Trader Joe’s', category: 'grocery', geo: { lat: 39.9545, lng: -75.1614 }, hours: everyDay, m: ['Challah', 'Wine', 'Chicken'] })
const hip = makeListing({ id: 'hip', name: 'HipCityVeg', category: 'restaurant', geo: { lat: 39.9507, lng: -75.1704 }, hours: everyDay })
const mekor = makeListing({ id: 'mekor', name: 'Mekor Habracha', category: 'synagogue', geo: { lat: 39.9493, lng: -75.1662 } })
const mikveh = makeListing({ id: 'mikveh', name: 'Kahal Kadosh Mikveh Israel', category: 'synagogue', geo: { lat: 39.9513, lng: -75.1479 } })
const listings = [tj, hip, mekor, mikveh]

const week = {
  hebrewDate: '28 Tishrei 5787',
  dayOfWeek: 5,
  isFriday: true,
  isShabbos: false,
  parsha: 'Parashat Bereshit',
  dailyZmanim: [],
  shabbos: {
    candleLighting: { label: 'Friday', time: '6:12 PM', iso: '2026-10-09T18:12:00-04:00' },
    havdalah: { label: 'Saturday', time: '7:09 PM', iso: '2026-10-10T19:09:00-04:00' },
  },
} as unknown as ZmanimData

/** The schedule as useMinyanSchedule gives it, at a fixed moment: each shul
 *  with one minyan today. */
function scheduleAt(nyIso: string, day: 'tue' | 'fri' | 'sat', minyanim: Record<string, string>): MinyanSchedule {
  const next = { tue: 'wed', fri: 'sat', sat: 'sun' }[day]
  const [h, m] = nyIso.slice(11, 16).split(':').map(Number)
  return {
    now: Date.parse(nyIso),
    nowMinutes: h * 60 + m,
    todayKey: day,
    tomorrowKey: next,
    todayDayKeys: [day],
    tomorrowDayKeys: [next],
    season: null,
    anchors: {},
    linkCategoryId: 'synagogue',
    shuls: [mekor, mikveh].map((s) => ({ id: s.id, name: s.name, geo: s.geo, minyanim: minyanim[s.id] ? [{ id: `${s.id}-1`, tefillah: 'mincha', days: [day], time: minyanim[s.id] }] : [] })),
  } as unknown as MinyanSchedule
}

const openNow: { question: string; result: AskResult } = {
  question: 'Food open now',
  result: { query: { raw: 'food open now' }, hits: [{ item: hip, category: food, score: 1, matchedTags: [], matched: [], matchedFields: [], miles: null, open: true }], categoryIds: ['restaurant'], anchor: null, place: null, closedCount: 0, noHours: [], terms: [], excluded: [] } as unknown as AskResult,
}

function show(schedule: MinyanSchedule, zmanim: ZmanimData | null, onOpenListing = vi.fn(), cards: CardDef[] | null = null, hidden: TodayBlockId[] = []) {
  renderWithProviders(
    <TodayBlocks
      listings={listings}
      categories={categories}
      communitySlug="philly"
      timezone={NY}
      from={centre}
      schedule={schedule}
      zmanim={zmanim}
      items={['Challah', 'Wine', 'Chicken']}
      openNow={openNow}
      cards={cards}
      onOpenListing={onOpenListing}
      searching={false}
      hidden={hidden}
    />,
    { content: { categories } },
  )
  const home = screen.getByTestId('today-home')
  return [...home.querySelectorAll('section[data-testid]')].map((el) => el.getAttribute('data-testid'))
}

afterEach(() => cleanup())
// A visitor in Philadelphia. Whether a store is open, and whether it shuts
// before candles, is read off the device's clock, as on every page (see
// getOpenStatus and candlesToday); the rest is the community's own time.
const originalTZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = NY
})
afterAll(() => {
  process.env.TZ = originalTZ
})

describe('the Today home on a Friday afternoon', () => {
  const friday = '2026-10-09T13:30:00-04:00'

  it('the candles card, Before candles, then the next minyan; nothing “open now”', () => {
    const order = show(scheduleAt(friday, 'fri', { mikveh: '5:30pm', mekor: '7:00pm' }), week)
    expect(order).toEqual(['today-candles', 'today-before-candles', 'today-next-minyan'])
    expect(screen.getByTestId('today-candles')).toHaveTextContent(/Shabbos BereshitCandles 6:12 PMIn 4 hr 42 min · havdalah Saturday 7:09 PM/)
    expect(within(screen.getByTestId('today-candles')).getByRole('link', { name: 'Minyanim' })).toHaveAttribute('href', '/philly/synagogue?davening=1')
  })

  it('Before candles names the one store with all three, from its own list and hours', () => {
    show(scheduleAt(friday, 'fri', {}), week)
    const block = screen.getByTestId('today-before-candles')
    expect(block).toHaveTextContent('Trader Joe’s, 0.2 mi, has all three')
    expect(block).toHaveTextContent('Challah, wine and chicken · Open until 9 PM')
    expect(within(block).getByRole('link', { name: 'Other stores ›' })).toHaveAttribute('href', '/philly/grocery')
  })

  it('the next minyan, and the nearest shul’s when that’s another shul', () => {
    const open = vi.fn()
    show(scheduleAt(friday, 'fri', { mikveh: '5:30pm', mekor: '7:00pm' }), week, open)
    const block = screen.getByTestId('today-next-minyan')
    expect(block).toHaveTextContent('5:30 PMMincha · Kahal Kadosh Mikveh Israel, 0.9 mi')
    expect(block).toHaveTextContent('7 PMMincha · Mekor Habracha, 0.2 mi, the nearest')
    fireEvent.click(within(block).getByRole('button', { name: /Mekor Habracha/ }))
    expect(open).toHaveBeenCalledWith(mekor)
  })
})

describe('the Today home on Shabbos', () => {
  it('the card says when Shabbos ends; nothing to buy and nothing open', () => {
    const order = show(scheduleAt('2026-10-10T11:00:00-04:00', 'sat', { mekor: '5:59pm' }), { ...week, isShabbos: true, dayOfWeek: 6 } as ZmanimData)
    expect(order).toEqual(['today-candles', 'today-next-minyan'])
    expect(screen.getByTestId('today-candles')).toHaveTextContent('Havdalah 7:09 PM')
    expect(screen.getByTestId('today-candles')).toHaveTextContent('Shabbos ends in 8 hr 9 min')
    expect(within(screen.getByTestId('today-candles')).queryByRole('link', { name: 'Eruv' })).not.toBeInTheDocument()
  })
})

describe('the Today home on a Tuesday at lunchtime', () => {
  it('the next minyan, then lunch open now; no candles card', () => {
    const order = show(scheduleAt('2026-10-06T12:30:00-04:00', 'tue', { mikveh: '2:00pm' }), { ...week, dayOfWeek: 2, isFriday: false } as ZmanimData)
    expect(order).toEqual(['today-next-minyan', 'today-open-now'])
    const lunch = screen.getByTestId('today-open-now')
    expect(within(lunch).getByRole('heading', { name: 'Lunch, open now' })).toBeInTheDocument()
    expect(lunch).toHaveTextContent('HipCityVeg')
    expect(lunch).toHaveTextContent('Open until 9 PM')
    expect(within(lunch).getByRole('link', { name: 'All 1 ›' })).toHaveAttribute('href', '/philly/ask/food-open-now')
  })

  it('before the zmanim arrive, an ordinary day: no candles card guessed at', () => {
    const order = show(scheduleAt('2026-10-09T13:30:00-04:00', 'fri', {}), null)
    expect(order).not.toContain('today-candles')
  })
})

describe('Browse at the end', () => {
  it('a phone’s short row ends in All, to the Browse page with every category', () => {
    const card = (id: string, title: string): CardDef => ({ id, title, href: `/philly/${id}`, go: vi.fn() })
    show(scheduleAt('2026-10-06T12:30:00-04:00', 'tue', {}), null, vi.fn(), [card('restaurant', 'Food'), card('grocery', 'Grocery')])
    const row = screen.getByTestId('today-browse-row')
    expect(within(row).getByRole('link', { name: 'All ›' })).toHaveAttribute('href', '/philly/browse')
    expect(within(row).getByRole('link', { name: 'Food' })).toHaveAttribute('href', '/philly/restaurant')
  })
})

describe('blocks the admin has turned off', () => {
  it('stay off, and the rest keep the day’s order', () => {
    const order = show(scheduleAt('2026-10-09T13:30:00-04:00', 'fri', { mikveh: '5:30pm' }), week, vi.fn(), null, ['beforeCandles'])
    expect(order).toEqual(['today-candles', 'today-next-minyan'])
    const tuesday = (hidden: TodayBlockId[]) => {
      cleanup()
      return show(scheduleAt('2026-10-06T12:30:00-04:00', 'tue', { mikveh: '2:00pm' }), { ...week, dayOfWeek: 2, isFriday: false } as ZmanimData, vi.fn(), null, hidden)
    }
    expect(tuesday(['openNow'])).toEqual(['today-next-minyan'])
    expect(tuesday(['nextMinyan'])).toEqual(['today-open-now'])
  })

  it('the Today card and Browse too', () => {
    const card = (id: string, title: string): CardDef => ({ id, title, href: `/philly/${id}`, go: vi.fn() })
    show(scheduleAt('2026-10-09T13:30:00-04:00', 'fri', {}), week, vi.fn(), [card('restaurant', 'Food')], ['candles', 'browse'])
    expect(screen.queryByTestId('today-candles')).not.toBeInTheDocument()
    expect(screen.queryByTestId('today-browse-row')).not.toBeInTheDocument()
    expect(screen.queryByTestId('today-browse')).not.toBeInTheDocument()
  })
})
